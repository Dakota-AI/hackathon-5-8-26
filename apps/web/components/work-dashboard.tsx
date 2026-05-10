import type { ReactNode } from "react";

import {
  buildWorkItemDetailView,
  deriveWorkItemSummary,
  filterWorkItemsByState,
  getPrimaryWorkItem,
  listFixtureWorkItems,
  type WorkItem,
  type WorkItemDetail,
  type WorkItemsViewState
} from "../lib/work-items";

export function WorkDashboard() {
  const items = listFixtureWorkItems();
  const viewState = filterWorkItemsByState({ kind: "ready", items });
  const active = getPrimaryWorkItem();
  const detail = buildWorkItemDetailView(active);

  return (
    <section className="work-dashboard" aria-label="Delegated work">
      <div className="work-dashboard-header">
        <div>
          <span className="eyebrow">Work operating system</span>
          <h1>Delegated work, artifacts, and approvals</h1>
          <p>WorkItems are the durable objects. Runs are execution attempts underneath each objective.</p>
        </div>
        <div className="work-status-stack" aria-label="Client state coverage">
          <StatePill label="Ready" active={viewState.mode === "ready"} />
          <StatePill label="Offline-safe fixtures" active />
          <StatePill label="Backend handoff pending" />
        </div>
      </div>

      <StateBanner state={viewState} />

      <div className="work-layout">
        <WorkItemList items={items} activeId={active.id} />
        <WorkItemDetailPanel detail={detail} />
      </div>
    </section>
  );
}

function StatePill({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={active ? "state-pill active" : "state-pill"}>{label}</span>;
}

function StateBanner({ state }: { state: WorkItemsViewState }) {
  return (
    <div className={`work-state-banner ${state.mode}`}>
      <strong>{state.statusText}</strong>
      <span>
        Fixture-backed until the WorkItem Control API slice is finalized; client states are modeled now so backend binding can swap in later.
      </span>
    </div>
  );
}

function WorkItemList({ items, activeId }: { items: WorkItem[]; activeId: string }) {
  return (
    <aside className="work-list" aria-label="Work items">
      <div className="work-list-title">
        <span>Work queue</span>
        <strong>{items.length}</strong>
      </div>
      {items.map((item) => {
        const summary = deriveWorkItemSummary(item);
        const active = item.id === activeId;
        return (
          <article key={item.id} className={active ? "work-list-card active" : "work-list-card"}>
            <div className="work-list-card-top">
              <strong>{summary.title}</strong>
              <span>{summary.primaryStatusLabel}</span>
            </div>
            <p>{summary.nextAction}</p>
            <div className="work-card-meta">
              <span>{summary.priorityLabel}</span>
              <span>{summary.runSummary}</span>
              <span>{summary.updatedAt}</span>
            </div>
          </article>
        );
      })}
    </aside>
  );
}

function WorkItemDetailPanel({ detail }: { detail: WorkItemDetail }) {
  return (
    <article className="work-detail" aria-label="Selected work item detail">
      <header className="work-detail-header">
        <div>
          <span className="eyebrow">Selected WorkItem</span>
          <h2>{detail.title}</h2>
          <p>{detail.objective}</p>
        </div>
        <div className="detail-status-card">
          <span>{detail.primaryStatusLabel}</span>
          <strong>{detail.nextAction}</strong>
        </div>
      </header>

      <div className="work-summary-grid">
        <SummaryMetric label="Runs" value={detail.runSummary} />
        <SummaryMetric label="Artifacts" value={detail.artifactSummary} />
        <SummaryMetric label="Approvals" value={detail.approvalSummary} />
        <SummaryMetric label="Surfaces" value={detail.surfaceSummary} />
      </div>

      <div className="work-detail-grid">
        <SectionCard title="Run ledger" subtitle="Execution attempts below this WorkItem">
          {detail.sections.runs.map((run) => (
            <div className="compact-row" key={run.id}>
              <div>
                <strong>{run.title}</strong>
                <span>{run.owner}</span>
              </div>
              <span>{run.status}</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Events" subtitle="Ordered client timeline">
          {detail.sections.events.map((event) => (
            <div className={`timeline-row ${event.tone}`} key={event.id}>
              <span>{event.at}</span>
              <div>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </div>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Artifacts" subtitle="Durable outputs to browse next">
          {detail.sections.artifacts.map((artifact) => (
            <div className="compact-row" key={artifact.id}>
              <div>
                <strong>{artifact.name}</strong>
                <span>{artifact.kind}</span>
              </div>
              <span>{artifact.state}</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Generated surfaces" subtitle="Only server-validated payloads render">
          {detail.sections.surfaces.length === 0 ? <p className="muted-line">No validated surfaces yet.</p> : null}
          {detail.sections.surfaces.map((surface) => (
            <div className="surface-row" key={surface.id}>
              <div>
                <strong>{surface.title}</strong>
                <span>{surface.kind} · {surface.componentCount} components · {surface.dataSources.join(", ")}</span>
              </div>
              <span>{surface.validation}</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Approvals" subtitle="Human decisions stay explicit">
          {detail.sections.approvals.length === 0 ? <p className="muted-line">No approvals pending.</p> : null}
          {detail.sections.approvals.map((approval) => (
            <div className="approval-row" key={approval.id}>
              <div>
                <strong>{approval.title}</strong>
                <span>{approval.owner} · {approval.dueLabel}</span>
              </div>
              <button type="button" disabled>
                {approval.decision === "pending" ? "Review" : approval.decision}
              </button>
            </div>
          ))}
        </SectionCard>
      </div>
    </article>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="work-section-card">
      <div className="section-title-row">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}
