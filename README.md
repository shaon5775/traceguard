# TraceGuard

**Audit-ready traceability for regulated software teams, inside Jira and Confluence.**
Built on Atlassian Forge with a Rovo agent, for Codegeist 2026 (Apps for Specialized Industries).

Teams that build safety-critical software (medical devices under IEC 62304 / ISO 14971, automotive under
ISO 26262, pharma GxP) must prove that every requirement is verified by a passing test and every risk is
controlled by a verified requirement. Today that "traceability matrix" is a spreadsheet someone rebuilds by
hand before each release or audit, and gaps are found too late.

TraceGuard reads the links your team already keeps in Jira and answers in seconds:

- **"Is v2.1 ready to release?"** A go / no-go verdict with every blocking gap.
- **"Show me the gaps."** Requirements with no test, failed or not-run tests, requirements changed after they
  were tested, risks with no control, risks controlled only by unverified requirements.
- **"Publish an audit report."** A Confluence page with the full traceability matrix and risk control coverage,
  with links back to every Jira issue.

## How it works

| Piece | What it does |
|---|---|
| `src/trace.js` | Pure trace engine: builds the requirement -> test -> risk matrix and finds 6 kinds of gap |
| `src/index.js` | Rovo actions: get-traceability, check-release-readiness, publish-audit-report, load-demo-project |
| `src/demo.js` | Synthetic demo project "Insulin Pump Controller" (8 requirements, 8 tests, 5 risks, deliberate gaps) |
| `manifest.yml` | Rovo agent "TraceGuard", its 4 actions and the scopes |

Data model (works on any Jira site, no custom fields): labels `tg-req`, `tg-test`, `tg-risk`; test results
`tg-pass` / `tg-fail`; `tg-changed` for a requirement edited after testing; severity `tg-sev-high|medium|low`;
ordinary Jira issue links connect tests and risks to requirements. All calls run `asUser()`, so TraceGuard
only sees what the person asking can see.

## Try it

1. Install TraceGuard on your site (installation link in the Devpost submission).
2. Open Rovo chat, pick the **TraceGuard** agent, and say **"Load the TraceGuard demo project"**.
3. Ask **"Is IPC v2.1 ready to release?"**, then **"Publish an audit report for IPC v2.1"**.

## Develop

```
npm install
npm test                       # offline check of the trace engine on the demo data
forge deploy --non-interactive -e development
forge install --non-interactive --site <your-site>.atlassian.net --product jira --environment development
```

TraceGuard is decision support; the release decision stays with the quality / regulatory team.
The demo data is synthetic.
