import { artifacts, metrics, runs, teams } from "../lib/fixtures";
import { getControlApiHealth } from "../lib/control-api";

const statusLabels = {
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  awaiting_approval: "Approval",
  complete: "Complete"
};

export function CommandCenter() {
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
          <strong>Hermes-ready</strong>
          <span>Runtime adapters will normalize Hermes, Codex, and other workers into canonical events.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agents Cloud / Web</p>
            <h1>CEO command center for autonomous agent teams.</h1>
          </div>
          <div className="status-pill">{api.configured ? "Control API configured" : "Control API pending"}</div>
        </header>

        <section id="command" className="hero-card">
          <div>
            <p className="eyebrow">Paperclip-style orchestration</p>
            <h2>Give the system an objective; watch managers delegate work to specialist agents.</h2>
            <p>
              This web app mirrors the desktop/mobile command surface: runs, agents, artifacts, previews,
              approvals, and generated UI. It is backend-ready but currently uses fixtures until Control API V1 lands.
            </p>
          </div>
          <form className="command-box">
            <label htmlFor="objective">Objective</label>
            <textarea id="objective" placeholder="Build a launch page, research competitors, draft the report, and publish a preview..." />
            <button type="button" disabled>
              Create run after Control API is live
            </button>
          </form>
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
              <span>fixtures</span>
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
  );
}
