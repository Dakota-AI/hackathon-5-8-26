"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import {
  decideControlApiApproval,
  getControlApiHealth,
  listControlApiRunApprovals,
  listControlApiWorkItemRuns,
  listControlApiWorkItems,
  type ApprovalRecord
} from "../../lib/control-api";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { StatusPill } from "./status-pill";
import { Button } from "./button";
import { ApprovalCard } from "./approval-card";

export function ApprovalsBoard() {
  const { isAuthed, openSignIn } = useAuth();
  const { workspaceId } = useWorkspace();
  const api = getControlApiHealth();
  const live = isAuthed && api.configured;

  const [approvals, setApprovals] = React.useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actingOn, setActingOn] = React.useState<string | null>(null);
  const [workItemCount, setWorkItemCount] = React.useState(0);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Approvals are per-run. Fan-out: workItems → runs → approvals.
        const itemsResp = await listControlApiWorkItems({ workspaceId, limit: 25 });
        if (cancelled) return;
        setWorkItemCount(itemsResp.workItems.length);

        const runsLists = await Promise.all(
          itemsResp.workItems.map((item) =>
            listControlApiWorkItemRuns({ workspaceId, workItemId: item.workItemId })
              .then((r) => r.runs)
              .catch(() => [])
          )
        );
        const runIds = Array.from(
          new Set(runsLists.flat().slice(0, 50).map((r) => r.runId))
        );

        const approvalLists = await Promise.all(
          runIds.map((runId) =>
            listControlApiRunApprovals(runId)
              .then((r) => r.approvals)
              .catch(() => [])
          )
        );
        if (cancelled) return;

        const merged = approvalLists.flat();
        // Show requested first; then approved/rejected (recent)
        const sorted = merged.sort((a, b) => {
          const rank = (s: string) => (s === "requested" ? 0 : s === "approved" ? 1 : 2);
          const r = rank(a.status) - rank(b.status);
          if (r !== 0) return r;
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        });
        setApprovals(sorted);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load approvals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, workspaceId, tick]);

  async function decide(approval: ApprovalRecord, decision: "approved" | "rejected") {
    setActingOn(approval.approvalId);
    try {
      const r = await decideControlApiApproval({
        workspaceId: approval.workspaceId,
        approvalId: approval.approvalId,
        decision
      });
      setApprovals((cur) =>
        cur.map((x) => (x.approvalId === approval.approvalId ? r.approval : x))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setActingOn(null);
    }
  }

  const pending = approvals.filter((a) => a.status === "requested");

  return (
    <div className="flex flex-col gap-3 p-2 md:p-3.5">
      <Panel padding={14}>
        <SectionHeader
          title="Approvals"
          subtitle="Risky actions pause and route here. Approvals close the loop between agent autonomy and human accountability."
          trailing={
            isAuthed ? (
              <Button variant="outline" size="sm" onClick={() => setTick((n) => n + 1)}>
                <ReloadIcon /> Refresh
              </Button>
            ) : null
          }
        />

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {!isAuthed ? (
            <StatusPill label="Demo mode" tone="warning" />
          ) : (
            <>
              <StatusPill label={`workspace: ${workspaceId}`} tone="info" />
              <StatusPill label={`${pending.length} pending`} tone="warning" />
              <StatusPill label={`${approvals.length} total`} tone="info" />
              <StatusPill label={`scanned ${workItemCount} work items`} tone="info" />
            </>
          )}
          {loading ? <StatusPill label="Loading…" tone="info" /> : null}
        </div>

        {!isAuthed ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-app-border bg-app-input p-3">
            <div>
              <div className="text-sm font-extrabold text-app-text">Sign in to load real approvals</div>
              <div className="mt-1 text-[12px] text-app-muted">
                The list below is demo content from the Flutter spec.
              </div>
            </div>
            <Button variant="primary" size="md" onClick={openSignIn}>
              Sign in
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-[8px] border border-[#7F1D1D]/60 bg-[#7F1D1D]/10 p-2.5 text-[12px] text-[#ff8f8f]">
            {error}
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2.5">
          {!isAuthed ? <DemoApprovals /> : null}

          {isAuthed && approvals.length === 0 && !loading ? (
            <div className="flex h-32 flex-col items-center justify-center text-center text-app-muted">
              <div className="text-[13px] font-extrabold text-app-text">No approvals in queue</div>
              <div className="mt-1 text-[12px]">
                When an agent run pauses for approval, it appears here.
              </div>
            </div>
          ) : null}

          {isAuthed
            ? approvals.map((a) => (
                <RealApproval
                  key={a.approvalId}
                  approval={a}
                  busy={actingOn === a.approvalId}
                  onApprove={() => void decide(a, "approved")}
                  onRevision={() => void decide(a, "rejected")}
                  onDeny={() => void decide(a, "rejected")}
                />
              ))
            : null}
        </div>
      </Panel>
    </div>
  );
}

function RealApproval({
  approval,
  busy,
  onApprove,
  onRevision,
  onDeny
}: {
  approval: ApprovalRecord;
  busy: boolean;
  onApprove: () => void;
  onRevision: () => void;
  onDeny: () => void;
}) {
  const decided = approval.status !== "requested";
  return (
    <Panel padding={12} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <StatusPill label={approval.risk} tone="warning" />
        <StatusPill label={approval.toolName} tone="info" />
        <StatusPill label={approval.status} tone={decided ? "success" : "warning"} />
        <StatusPill label={`run ${approval.runId.slice(-8)}`} tone="info" />
      </div>
      <div className="text-[16px] font-black text-app-text">{approval.requestedAction}</div>
      {approval.argumentsPreview ? (
        <pre className="rounded-[8px] border border-app-border bg-app-panel-deep p-2 text-[11px] font-mono text-app-muted overflow-x-auto max-h-[120px]">
          {JSON.stringify(approval.argumentsPreview, null, 2)}
        </pre>
      ) : null}
      {approval.reason ? (
        <div className="text-[12px] text-app-muted">Decision note: {approval.reason}</div>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button variant="primary" size="md" onClick={onApprove} disabled={busy || decided}>
          {decided ? approval.status : busy ? "Recording…" : "Approve"}
        </Button>
        <Button variant="outline" size="md" onClick={onRevision} disabled={busy || decided}>
          Request revision
        </Button>
        <Button variant="destructive" size="md" onClick={onDeny} disabled={busy || decided}>
          Deny
        </Button>
      </div>
    </Panel>
  );
}

function DemoApprovals() {
  return (
    <>
      <ApprovalCard
        risk="external publish"
        title="Publish launch-demo.preview.solo-ceo.ai"
        body="Builder agent finished a preview website using validated artifacts. Publish requires approval because it goes to a customer-visible preview domain."
      />
      <ApprovalCard
        risk="GitHub write"
        title="Create pull request with generated site changes"
        body="Builder agent prepared a PR against the marketing repo. Source-control writes are blocked until brokered credentials are scoped and approved."
      />
    </>
  );
}
