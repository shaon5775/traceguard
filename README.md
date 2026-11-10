# TraceGuard

**Audit-ready traceability for regulated software teams, inside Jira, Rovo and Confluence.**
A Forge app with a Rovo agent, built for Codegeist 2026 (Apps for Specialized Industries).

Teams that build safety-critical software (medical devices under IEC 62304 / ISO 14971, automotive under
ISO 26262, pharma GxP) must prove before every release that each requirement is verified by a passing test and
each risk is controlled by a verified requirement. Today that "traceability matrix" is a spreadsheet someone
rebuilds by hand before each release or audit, and the gaps are found too late.

TraceGuard reads the links your team already keeps in Jira and answers in seconds:

- **"Is v2.1 ready to release?"** A GO / NO-GO verdict with every blocking gap and the next step for each.
- **"Show me the gaps."** Requirements with no test, failed or not-run tests, requirements changed after they
  were tested, risks with no control, and risks controlled only by unverified requirements.
- **"Publish an audit report."** A Confluence page with the verdict, the full traceability matrix and risk control
  coverage, with links back to every Jira issue.

## Where you see it

| Place | What it shows |
|---|---|
| **Rovo chat → TraceGuard agent** | Ask in plain English; the agent calls TraceGuard's actions and explains the result |
| **Jira project → TraceGuard tab** | Red/green verdict box, 6 key numbers, requirement matrix, risk table, release picker, Refresh and **Publish audit report** buttons |
| **Confluence → "TraceGuard Audit Reports" space** | Dated audit pages with the verdict, matrix and risk tables |
| **Any MCP client (Rovo Studio agents, Claude, Cursor, …)** | The same checks as MCP tools through the Rovo MCP server (`rovo:mcp` module): `get-traceability`, `check-release-readiness`, `publish-audit-report` |

**MCP setup (optional):** a site/org admin enables external MCP access for TraceGuard in Atlassian Administration;
then connect your MCP client to `https://mcp.atlassian.com/forge/a4a15020-c013-491b-9a66-00c2ed70623c` (OAuth 2.1).
Tools run as the signed-in user, with that user's permissions. (Rovo MCP is in Preview.)

## How it works

| Piece | What it does |
|---|---|
| `src/trace.js` | Pure trace engine: builds the requirement → test → risk matrix, finds 6 kinds of gap, gives the release verdict (`buildMatrix`, `pageModel`, `explainForAgent`) |
| `src/index.js` | Rovo actions: `get-traceability`, `check-release-readiness`, `publish-audit-report`, `load-demo-project` |
| `src/resolvers.js` | Backend for the Jira page (`getMatrix`, `publish`) |
| `src/page.jsx` | The Jira project page, built with Forge UI Kit (`@forge/react`) |
| `src/demo.js` | Synthetic demo project "Insulin Pump Controller" (8 requirements, 8 tests, 5 risks, deliberate gaps) |
| `manifest.yml` | Rovo agent, 4 actions, the `rovo:mcp` server (3 actions as MCP tools), the `jira:projectPage` module and the scopes |
| `test/trace.test.mjs` | Offline test of the engine and the page model on the demo data |

**Data model (works on any Jira site, no custom fields):** labels `tg-req`, `tg-test`, `tg-risk`; test results
`tg-pass` / `tg-fail` (no result label = not run); `tg-changed` for a requirement edited after testing; risk
severity `tg-sev-high|medium|low`; ordinary Jira issue links connect tests and risks to requirements.

**Release rule (simple and explainable):** GO only when every requirement in the release is verified by a passing,
up-to-date test **and** no high-severity risk is left without a verified control.

**Security:** every Jira and Confluence call runs `asUser()`, so TraceGuard only sees and changes what the person
using it is allowed to. The app runs on Atlassian (Forge), with no external servers and no data leaving Atlassian.

## Try it

1. Install TraceGuard on your Atlassian site (installation link in the Devpost submission).
2. Open **Rovo chat**, pick the **TraceGuard** agent and say **"Load the TraceGuard demo project"**.
   This creates the Jira project **IPC** (Insulin Pump Controller) with release **v2.1**.
3. Ask **"Is IPC v2.1 ready to release?"**: the answer is **NO-GO** (4 of 8 requirements verified, 3 high risks open).
4. Open the IPC project → **TraceGuard** tab to see the matrix, then click **Publish audit report**.
5. Fix a gap in Jira (for example change test IPC-12 from `tg-fail` to `tg-pass`), click **Refresh**, and watch the
   numbers move. When every gap is closed the verdict turns **GO**.

## Develop

```
npm install
npm test                                   # offline check of the trace engine and page model
forge deploy --non-interactive -e development
forge install --non-interactive --site <your-site>.atlassian.net --product jira --environment development
forge install --non-interactive --site <your-site>.atlassian.net --product confluence --environment development
```

TraceGuard is decision support; the release decision stays with the quality / regulatory team.
The demo data is synthetic.

License: MIT.
