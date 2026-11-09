"""Make the demo-video voice-over with Gemini text-to-speech (free tier).

Run in Colab after loading GEMINI_API_KEY into the environment:
    !pip -q install google-genai
    !python video/make_voice.py [voice_name]
Writes /content/voice/<scene>.wav, one file per scene, plus traceguard_voiceover.wav (all scenes with short gaps)
and prints each file's length and a transcript check.
"""
import io
import json
import os
import re
import sys
import time
import wave
from pathlib import Path

from google import genai
from google.genai import types

HERE = Path(__file__).parent
OUT = Path("/content/voice")
VOICE = sys.argv[1] if len(sys.argv) > 1 else "Charon"
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def pick_tts_model():
    names = [m.name.split("/")[-1] for m in client.models.list() if "tts" in m.name]
    # prefer non-lite "pro"/"flash" speech models, newest first
    names.sort(key=lambda n: (("pro" in n) * 2 + ("lite" not in n), n), reverse=True)
    print("TTS models available:", ", ".join(names) or "none")
    return names


def retry(call, tries=5):
    for attempt in range(tries):
        try:
            return call()
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if attempt == tries - 1 or not any(c in msg for c in ("429", "RESOURCE_EXHAUSTED", "503", "504", "UNAVAILABLE", "DEADLINE")):
                raise
            wait = 20 * (attempt + 1)
            print(f"  busy / rate-limited, waiting {wait}s")
            time.sleep(wait)


def to_wav(data, mime):
    if mime.startswith("audio/wav"):
        return data
    rate = int(re.search(r"rate=(\d+)", mime).group(1)) if "rate=" in mime else 24000
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data)
    return buf.getvalue()


def speak(model, style, text):
    resp = retry(lambda: client.models.generate_content(
        model=model,
        contents=f"{style}\n\n{text}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)))),
    ))
    part = resp.candidates[0].content.parts[0]
    return to_wav(part.inline_data.data, (part.inline_data.mime_type or "").lower())


def seconds(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes)) as w:
        return w.getnframes() / w.getframerate()


def main():
    lines = json.loads((HERE / "voice_lines.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    models = pick_tts_model()
    model, total = None, 0.0
    for scene in lines["scenes"]:
        target = OUT / f"{scene['id']}.wav"
        if target.exists():
            audio = target.read_bytes()
        else:
            for m in ([model] if model else models):
                try:
                    audio = speak(m, lines["style"], scene["text"])
                    model = m
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"  {m} failed: {str(e)[:150]}")
            else:
                raise SystemExit("No text-to-speech model worked.")
            target.write_bytes(audio)
            time.sleep(6)  # stay under the free-tier rate limit
        total += seconds(audio)
        print(f"{scene['id']}: {seconds(audio):5.1f} s  (model {model}, voice {VOICE})")

    # one combined file with 0.8 s of silence between scenes
    frames, rate = [], None
    for scene in lines["scenes"]:
        with wave.open(str(OUT / f"{scene['id']}.wav")) as w:
            rate = w.getframerate()
            frames.append(w.readframes(w.getnframes()))
    gap = b"\x00\x00" * int(rate * 0.8)
    with wave.open(str(OUT / "traceguard_voiceover.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(gap.join(frames))
    print(f"TOTAL speech {total:.0f} s (+ gaps) -> {OUT / 'traceguard_voiceover.wav'}")

    # check: transcribe scene 1 back to text, to confirm the words are right
    first = OUT / f"{lines['scenes'][0]['id']}.wav"
    try:
        r = retry(lambda: client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=[types.Part.from_bytes(data=first.read_bytes(), mime_type="audio/wav"),
                      "Transcribe this English speech word for word. Then on a new line starting ACCENT:, describe the speaker's accent in a few words."]))
        print("CHECK scene 1:\n" + (r.text or "").strip())
    except Exception as e:  # noqa: BLE001
        print("transcript check skipped:", str(e)[:150])


if __name__ == "__main__":
    main()
