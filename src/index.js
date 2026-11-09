/**
 * TraceGuard Rovo actions.
 *
 * Every action runs as the person chatting with the agent (api.asUser()), so Jira and Confluence permission
 * checks apply to them: TraceGuard can only read or change what that person could read or change.
 *
 * Actions (declared in manifest.yml):
 *   loadDemoProject        create the "Insulin Pump Controller" demo project with requirements, tests, risks
 *   getTraceability        build the requirement -> test -> risk matrix and list every gap
 *   checkReleaseReadiness  the same matrix, framed as a go / no-go answer for one release
 *   publishAuditReport     write the matrix as an audit-ready page in Confluence and return its link
 */
import api, { route } from '@forge/api';
import { buildMatrix, explainForAgent, normaliseJiraIssues, GAPS } from './trace.js';
import { DEMO_PROJECT, DEMO_VERSION, DEMO_ITEMS, KIND_LABEL } from './demo.js';

// ---------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------

/** Call a Jira REST API as the current user and return parsed JSON (throws a readable error). */
async function jira(path, options = {}) {
  const res = await api.asUser().requestJira(path, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jira ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Call a Confluence REST API as the current user and return parsed JSON. */
async function confluence(path, options = {}) {
  const res = await api.asUser().requestConfluence(path, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Confluence ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Rovo may pass inputs in payload directly; take a clean, upper-case project key. */
function projectKeyFrom(payload) {
  return String((payload && payload.projectKey) || DEMO_PROJECT.key).trim().toUpperCase();
}

/** Read every TraceGuard issue (requirements, tests, risks) of a project, following pagination. */
async function fetchTraceIssues(projectKey) {
  const issues = [];
  let nextPageToken;
  do {
    const page = await jira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: JSON.stringify({
        jql: `project = "${projectKey}" AND labels in (tg-req, tg-test, tg-risk) ORDER BY key ASC`,
        fields: ['summary', 'labels', 'updated', 'status', 'issuelinks', 'fixVersions'],
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);
  return normaliseJiraIssues(issues);
}

async function matrixFor(payload) {
  const projectKey = projectKeyFrom(payload);
  const version = payload && payload.version ? String(payload.version).trim() : undefined;
  const issues = await fetchTraceIssues(projectKey);
  return { projectKey, version, issues, matrix: buildMatrix(issues, { version }) };
}

/** Escape text for Confluence storage format (XHTML). */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------------
// Action: getTraceability
// ---------------------------------------------------------------------------------------------------
export async function getTraceability(payload) {
  try {
    const { projectKey, version, issues, matrix } = await matrixFor(payload);
    if (issues.length === 0) {
      return `No TraceGuard items found in project ${projectKey}. Items need the labels tg-req, tg-test or tg-risk. ` +
        'You can ask me to load the demo project to try TraceGuard.';
    }
    return explainForAgent(matrix, { project: projectKey, version });
  } catch (e) {
    return `TraceGuard could not read the project: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------------------------------
// Action: checkReleaseReadiness
// ---------------------------------------------------------------------------------------------------
export async function checkReleaseReadiness(payload) {
  try {
    const { projectKey, version, matrix } = await matrixFor(payload);
    const s = matrix.summary;
    const verdict = s.releaseReady
      ? 'GO: every requirement is verified and no high-severity risk is open.'
      : 'NO-GO: the release has open verification or risk gaps (listed below).';
    return `Release readiness check for ${projectKey}${version ? ` ${version}` : ''}.\n${verdict}\n\n` +
      explainForAgent(matrix, { project: projectKey, version }) +
      '\n\nNote: TraceGuard is decision support for the quality team; the formal release decision stays with them.';
  } catch (e) {
    return `TraceGuard could not check the release: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------------------------------
// Action: publishAuditReport
// ---------------------------------------------------------------------------------------------------
const REPORT_SPACE = { key: 'TGAUDIT', name: 'TraceGuard Audit Reports' };

async function ensureReportSpace(spaceKey) {
  const found = await confluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
  if (found.results && found.results.length) return found.results[0];
  if (spaceKey !== REPORT_SPACE.key) throw new Error(`Confluence space ${spaceKey} was not found`);
  await confluence(route`/wiki/rest/api/space`, {
    method: 'POST',
    body: JSON.stringify({ key: REPORT_SPACE.key, name: REPORT_SPACE.name }),
  });
  const created = await confluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
  return created.results[0];
}

function reportHtml(projectKey, version, matrix, jiraBase) {
  const s = matrix.summary;
  const link = (key) => (jiraBase ? `<a href="${esc(jiraBase)}/browse/${esc(key)}">${esc(key)}</a>` : esc(key));
  const lozenge = (ok) =>
    `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${ok ? 'Green' : 'Red'}</ac:parameter>` +
    `<ac:parameter ac:name="title">${ok ? 'VERIFIED' : 'GAP'}</ac:parameter></ac:structured-macro>`;
  const resultText = { pass: 'passed', fail: 'FAILED', 'not-run': 'not run' };

  const reqRows = matrix.rows.map((r) => `<tr>
      <td>${link(r.key)}</td><td>${esc(r.summary)}</td>
      <td>${r.tests.map((t) => `${link(t.key)} (${resultText[t.result]})`).join('<br/>') || '<em>none</em>'}</td>
      <td>${r.risks.map((k) => `${link(k.key)} [${esc(k.severity)}]`).join('<br/>') || '-'}</td>
      <td>${lozenge(r.verified)}${r.gaps.map((g) => `<br/>${esc(GAPS[g])}`).join('')}</td></tr>`).join('');

  const riskRows = matrix.risks.map((k) => `<tr>
      <td>${link(k.key)}</td><td>${esc(k.summary)}</td><td>${esc(k.severity)}</td>
      <td>${k.mitigatedBy.map(link).join(', ') || '<em>none</em>'}</td>
      <td>${lozenge(k.gaps.length === 0)}${k.gaps.map((g) => `<br/>${esc(GAPS[g])}`).join('')}</td></tr>`).join('');

  return `
    <p><strong>Project:</strong> ${esc(projectKey)}${version ? ` &nbsp; <strong>Release:</strong> ${esc(version)}` : ''}
       &nbsp; <strong>Generated:</strong> ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC by TraceGuard</p>
    <ac:structured-macro ac:name="${s.releaseReady ? 'tip' : 'warning'}"><ac:rich-text-body>
      <p><strong>Release verdict: ${s.releaseReady ? 'GO' : 'NO-GO'}.</strong>
      ${s.verified} of ${s.requirements} requirements verified (${s.coveragePercent}%).
      Tests: ${s.testsPassed} passed, ${s.testsFailed} failed of ${s.tests}.
      Risks with open gaps: ${s.risksOpen} of ${s.risks} (${s.highRisksOpen} high severity).</p>
    </ac:rich-text-body></ac:structured-macro>
    <h2>Requirement traceability matrix</h2>
    <table><tbody><tr><th>Requirement</th><th>Summary</th><th>Verified by</th><th>Mitigates</th><th>Status</th></tr>${reqRows}</tbody></table>
    <h2>Risk control coverage</h2>
    <table><tbody><tr><th>Risk</th><th>Hazard</th><th>Severity</th><th>Mitigated by</th><th>Status</th></tr>${riskRows}</tbody></table>
    <p><em>TraceGuard is decision support. The quality / regulatory team owns the release decision.</em></p>`;
}

export async function publishAuditReport(payload) {
  try {
    const { projectKey, version, issues, matrix } = await matrixFor(payload);
    if (issues.length === 0) return `No TraceGuard items in project ${projectKey}; nothing to report.`;
    const spaceKey = String((payload && payload.spaceKey) || REPORT_SPACE.key).trim().toUpperCase();
    const space = await ensureReportSpace(spaceKey);

    // Jira link base for clickable keys in the report.
    const server = await jira(route`/rest/api/3/serverInfo`).catch(() => ({}));
    const title = `Traceability audit – ${projectKey}${version ? ` ${version}` : ''} – ` +
      new Date().toISOString().slice(0, 16).replace('T', ' ');
    const page = await confluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      body: JSON.stringify({
        spaceId: space.id,
        status: 'current',
        title,
        body: { representation: 'storage', value: reportHtml(projectKey, version, matrix, server.baseUrl) },
      }),
    });
    const url = page._links ? `${page._links.base || ''}${page._links.webui || ''}` : '';
    const s = matrix.summary;
    return `Audit report published to Confluence space ${spaceKey}: "${title}". ${url}\n` +
      `Verdict: ${s.releaseReady ? 'GO' : 'NO-GO'}; ${s.verified}/${s.requirements} requirements verified; ` +
      `${s.risksOpen} risks with open gaps.`;
  } catch (e) {
    return `TraceGuard could not publish the report: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------------------------------
// Action: loadDemoProject
// ---------------------------------------------------------------------------------------------------
async function ensureDemoProject() {
  try {
    return await jira(route`/rest/api/3/project/${DEMO_PROJECT.key}`);
  } catch (e) {
    if (!String(e.message).includes('404')) throw e;
  }
  const me = await jira(route`/rest/api/3/myself`);
  await jira(route`/rest/api/3/project`, {
    method: 'POST',
    body: JSON.stringify({
      key: DEMO_PROJECT.key,
      name: DEMO_PROJECT.name,
      projectTypeKey: 'software',
      projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
      leadAccountId: me.accountId,
      description: 'TraceGuard demo: insulin pump controller firmware (synthetic data).',
    }),
  });
  return jira(route`/rest/api/3/project/${DEMO_PROJECT.key}`);
}

async function ensureVersion(project) {
  const versions = await jira(route`/rest/api/3/project/${project.key}/versions`);
  if (versions.some((v) => v.name === DEMO_VERSION)) return;
  await jira(route`/rest/api/3/version`, {
    method: 'POST',
    body: JSON.stringify({ name: DEMO_VERSION, projectId: Number(project.id) }),
  });
}

export async function loadDemoProject() {
  try {
    const project = await ensureDemoProject();
    const existing = await fetchTraceIssues(project.key);
    if (existing.length > 0) {
      return `The demo project ${project.key} (${project.name}) already has ${existing.length} TraceGuard items. ` +
        'Ask me for its traceability or release readiness.';
    }
    await ensureVersion(project);

    // Create all issues in one bulk call (Jira allows up to 50 per call; the demo has 21).
    const bulk = await jira(route`/rest/api/3/issue/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        issueUpdates: DEMO_ITEMS.map((item) => ({
          fields: {
            project: { key: project.key },
            issuetype: { name: 'Task' },
            summary: item.summary,
            labels: [KIND_LABEL[item.kind], ...item.labels],
            ...(item.kind === 'req' ? { fixVersions: [{ name: DEMO_VERSION }] } : {}),
          },
        })),
      }),
    });
    if (bulk.errors && bulk.errors.length) throw new Error(JSON.stringify(bulk.errors).slice(0, 300));
    const keyOf = new Map(DEMO_ITEMS.map((item, i) => [item.id, bulk.issues[i].key]));

    // Link tests and risks to their requirements ("Relates" exists on every Jira site).
    let links = 0;
    for (const item of DEMO_ITEMS) {
      for (const target of item.links || []) {
        await jira(route`/rest/api/3/issueLink`, {
          method: 'POST',
          body: JSON.stringify({
            type: { name: 'Relates' },
            outwardIssue: { key: keyOf.get(item.id) },
            inwardIssue: { key: keyOf.get(target) },
          }),
        });
        links += 1;
      }
    }
    return `Demo project ${project.key} "${project.name}" is ready: ${DEMO_ITEMS.length} items ` +
      `(8 requirements, 8 tests, 5 risks) and ${links} trace links, release ${DEMO_VERSION}. ` +
      'It contains deliberate gaps. Ask me "Is IPC v2.1 ready to release?"';
  } catch (e) {
    return `TraceGuard could not create the demo project: ${e.message}`;
  }
}
