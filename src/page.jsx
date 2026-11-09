/**
 * TraceGuard Jira project page: release verdict, numbers, requirement matrix and risk coverage,
 * plus a button that publishes the Confluence audit report.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  DynamicTable,
  Heading,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const RESULT = {
  pass: { text: 'passed', look: 'success' },
  fail: { text: 'FAILED', look: 'removed' },
  'not-run': { text: 'not run', look: 'moved' },
};
const SEVERITY_LOOK = { high: 'removed', medium: 'moved', low: 'default' };

const IssueLink = ({ id }) => (
  <Link href={`/browse/${id}`} openNewTab>
    {id}
  </Link>
);

const Status = ({ ok, gapText }) => (
  <Stack space="space.050">
    <Lozenge appearance={ok ? 'success' : 'removed'}>{ok ? 'Verified' : 'Gap'}</Lozenge>
    {gapText.map((g) => (
      <Text key={g}>{g}</Text>
    ))}
  </Stack>
);

const Stat = ({ label, value }) => (
  <Stack space="space.050">
    <Heading size="large">{String(value)}</Heading>
    <Text>{label}</Text>
  </Stack>
);

function requirementTable(rows) {
  return {
    head: {
      cells: [
        { key: 'req', content: 'Requirement', width: 9 },
        { key: 'summary', content: 'Summary', width: 27 },
        { key: 'tests', content: 'Verified by', width: 18 },
        { key: 'risks', content: 'Controls risk', width: 16 },
        { key: 'status', content: 'Status', width: 30 },
      ],
    },
    rows: rows.map((r) => ({
      key: r.key,
      cells: [
        { key: 'req', content: <IssueLink id={r.key} /> },
        { key: 'summary', content: r.summary },
        {
          key: 'tests',
          content: r.tests.length ? (
            <Stack space="space.050">
              {r.tests.map((t) => (
                <Inline key={t.key} space="space.100" alignBlock="center" shouldWrap>
                  <IssueLink id={t.key} />
                  <Lozenge appearance={RESULT[t.result].look}>{RESULT[t.result].text}</Lozenge>
                </Inline>
              ))}
            </Stack>
          ) : (
            <Lozenge appearance="removed">no test</Lozenge>
          ),
        },
        {
          key: 'risks',
          content: r.risks.length ? (
            <Stack space="space.050">
              {r.risks.map((k) => (
                <Inline key={k.key} space="space.100" alignBlock="center" shouldWrap>
                  <IssueLink id={k.key} />
                  <Lozenge appearance={SEVERITY_LOOK[k.severity] || 'default'}>{k.severity}</Lozenge>
                </Inline>
              ))}
            </Stack>
          ) : (
            '-'
          ),
        },
        { key: 'status', content: <Status ok={r.verified} gapText={r.gapText} /> },
      ],
    })),
  };
}

function riskTable(risks) {
  return {
    head: {
      cells: [
        { key: 'risk', content: 'Risk', width: 8 },
        { key: 'summary', content: 'Hazard', width: 32 },
        { key: 'sev', content: 'Severity', width: 10 },
        { key: 'by', content: 'Controlled by', width: 16 },
        { key: 'status', content: 'Status', width: 34 },
      ],
    },
    rows: risks.map((k) => ({
      key: k.key,
      cells: [
        { key: 'risk', content: <IssueLink id={k.key} /> },
        { key: 'summary', content: k.summary },
        { key: 'sev', content: <Lozenge appearance={SEVERITY_LOOK[k.severity] || 'default'}>{k.severity}</Lozenge> },
        {
          key: 'by',
          content: k.mitigatedBy.length ? (
            <Inline space="space.100">
              {k.mitigatedBy.map((id) => (
                <IssueLink key={id} id={id} />
              ))}
            </Inline>
          ) : (
            <Lozenge appearance="removed">none</Lozenge>
          ),
        },
        { key: 'status', content: <Status ok={k.gaps.length === 0} gapText={k.gapText} /> },
      ],
    })),
  };
}

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);

  const load = (version) => {
    setLoading(true);
    setError(null);
    setPublished(null);
    invoke('getMatrix', { version })
      .then((d) => setData(d))
      .catch((e) => setError(String((e && e.message) || e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(undefined), []);

  const publish = () => {
    setPublishing(true);
    invoke('publish', { version: data.version })
      .then((r) => setPublished(r))
      .catch((e) => setPublished({ message: String((e && e.message) || e), url: null }))
      .finally(() => setPublishing(false));
  };

  if (error) {
    return (
      <SectionMessage appearance="error" title="TraceGuard could not read this project">
        <Text>{error}</Text>
      </SectionMessage>
    );
  }
  if (!data) return <Spinner label="Building the traceability matrix" />;

  if (data.itemCount === 0) {
    return (
      <SectionMessage appearance="information" title="No TraceGuard items in this project yet">
        <Text>
          Label requirements tg-req, tests tg-test and risks tg-risk, and link tests and risks to the requirements.
          Or open Rovo chat, pick the TraceGuard agent and say "Load the TraceGuard demo project".
        </Text>
      </SectionMessage>
    );
  }

  const s = data.summary;
  const options = [{ label: 'All requirements', value: '' }, ...data.versions.map((v) => ({ label: v, value: v }))];
  const selected = options.find((o) => o.value === data.version) || options[0];

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="center" spread="space-between">
        <Heading size="medium">
          {`Traceability for ${data.projectKey}${data.version ? ` ${data.version}` : ''}`}
        </Heading>
        <Inline space="space.100" alignBlock="center">
          <Select
            inputId="tg-version"
            options={options}
            value={selected}
            isDisabled={loading}
            onChange={(o) => load(o ? o.value : '')}
          />
          <Button onClick={() => load(data.version)} isDisabled={loading}>
            Refresh
          </Button>
          <Button appearance="primary" onClick={publish} isDisabled={loading || publishing}>
            {publishing ? 'Publishing...' : 'Publish audit report'}
          </Button>
        </Inline>
      </Inline>

      {loading ? <Spinner label="Updating" /> : null}

      <SectionMessage
        appearance={s.releaseReady ? 'success' : 'error'}
        title={s.releaseReady ? 'Release verdict: GO' : 'Release verdict: NO-GO'}
      >
        <Text>
          {s.releaseReady
            ? 'Every requirement is verified by a passing, up-to-date test and no high-severity risk is open.'
            : `${s.requirements - s.verified} requirement(s) not verified and ${s.highRisksOpen} high-severity risk(s) open. Fix the gaps below.`}
        </Text>
        <Text>TraceGuard is decision support; the quality team owns the release decision.</Text>
      </SectionMessage>

      {published ? (
        <SectionMessage appearance={published.url ? 'success' : 'warning'} title="Audit report">
          <Text>{published.message.split('\n')[0].replace(/https?:\/\/\S+/, '').trim()}</Text>
          {published.url ? (
            <Link href={published.url} openNewTab>
              Open the report in Confluence
            </Link>
          ) : null}
        </SectionMessage>
      ) : null}

      <Inline space="space.600">
        <Stat label="Coverage" value={`${s.coveragePercent}%`} />
        <Stat label="Requirements verified" value={`${s.verified} / ${s.requirements}`} />
        <Stat label="Tests passed" value={`${s.testsPassed} / ${s.tests}`} />
        <Stat label="Tests failed" value={s.testsFailed} />
        <Stat label="Risks with gaps" value={`${s.risksOpen} / ${s.risks}`} />
        <Stat label="High risks open" value={s.highRisksOpen} />
      </Inline>

      <Heading size="small">Requirement traceability matrix</Heading>
      <DynamicTable {...requirementTable(data.rows)} />

      <Heading size="small">Risk control coverage</Heading>
      <DynamicTable {...riskTable(data.risks)} />
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
