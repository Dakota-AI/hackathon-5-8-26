"use client";

import * as React from "react";
import { CheckCircledIcon, GearIcon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import {
  approveControlApiAgentProfile,
  createControlApiAgentProfileDraft,
  getControlApiHealth,
  listControlApiAgentProfiles,
  type AgentProfileRegistryRecord
} from "../../lib/control-api";
import {
  buildAgentWorkshopDraftProfile,
  summarizeAgentProfileRecord
} from "../../lib/agent-workshop";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { StatusPill } from "./status-pill";
import { TinyStat } from "./tiny-stat";

const demoAgents = [
  {
    role: "Executive Agent",
    state: "live",
    mission: "Turns operator objectives into delegated work, run plans, and approval checkpoints.",
    tools: ["work-items", "runs", "approvals"]
  },
  {
    role: "Research Team",
    state: "ready",
    mission: "Collects source-backed market, competitor, and customer evidence before builders act.",
    tools: ["web", "documents", "citations"]
  },
  {
    role: "Builder Agent",
    state: "gated",
    mission: "Produces reports, generated UI, preview sites, and artifact bundles behind approval gates.",
    tools: ["artifacts", "preview", "github gated"]
  },
  {
    role: "Evaluator Agent",
    state: "ready",
    mission: "Checks outputs against quality gates before they are shown as finished work.",
    tools: ["schemas", "tests", "scorecards"]
  }
];

export function AgentsBoard() {
  const { isAuthed, openSignIn, userLabel } = useAuth();
  const { workspaceId } = useWorkspace();
  const api = getControlApiHealth();
  const live = isAuthed && api.configured;
  const [profiles, setProfiles] = React.useState<AgentProfileRegistryRecord[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [role, setRole] = React.useState("Market Intelligence Specialist");
  const [goal, setGoal] = React.useState("Find current competitor positioning and turn it into an executive brief.");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!live) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listControlApiAgentProfiles({ workspaceId, limit: 50 });
      setProfiles(response.profiles);
      setSelectedKey((current) => current ?? profileKey(response.profiles[0]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agent profiles.");
    } finally {
      setLoading(false);
    }
  }, [live, workspaceId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!live) {
      openSignIn();
      return;
    }
    const trimmedRole = role.trim();
    const trimmedGoal = goal.trim();
    if (!trimmedRole || !trimmedGoal) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const profile = buildAgentWorkshopDraftProfile({
        workspaceId,
        userId: userLabel || "web-operator",
        role: trimmedRole,
        projectContext: "Solo CEO hackathon workspace",
        goals: [trimmedGoal],
        constraints: [
          "Ask for approval before external publishing or source-control writes.",
          "Use durable artifacts for every deliverable."
        ]
      });
      const response = await createControlApiAgentProfileDraft({ workspaceId, profile });
      setProfiles((current) => [
        response.profile,
        ...current.filter((item) => profileKey(item) !== profileKey(response.profile))
      ]);
      setSelectedKey(profileKey(response.profile));
      setMessage("Draft agent profile created and stored in the live registry.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create draft profile.");
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected() {
    const selected = profiles.find((profile) => profileKey(profile) === selectedKey);
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await approveControlApiAgentProfile({
        workspaceId: selected.workspaceId,
        profileId: selected.profileId,
        version: selected.version,
        notes: "Approved from Agents & Teams page."
      });
      setProfiles((current) =>
        current.map((profile) =>
          profileKey(profile) === profileKey(response.profile) ? response.profile : profile
        )
      );
      setSelectedKey(profileKey(response.profile));
      setMessage("Selected agent profile approved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve profile.");
    } finally {
      setBusy(false);
    }
  }

  const selected = profiles.find((profile) => profileKey(profile) === selectedKey) ?? profiles[0];
  const selectedSummary = selected ? summarizeAgentProfileRecord(selected) : null;

  return (
    <div className="flex flex-col gap-3 p-2 md:p-3.5">
      <Panel padding={14}>
        <SectionHeader
          title="Agents & Teams"
          subtitle="Create, inspect, and approve governed specialist agents for the workspace."
          trailing={
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={!live || loading}>
              <ReloadIcon className={cn(loading && "animate-spin")} /> Refresh
            </Button>
          }
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {live ? (
            <>
              <StatusPill label={`workspace: ${workspaceId}`} tone="info" />
              <StatusPill label={`${profiles.length} registry profiles`} tone="success" />
            </>
          ) : (
            <StatusPill label="Demo mode" tone="warning" />
          )}
          <StatusPill label="approval gated" tone="warning" />
        </div>
        {!live ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-app-border bg-app-input p-3">
            <div>
              <div className="text-sm font-extrabold text-app-text">Sign in to manage live agent profiles</div>
              <div className="mt-1 text-[12px] text-app-muted">
                The cards below show the default team map while signed out.
              </div>
            </div>
            <Button variant="primary" size="md" onClick={openSignIn}>
              Sign in
            </Button>
          </div>
        ) : null}
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(360px,4fr)]">
        <Panel padding={14}>
          <SectionHeader title="Team roster" subtitle="Every card is a usable agent role, not a static roadmap list." />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {demoAgents.map((agent) => (
              <div key={agent.role} className="rounded-[12px] border border-app-border bg-app-input p-3">
                <div className="flex flex-wrap gap-1.5">
                  <StatusPill label={agent.state} tone={agent.state === "gated" ? "warning" : "success"} />
                  {agent.tools.slice(0, 2).map((tool) => (
                    <StatusPill key={tool} label={tool} tone="info" />
                  ))}
                </div>
                <div className="mt-2 text-sm font-black text-app-text">{agent.role}</div>
                <p className="mt-1 text-[12px] leading-[1.4] text-app-muted">{agent.mission}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel padding={14}>
          <SectionHeader title="Create specialist" subtitle="Draft a governed profile and store it in the live registry." />
          <form onSubmit={createDraft} className="mt-3 flex flex-col gap-2">
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="rounded-[8px] border border-app-border bg-app-input px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
              placeholder="Specialist role"
            />
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="min-h-[86px] rounded-[8px] border border-app-border bg-app-input px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
              placeholder="Primary goal"
            />
            <Button type="submit" variant="primary" size="md" disabled={busy}>
              <PlusIcon /> {busy ? "Working..." : live ? "Create draft profile" : "Sign in to create"}
            </Button>
          </form>
          {message ? <div className="mt-2 text-[12px] text-app-accent">{message}</div> : null}
          {error ? <div className="mt-2 text-[12px] text-[#ff8f8f]">{error}</div> : null}
        </Panel>
      </div>

      {live ? (
        <Panel padding={14}>
          <SectionHeader title="Profile registry" subtitle="Select a profile to inspect validation, tool posture, and approval state." />
          <div className="mt-3 flex flex-col gap-3 xl:flex-row">
            <div className="xl:flex-[4]">
              <div className="flex flex-col gap-2">
                {profiles.length ? (
                  profiles.map((profile) => {
                    const summary = summarizeAgentProfileRecord(profile);
                    const key = profileKey(profile);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={cn(
                          "rounded-[10px] border p-2.5 text-left transition-colors",
                          key === profileKey(selected)
                            ? "border-app-text bg-app-input text-app-text"
                            : "border-app-border bg-app-panel text-app-muted hover:text-app-text"
                        )}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          <StatusPill label={summary.lifecycleState} tone="info" />
                          {summary.reviewReady ? <StatusPill label="review ready" tone="success" /> : null}
                        </div>
                        <div className="mt-2 text-sm font-black truncate">{summary.title}</div>
                        <div className="mt-1 text-[11px]">{summary.subtitle}</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[10px] border border-app-border bg-app-input p-3 text-[12px] text-app-muted">
                    No profiles yet. Create a specialist draft above.
                  </div>
                )}
              </div>
            </div>
            <div className="xl:flex-[7]">
              {selected && selectedSummary ? (
                <div className="rounded-[12px] border border-app-border bg-app-input p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill label={selectedSummary.lifecycleState} tone="info" />
                    <StatusPill label={selected.profileId} tone="warning" />
                  </div>
                  <div className="mt-2 text-[18px] font-black text-app-text">{selectedSummary.title}</div>
                  <p className="mt-1 text-[12px] leading-[1.4] text-app-muted">
                    {selected.profile?.mission || "Profile details are available after inspection."}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {selectedSummary.toolPosture.map((value) => (
                      <TinyStat key={value} label="Policy" value={value} />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => void approveSelected()}
                      disabled={busy || selected.lifecycleState === "approved" || selected.lifecycleState === "promoted"}
                    >
                      <CheckCircledIcon /> Approve profile
                    </Button>
                    <Button variant="outline" size="md" onClick={() => window.location.assign("/admin")}>
                      <GearIcon /> Open admin workshop
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function profileKey(profile?: Pick<AgentProfileRegistryRecord, "workspaceId" | "profileId" | "version">): string | null {
  if (!profile) return null;
  return `${profile.workspaceId}:${profile.profileId}:${profile.version}`;
}
