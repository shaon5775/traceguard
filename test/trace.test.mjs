// Offline check of the trace engine on the demo data (no Atlassian site needed):  node test/trace.test.mjs
import assert from 'node:assert/strict';
import { buildMatrix, explainForAgent } from '../src/trace.js';
import { DEMO_ITEMS, KIND_LABEL, DEMO_VERSION } from '../src/demo.js';

// Turn demo items into the engine's issue shape, with Jira-like keys and two-way links.
const keyOf = (id) => `IPC-${DEMO_ITEMS.findIndex((i) => i.id === id) + 1}`;
const issues = DEMO_ITEMS.map((item) => ({
  key: keyOf(item.id),
  summary: item.summary,
  labels: [KIND_LABEL[item.kind], ...item.labels],
  versions: item.kind === 'req' ? [DEMO_VERSION] : [],
  linked: [],
}));
for (const item of DEMO_ITEMS) {
  for (const target of item.links || []) {
    issues.find((i) => i.key === keyOf(item.id)).linked.push(keyOf(target));
    issues.find((i) => i.key === keyOf(target)).linked.push(keyOf(item.id));
  }
}

const m = buildMatrix(issues, { version: DEMO_VERSION });
const gapsOf = (summaryStart) => m.rows.find((r) => r.summary.startsWith(summaryStart)).gaps;
const riskGapsOf = (summaryStart) => m.risks.find((r) => r.summary.startsWith(summaryStart)).gaps;

assert.deepEqual(gapsOf('Basal delivery'), []);
assert.deepEqual(gapsOf('Low battery'), ['NO_TEST']);
assert.deepEqual(gapsOf('Occlusion alarm'), ['TEST_FAILED']);
assert.deepEqual(gapsOf('Alarm if glucose'), ['TEST_NOT_RUN']);
assert.deepEqual(gapsOf('Pump locks'), ['STALE_TEST']);
assert.deepEqual(riskGapsOf('Attacker spoofs'), ['UNMITIGATED_RISK']);
assert.deepEqual(riskGapsOf('Battery dies'), ['RISK_VIA_UNVERIFIED']);
assert.deepEqual(riskGapsOf('Over-delivery'), []);
assert.equal(m.summary.requirements, 8);
assert.equal(m.summary.verified, 4);
assert.equal(m.summary.coveragePercent, 50);
assert.equal(m.summary.releaseReady, false);

console.log(explainForAgent(m, { project: 'IPC', version: DEMO_VERSION }));
console.log('\nAll trace engine checks passed.');
