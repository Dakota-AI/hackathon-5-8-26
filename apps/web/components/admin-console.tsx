"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readAmplifyEnv } from "../lib/amplify-config";
import { resetAmplifyAuthSession } from "../lib/auth-session-reset";
import { getControlApiHealth, listControlApiAdminRuns, type AdminRunSummary, type AdminRunsResponse } from "../lib/control-api";

const defaultAdminState: AdminRunsResponse = {
  runs: [],
  totals: {
    totalRuns: 0,
    failedRuns: 0,
    runningRuns: 0,
    succeededRuns: 0
  }
};

export function AdminConsole() {
  if (process.env.NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS === "1") {
    return <AdminConsoleApp userLabel="Local admin" />;
  }

  return (
    <Authenticator variation="modal" hideSignUp={false}>
      {({ user }) => (
        <AdminConsoleApp
          userLabel={user?.signInDetails?.loginId || user?.username || "Signed in"}
          onSignOut={() => void resetAmplifyAuthSession({ clientId: readAmplifyEnv().userPoolClientId })}
        />
      )}
    </Authenticator>
  );
}

function AdminConsoleApp({ userLabel, onSignOut }: { userLabel: string; onSignOut?: () => void }) {
  const api = getControlApiHealth();
  const [data, setData] = useState<AdminRunsResponse>(defaultAdminState);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await listControlApiAdminRuns({ limit: 75 });
      setData(response);
      setSelectedRunId((current) => current ?? response.runs[0]?.runId);
      setLastLoadedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load admin runs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedRun = useMemo(() => data.runs.find((run) => run.runId === selectedRunId), [data.runs, selectedRunId]);
  const recentFailures = useMemo(() => data.runs.filter((run) => run.failureCount > 0 || run.status === "failed").slice(0, 5), [data.runs]);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Agents Cloud operations</h1>
          <p>Requests, processes, artifacts, failures, and per-user run state from the durable ledger.</p>
        </div>
        <div className="admin-actions">
          <span>{userLabel}</span>
          <button type="button" onClick={() => void refresh()} disabled={loading || !api.configured}>
            {loading ? "Refreshing" : "Refresh"}
          </button>
          {onSignOut ? (
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {!api.configured ? (
        <section className="admin-alert">Control API is not configured for this deployment.</section>
      ) : null}
      {error ? <section className="admin-alert danger">{error}</section> : null}

      <section className="admin-grid stats-grid">
        <MetricCard label="Total runs" value={data.totals.totalRuns} />
        <MetricCard label="Running" value={data.totals.runningRuns} />
        <MetricCard label="Succeeded" value={data.totals.succeededRuns} />
        <MetricCard label="Failed" value={data.totals.failedRuns} danger={data.totals.failedRuns > 0} />
      </section>

      <section className="admin-grid admin-main-grid">
        <div className="admin-panel runs-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent requests</h2>
              <p>{lastLoadedAt ? `Updated ${formatDate(lastLoadedAt)}` : "Loading latest ledger state"}</p>
            </div>
          </div>
          <div className="run-list" role="list">
            {data.runs.length ? (
              data.runs.map((run) => (
                <button
                  className={run.runId === selectedRunId ? "run-row selected" : "run-row"}
                  key={run.runId}
                  onClick={() => setSelectedRunId(run.runId)}
                  type="button"
                >
                  <span className={`status-dot ${run.status}`} />
                  <span className="run-row-main">
                    <strong>{run.objective || "Untitled request"}</strong>
                    <small>{run.ownerEmail || run.userId} · {run.status} · {formatDate(run.updatedAt || run.createdAt)}</small>
                  </span>
                  <span className="run-row-counts">{run.eventCount} events</span>
                </button>
              ))
            ) : (
              <div className="empty-state">No runs found yet.</div>
            )}
          </div>
        </div>

        <div className="admin-panel detail-panel">
          {selectedRun ? <RunDetail run={selectedRun} /> : <div className="empty-state">Select a run to inspect it.</div>}
        </div>
      </section>

      <section className="admin-panel failure-panel">
        <div className="panel-heading">
          <div>
            <h2>Failure watch</h2>
            <p>Runs with failed status or failure events.</p>
          </div>
        </div>
        {recentFailures.length ? (
          <div className="failure-list">
            {recentFailures.map((run) => (
              <button className="failure-row" key={run.runId} onClick={() => setSelectedRunId(run.runId)} type="button">
                <strong>{run.ownerEmail || run.userId}</strong>
                <span>{run.objective || run.runId}</span>
                <code>{formatFailure(run)}</code>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">No failures in the current window.</div>
        )}
      </section>
    </main>
  );
}

function MetricCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={danger ? "metric-card danger" : "metric-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RunDetail({ run }: { run: AdminRunSummary }) {
  return (
    <div className="run-detail">
      <div className="panel-heading">
        <div>
          <h2>{run.objective || "Untitled request"}</h2>
          <p>{run.ownerEmail || run.userId}</p>
        </div>
        <span className={`status-badge ${run.status}`}>{run.status}</span>
      </div>

      <dl className="detail-grid">
        <Detail label="Run ID" value={run.runId} code />
        <Detail label="Workspace" value={run.workspaceId} code />
        <Detail label="User" value={run.userId} code />
        <Detail label="Created" value={formatDate(run.createdAt)} />
        <Detail label="Updated" value={formatDate(run.updatedAt)} />
        <Detail label="Latest event" value={run.latestEventType || "none"} />
        <Detail label="Latest event at" value={formatDate(run.latestEventAt)} />
        <Detail label="Events" value={String(run.eventCount)} />
        <Detail label="Artifacts" value={String(run.artifactCount)} />
        <Detail label="Failures" value={String(run.failureCount)} />
        <Detail label="Execution ARN" value={run.executionArn || "not started"} code wide />
      </dl>

      <details className="json-details">
        <summary>Raw admin summary</summary>
        <pre>{JSON.stringify(run, null, 2)}</pre>
      </details>
    </div>
  );
}

function Detail({ label, value, code = false, wide = false }: { label: string; value: string; code?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "detail-item wide" : "detail-item"}>
      <dt>{label}</dt>
      <dd>{code ? <code>{value}</code> : value}</dd>
    </div>
  );
}

function formatDate(value?: string): string {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatFailure(run: AdminRunSummary): string {
  if (run.lastFailure) {
    return JSON.stringify(run.lastFailure);
  }
  return run.status === "failed" ? "failed status" : `${run.failureCount} failure events`;
}
