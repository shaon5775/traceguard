/**
 * Demo project for TraceGuard: firmware for an insulin pump controller (a Class C medical-device software
 * item in IEC 62304 terms, with ISO 14971-style risks). It is synthetic, written for the demo, and has
 * deliberate gaps so the agent has something real to find:
 *   - REQ "Low battery warning" has no test                       -> NO_TEST
 *   - REQ "Occlusion alarm" has a failed test                     -> TEST_FAILED
 *   - REQ "Sensor signal loss alarm" has a test not yet run       -> TEST_NOT_RUN
 *   - REQ "PIN lock" was changed after it was tested              -> STALE_TEST
 *   - RISK "Bluetooth spoofing" has no mitigating requirement     -> UNMITIGATED_RISK
 *   - RISK "Battery dies during delivery" is mitigated only by the untested requirement -> RISK_VIA_UNVERIFIED
 *
 * Items refer to each other by short local ids (R1, T1, K1); the loader turns them into Jira keys.
 */

export const DEMO_PROJECT = { key: 'IPC', name: 'Insulin Pump Controller' };
export const DEMO_VERSION = 'v2.1';

export const DEMO_ITEMS = [
  // Requirements (tg-req)
  { id: 'R1', kind: 'req', summary: 'Basal delivery rate accurate within ±5%', labels: [] },
  { id: 'R2', kind: 'req', summary: 'Single bolus dose limited to 25 units', labels: [] },
  { id: 'R3', kind: 'req', summary: 'Occlusion alarm raised before 3 units are missed', labels: [] },
  { id: 'R4', kind: 'req', summary: 'Low battery warning shown at 10% charge', labels: [] },
  { id: 'R5', kind: 'req', summary: 'Alarm if glucose sensor signal is lost for 20 minutes', labels: [] },
  { id: 'R6', kind: 'req', summary: 'Every dose change is written to a tamper-evident audit log', labels: [] },
  { id: 'R7', kind: 'req', summary: 'Pump locks after 3 wrong PIN attempts', labels: ['tg-changed'] },
  { id: 'R8', kind: 'req', summary: 'New Bluetooth device pairing needs on-pump confirmation', labels: [] },

  // Tests (tg-test) with results
  { id: 'T1', kind: 'test', summary: 'Bench test: basal rate at 0.1 / 1 / 5 U/h over 24 h', labels: ['tg-pass'], links: ['R1'] },
  { id: 'T2', kind: 'test', summary: 'Rate accuracy after 1,000 hours of motor wear', labels: ['tg-pass'], links: ['R1'] },
  { id: 'T3', kind: 'test', summary: 'Bolus of 30 U is refused with an error', labels: ['tg-pass'], links: ['R2'] },
  { id: 'T4', kind: 'test', summary: 'Simulated tube occlusion triggers the alarm in time', labels: ['tg-fail'], links: ['R3'] },
  { id: 'T5', kind: 'test', summary: 'Sensor disconnected for 20 minutes raises an alarm', labels: [], links: ['R5'] },
  { id: 'T6', kind: 'test', summary: 'Audit log entry created and hash-chained for each dose change', labels: ['tg-pass'], links: ['R6'] },
  { id: 'T7', kind: 'test', summary: 'Three wrong PINs lock the pump for 15 minutes', labels: ['tg-pass'], links: ['R7'] },
  { id: 'T8', kind: 'test', summary: 'Pairing request is ignored until the user confirms on the pump', labels: ['tg-pass'], links: ['R8'] },

  // Risks (tg-risk) with severity
  { id: 'K1', kind: 'risk', summary: 'Over-delivery of insulin causes hypoglycaemia', labels: ['tg-sev-high'], links: ['R1', 'R2'] },
  { id: 'K2', kind: 'risk', summary: 'Blocked tube goes unnoticed, causing hyperglycaemia', labels: ['tg-sev-high'], links: ['R3'] },
  { id: 'K3', kind: 'risk', summary: 'Unauthorised person changes the dose', labels: ['tg-sev-medium'], links: ['R7', 'R6'] },
  { id: 'K4', kind: 'risk', summary: 'Battery dies during a delivery without warning', labels: ['tg-sev-high'], links: ['R4'] },
  { id: 'K5', kind: 'risk', summary: 'Attacker spoofs the Bluetooth controller app', labels: ['tg-sev-high'], links: [] },
];

/** Labels each kind always carries. */
export const KIND_LABEL = { req: 'tg-req', test: 'tg-test', risk: 'tg-risk' };
