"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import { useState, type FormEvent } from "react";
import { artifacts, metrics, runs, teams } from "../lib/fixtures";
import { createControlApiRun, getControlApiHealth, listControlApiRunEvents, type CreatedRun, type RunEvent } from "../lib/control-api";

const statusLabels = {
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  awaiting_approval: "Approval",
  complete: "Complete"
};

const defaultObjective =
  "Build a launch page, research competitors, draft the report, and publish a preview.";

export function CommandCenter() {
  const api = getControlApiHealth();

  return (
    <Authenticator variation="modal" hideSignUp={false}>
      {({ signOut, user }) => (
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
              <span>{user?.signInDetails?.loginId || user?.username || "Amplify Auth session active"}</span>
              <button className="secondary-button" type="button" onClick={signOut}>
                Sign out
              </button>
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
                <div className="status-pill">{api.configured ? "Control API configured" : "Control API missing env"}</div>
              </div>
            </header>

            <section id="command" className="hero-card">
              <div>
                <p className="eyebrow">Agent-team orchestration</p>
                <h2>Give the system an objective; watch managers delegate work to specialist agents.</h2>
                <p>
                  The web client now signs in with Amplify Auth and creates durable Control API runs with the Cognito
                  JWT. The current ECS worker writes the smoke runtime event path while the product loop is hardened.
                </p>
              </div>
              <CreateRunPanel apiConfigured={api.configured} />
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
                  Hermes/Codex workers should emit canonical `genui.patch` events. The server validates those patches,
                  then web and desktop/mobile render the same safe component catalog.
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
      )}
    </Authenticator>
  );
}

function CreateRunPanel({ apiConfigured }: { apiConfigured: boolean }) {
  const [objective, setObjective] = useState(defaultObjective);
  const [createdRun, setCreatedRun] = useState<CreatedRun | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedRun(null);
    setEvents([]);
    setSubmitting(true);

    try {
      const run = await createControlApiRun({
        workspaceId: "workspace-web",
        objective
      });
      setCreatedRun(run);
      setEvents(await listControlApiRunEvents(run.runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="command-box" onSubmit={onSubmit}>
      <label htmlFor="objective">Objective</label>
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
        <div className="run-result">
          <span>Run created</span>
          <strong>{createdRun.runId}</strong>
          <p>Status: {createdRun.status}</p>
          {events.length ? (
            <ul>
              {events.map((runEvent) => (
                <li key={`${runEvent.runId}-${runEvent.seq}`}>
                  #{runEvent.seq} {runEvent.type}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
