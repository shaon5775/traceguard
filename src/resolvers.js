/**
 * Backend for the TraceGuard Jira project page (UI Kit). Runs as the person viewing the page.
 *   getMatrix  { version? }  -> pageModel for the current project
 *   publish    { version? }  -> publishes the Confluence audit report, returns { message, url }
 */
import Resolver from '@forge/resolver';
import { fetchTraceIssues, publishAuditReport } from './index.js';
import { pageModel } from './trace.js';

const resolver = new Resolver();

const projectKeyOf = (context) =>
  (context && context.extension && context.extension.project && context.extension.project.key) || 'IPC';

resolver.define('getMatrix', async ({ payload, context }) => {
  const projectKey = projectKeyOf(context);
  const issues = await fetchTraceIssues(projectKey);
  return { projectKey, itemCount: issues.length, ...pageModel(issues, payload ? payload.version : undefined) };
});

resolver.define('publish', async ({ payload, context }) => {
  const projectKey = projectKeyOf(context);
  const message = await publishAuditReport({ projectKey, version: (payload && payload.version) || undefined });
  const match = message.match(/https?:\/\/\S+/);
  return { message, url: match ? match[0] : null };
});

export const handler = resolver.getDefinitions();
