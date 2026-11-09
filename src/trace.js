/**
 * TraceGuard trace engine (pure logic, no Forge calls, so it can be tested on a laptop).
 *
 * The data model on purpose uses only things every Jira site has:
 *   - Issues labelled  tg-req   = requirements
 *                      tg-test  = verification tests
 *                      tg-risk  = hazards / risks
 *   - Test result labels: tg-pass, tg-fail (no result label = not run yet)
 *   - Requirement changed after it was verified: label tg-changed
 *   - Jira issue links (any link type, e.g. "Relates") connect tests and risks to requirements.
 *
 * buildMatrix(issues) returns one row per requirement with its tests, risks and gap list, plus the
 * risks that no requirement mitigates, and summary numbers for charts and the release verdict.
 */

export const LABELS = { req: 'tg-req', test: 'tg-test', risk: 'tg-risk', pass: 'tg-pass', fail: 'tg-fail', changed: 'tg-changed' };

/** Gap codes, with a plain-language explanation that the agent and the report reuse. */
export const GAPS = {
  NO_TEST: 'No test verifies this requirement',
  TEST_FAILED: 'A linked test failed',
  TEST_NOT_RUN: 'A linked test has not been run',
  STALE_TEST: 'Requirement changed after it was tested; tests must be re-run',
  UNMITIGATED_RISK: 'Risk is not mitigated by any requirement',
  RISK_VIA_UNVERIFIED: 'Risk is mitigated only by requirements that are not yet verified',
};

/** Which TraceGuard kind an issue is, from its labels (null if it is not part of the trace). */
export function kindOf(issue) {
  const labels = issue.labels || [];
  if (labels.includes(LABELS.req)) return 'req';
  if (labels.includes(LABELS.test)) return 'test';
  if (labels.includes(LABELS.risk)) return 'risk';
  return null;
}

/** Test result from its labels: 'pass', 'fail' or 'not-run'. */
export function testResult(test) {
  const labels = test.labels || [];
  if (labels.includes(LABELS.fail)) return 'fail';
  if (labels.includes(LABELS.pass)) return 'pass';
  return 'not-run';
}

/** Risk severity read from a label like "tg-sev-high" (defaults to "medium"). */
export function riskSeverity(risk) {
  const label = (risk.labels || []).find((l) => l.startsWith('tg-sev-'));
  return label ? label.replace('tg-sev-', '') : 'medium';
}

/**
 * Turn Jira search results into the simple shape the engine uses.
 * Each Jira issue: { key, fields: { summary, labels, updated, status, issuelinks, fixVersions } }.
 */
export function normaliseJiraIssues(jiraIssues) {
  return jiraIssues.map((issue) => {
    const f = issue.fields || {};
    const linked = (f.issuelinks || [])
      .map((link) => (link.outwardIssue || link.inwardIssue || {}).key)
      .filter(Boolean);
    return {
      key: issue.key,
      summary: f.summary || '',
      labels: f.labels || [],
      updated: f.updated || null,
      status: (f.status && f.status.name) || '',
      versions: (f.fixVersions || []).map((v) => v.name),
      linked,
    };
  });
}

/**
 * Build the traceability matrix.
 * @param {Array} issues normalised issues (see normaliseJiraIssues)
 * @param {Object} [options] { version: only requirements in this fix version }
 */
export function buildMatrix(issues, options = {}) {
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const linkedOf = (issue, kind) =>
    (issue.linked || []).map((k) => byKey.get(k)).filter((i) => i && kindOf(i) === kind);

  let requirements = issues.filter((i) => kindOf(i) === 'req');
  if (options.version) requirements = requirements.filter((r) => (r.versions || []).includes(options.version));

  const rows = requirements.map((req) => {
    const tests = linkedOf(req, 'test');
    // Links are stored on both ends in Jira, but be safe: also look for tests/risks that point at this req.
    for (const other of issues) {
      if ((other.linked || []).includes(req.key)) {
        if (kindOf(other) === 'test' && !tests.includes(other)) tests.push(other);
      }
    }
    const risks = issues.filter(
      (i) => kindOf(i) === 'risk' && ((i.linked || []).includes(req.key) || (req.linked || []).includes(i.key)),
    );

    const gaps = [];
    if (tests.length === 0) gaps.push('NO_TEST');
    if (tests.some((t) => testResult(t) === 'fail')) gaps.push('TEST_FAILED');
    if (tests.some((t) => testResult(t) === 'not-run')) gaps.push('TEST_NOT_RUN');
    // A requirement edited after verification needs its tests re-run. The tg-changed label marks this
    // (set by a person, or later by an automation rule when the requirement description is edited).
    if (tests.length > 0 && (req.labels || []).includes(LABELS.changed)) gaps.push('STALE_TEST');

    const verified = gaps.length === 0;
    return {
      key: req.key,
      summary: req.summary,
      versions: req.versions || [],
      tests: tests.map((t) => ({ key: t.key, summary: t.summary, result: testResult(t) })),
      risks: risks.map((r) => ({ key: r.key, summary: r.summary, severity: riskSeverity(r) })),
      gaps,
      verified,
    };
  });

  // Risks: which requirements mitigate each one, and is that mitigation verified?
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const allRisks = issues.filter((i) => kindOf(i) === 'risk');
  const risks = allRisks.map((risk) => {
    const mitigatedBy = rows.filter((r) => r.risks.some((x) => x.key === risk.key)).map((r) => r.key);
    const gaps = [];
    if (mitigatedBy.length === 0) gaps.push('UNMITIGATED_RISK');
    else if (!mitigatedBy.some((k) => rowByKey.get(k).verified)) gaps.push('RISK_VIA_UNVERIFIED');
    return { key: risk.key, summary: risk.summary, severity: riskSeverity(risk), mitigatedBy, gaps };
  });

  const verifiedCount = rows.filter((r) => r.verified).length;
  const openRiskGaps = risks.filter((r) => r.gaps.length > 0);
  const highOpen = openRiskGaps.filter((r) => r.severity === 'high');
  const summary = {
    requirements: rows.length,
    verified: verifiedCount,
    coveragePercent: rows.length ? Math.round((100 * verifiedCount) / rows.length) : 0,
    tests: issues.filter((i) => kindOf(i) === 'test').length,
    testsPassed: issues.filter((i) => kindOf(i) === 'test' && testResult(i) === 'pass').length,
    testsFailed: issues.filter((i) => kindOf(i) === 'test' && testResult(i) === 'fail').length,
    risks: risks.length,
    risksOpen: openRiskGaps.length,
    highRisksOpen: highOpen.length,
    gapCounts: countGaps(rows, risks),
  };
  // Release rule (simple, explainable): every requirement verified AND no open high-severity risk.
  summary.releaseReady = summary.verified === summary.requirements && summary.requirements > 0 && highOpen.length === 0;
  return { rows, risks, summary };
}

function countGaps(rows, risks) {
  const counts = {};
  for (const item of [...rows, ...risks]) for (const g of item.gaps) counts[g] = (counts[g] || 0) + 1;
  return counts;
}

/**
 * Everything the Jira project page shows, in one plain object.
 * requestedVersion: undefined = pick the newest release automatically, '' = all requirements, else a release name.
 */
export function pageModel(issues, requestedVersion) {
  const versions = [...new Set(issues.filter((i) => kindOf(i) === 'req').flatMap((i) => i.versions || []))].sort();
  const version =
    requestedVersion === undefined || requestedVersion === null
      ? versions[versions.length - 1] || ''
      : String(requestedVersion);
  const matrix = buildMatrix(issues, { version: version || undefined });
  const withText = (item) => ({ ...item, gapText: item.gaps.map((g) => GAPS[g]) });
  return {
    version,
    versions,
    summary: matrix.summary,
    rows: matrix.rows.map(withText),
    risks: matrix.risks.map(withText),
  };
}

/** Short plain-text explanation of the matrix for the Rovo agent (it rewrites it for the user). */
export function explainForAgent(matrix, { project, version } = {}) {
  const s = matrix.summary;
  const lines = [];
  lines.push(`Traceability for project ${project}${version ? `, release ${version}` : ''}:`);
  lines.push(`${s.verified} of ${s.requirements} requirements fully verified (${s.coveragePercent}% coverage).`);
  lines.push(`Tests: ${s.tests} total, ${s.testsPassed} passed, ${s.testsFailed} failed.`);
  lines.push(`Risks: ${s.risks} total, ${s.risksOpen} with open gaps (${s.highRisksOpen} high severity).`);
  lines.push(`Release ready: ${s.releaseReady ? 'YES' : 'NO'}.`);
  const gapRows = matrix.rows.filter((r) => r.gaps.length);
  if (gapRows.length) {
    lines.push('Requirement gaps:');
    for (const r of gapRows) lines.push(`- ${r.key} "${r.summary}": ${r.gaps.map((g) => GAPS[g]).join('; ')}`);
  }
  const riskGaps = matrix.risks.filter((r) => r.gaps.length);
  if (riskGaps.length) {
    lines.push('Risk gaps:');
    for (const r of riskGaps) lines.push(`- ${r.key} [${r.severity}] "${r.summary}": ${r.gaps.map((g) => GAPS[g]).join('; ')}`);
  }
  return lines.join('\n');
}

