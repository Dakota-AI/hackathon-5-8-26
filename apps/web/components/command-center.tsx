"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { artifacts, metrics, runs, teams } from "../lib/fixtures";
import { readAmplifyEnv } from "../lib/amplify-config";
import { resetAmplifyAuthSession } from "../lib/auth-session-reset";
import {
  createControlApiRun,
  getControlApiHealth,
  getControlApiRun,
  listControlApiRunEvents,
  type CreatedRun,
  type RunEvent
} from "../lib/control-api";
import { deriveRunLedgerView, mergeRunEvents } from "../lib/run-ledger";

const statusLabels: Record<string, string> = {
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  awaiting_approval: "Approval",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  complete: "Complete"
};

const defaultObjective =
  "Build a launch page, research competitors, draft the report, and publish a preview.";

export function CommandCenter() {
  if (process.env.NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS === "1") {
    return <CommandCenterApp userLabel="Local self-test session" />;
  }

  return (
    <Authenticator variation="modal" hideSignUp={false}>
      {({ user }) => (
        <CommandCenterApp
          userLabel={user?.signInDetails?.loginId || user?.username || "Amplify Auth session active"}
          onSignOut={() => void resetAmplifyAuthSession({ clientId: readAmplifyEnv().userPoolClientId })}
        />
      )}
    </Authenticator>
  );
}

function CommandCenterApp({ userLabel, onSignOut }: { userLabel: string; onSignOut?: () => void }) {
  const api = getControlApiHealth();

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Agents Cloud navigation">
        <div className="brand-mark">AC</div>
        <nav>
          <a href="#command">Command</a>
          <a href="#runs">Runs</a>
          <a href="#agents">Agents</a>
          <a href="#artifacts">Artifacts</a>
          <a href="#approvals">Approvals</a>
        </nav>
        <div className="sidebar-card">
          <strong>Signed in</strong>
          <span>{userLabel}</span>
          {onSignOut ? (
            <button className="secondary-button" type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agents Cloud / Web</p>
            <h1>CEO command center for autonomous agent teams.</h1>
          </div>
          <div className="topbar-status">
            <div className="status-pill">Amplify Auth configured</div>
            <div className="status-pill">
              {api.mockMode ? "Control API self-test mode" : api.configured ? "Control API configured" : "Control API missing env"}
            </div>
          </div>
        </header>

        <section id="command" className="hero-card">
          <div>
            <p className="eyebrow">Agent-team orchestration</p>
            <h2>Give the system an objective; watch the durable run ledger update.</h2>
            <p>
              The web client signs in with Amplify Auth, creates Control API runs with the Cognito JWT, then polls the
              canonical event ledger until the ECS worker reaches a terminal state and publishes artifacts.
            </p>
          </div>
          <CreateRunPanel apiConfigured={api.configured} mockMode={api.mockMode} />
        </section>

        <section className="metric-grid" aria-label="Platform metrics">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article id="runs" className="panel panel-large">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Live run ledger</p>
                <h3>Recent autonomous runs</h3>
              </div>
              <span>fixtures until list-runs lands</span>
            </div>
            <div className="run-list">
              {runs.map((run) => (
                <div className="run-row" key={run.id}>
                  <div>
                    <strong>{run.title}</strong>
                    <p>{run.summary}</p>
                  </div>
                  <div className="run-meta">
                    <span className={`run-status status-${run.status}`}>{statusLabels[run.status]}</span>
                    <span>{run.updatedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article id="agents" className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Agent org chart</p>
                <h3>Teams</h3>
              </div>
            </div>
            <div className="compact-list">
              {teams.map((team) => (
                <div key={team.name}>
                  <strong>{team.name}</strong>
                  <span>{team.role}</span>
                  <em>{team.state}</em>
                </div>
              ))}
            </div>
          </article>

          <article id="artifacts" className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Artifacts and previews</p>
                <h3>Outputs</h3>
              </div>
            </div>
            <div className="compact-list">
              {artifacts.map((artifact) => (
                <div key={artifact.name}>
                  <strong>{artifact.name}</strong>
                  <span>{artifact.type}</span>
                  <em>{artifact.state}</em>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section id="approvals" className="genui-panel">
          <div>
            <p className="eyebrow">Generated UI stream</p>
            <h3>Future A2UI patches render here</h3>
            <p>
              Hermes/Codex workers should emit canonical `genui.patch` events. The server validates those patches, then
              web and desktop/mobile render the same safe component catalog.
            </p>
          </div>
          <div className="genui-preview">
            <span>metric.tile</span>
            <strong>Preview router</strong>
            <p>Ready for host-header registry lookup after router implementation.</p>
          </div>
        </section>
      </section>
    </main>
  );
}

function CreateRunPanel({ apiConfigured, mockMode }: { apiConfigured: boolean; mockMode: boolean }) {
  const [objective, setObjective] = useState(defaultObjective);
  const [createdRun, setCreatedRun] = useState<CreatedRun | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const ledgerView = useMemo(
    () => deriveRunLedgerView({ initialStatus: createdRun?.status || "queued", events }),
    [createdRun?.status, events]
  );

  useEffect(() => {
    if (!createdRun || ledgerView.isTerminal) {
      return undefined;
    }

    let cancelled = false;

    async function refreshLedger() {
      if (!createdRun || cancelled) {
        return;
      }

      try {
        const run = await getControlApiRun(createdRun.runId);
        const nextEvents = await listControlApiRunEvents(createdRun.runId, {
          afterSeq: ledgerView.lastSeq,
          limit: 50
        });
        if (cancelled) {
          return;
        }
        setPollError(null);
        setCreatedRun((current) => (current ? { ...current, status: run.status, executionArn: run.executionArn } : current));
        setEvents((current) => mergeRunEvents(current, nextEvents));
      } catch (err) {
        if (!cancelled) {
          setPollError(err instanceof Error ? err.message : "Unable to refresh run ledger.");
        }
      }
    }

    void refreshLedger();
    const intervalId = window.setInterval(refreshLedger, mockMode ? 550 : 1800);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [createdRun, ledgerView.isTerminal, ledgerView.lastSeq, mockMode]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPollError(null);
    setCreatedRun(null);
    setEvents([]);
    setSubmitting(true);

    try {
      const run = await createControlApiRun({
        workspaceId: "workspace-web",
        objective
      });
      setCreatedRun(run);
      setEvents(await listControlApiRunEvents(run.runId, { limit: 50 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="command-box" onSubmit={onSubmit}>
      <div className="command-heading">
        <div>
          <label htmlFor="objective">Objective</label>
          <p>Creates a durable Control API run and follows the event ledger.</p>
        </div>
        {mockMode ? <span className="status-pill">Self-test</span> : null}
      </div>
      <textarea
        id="objective"
        value={objective}
        onChange={(event) => setObjective(event.target.value)}
        placeholder="Build a launch page, research competitors, draft the report, and publish a preview..."
      />
      <button type="submit" disabled={!apiConfigured || submitting || objective.trim().length < 8}>
        {submitting ? "Creating durable run..." : "Create run"}
      </button>
      {!apiConfigured ? <p className="form-note form-error">Control API env var is missing.</p> : null}
      {error ? <p className="form-note form-error">{error}</p> : null}
      {createdRun ? (
        <div className="run-result" aria-live="polite">
          <span>Run created</span>
          <strong>{createdRun.runId}</strong>
          <div className="ledger-summary">
            <span className={`run-status status-${ledgerView.status}`}>{statusLabels[ledgerView.status] || ledgerView.status}</span>
            <span>{ledgerView.pollingLabel}</span>
            <span>Last event #{ledgerView.lastSeq || "—"}</span>
          </div>
          {pollError ? <p className="form-note form-error">Polling issue: {pollError}</p> : null}
          {events.length ? (
            <ol className="event-timeline" aria-label="Run event timeline">
              {events.map((runEvent) => (
                <li key={runEvent.id || `${runEvent.runId}-${runEvent.seq}`}>
                  <span>#{runEvent.seq}</span>
                  <strong>{formatEventType(runEvent)}</strong>
                  <em>{formatEventSource(runEvent)}</em>
                </li>
              ))}
            </ol>
          ) : (
            <p className="form-note">Waiting for the first event...</p>
          )}
          {ledgerView.artifacts.length ? (
            <div className="artifact-cards" aria-label="Run artifacts">
              {ledgerView.artifacts.map((artifact) => (
                <article key={artifact.id}>
                  <span>{artifact.kind}</span>
                  <strong>{artifact.name}</strong>
                  {artifact.uri ? <p>{artifact.uri}</p> : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function formatEventType(event: RunEvent): string {
  if (event.type === "run.status" && typeof event.payload?.status === "string") {
    return `Status ${statusLabels[event.payload.status] || event.payload.status}`;
  }
  if (event.type === "artifact.created") {
    return "Artifact created";
  }
  return event.type;
}

function formatEventSource(event: RunEvent): string {
  return event.source || "durable ledger";
}
