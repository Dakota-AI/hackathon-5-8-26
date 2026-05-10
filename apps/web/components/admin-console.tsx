"use client";

import * as React from "react";
import {
  ActivityLogIcon,
  CrossCircledIcon,
  ReloadIcon,
  ChevronDownIcon
} from "@radix-ui/react-icons";
import {
  agentWorkshopLifecycle,
  buildAgentWorkshopDraftProfile,
  summarizeAgentProfileRecord,
  summarizeLifecycleReadiness,
  type AgentProfileDisplaySummary
} from "../lib/agent-workshop";
import { describeAdminLineageEvent, summarizePipelinePosition } from "../lib/admin-lineage";
import { describeRunnerHealth, sortRunnerRows } from "../lib/admin-runners";
import {
  approveControlApiAgentProfile,
  createControlApiAgentProfileDraft,
  getControlApiAgentProfile,
  getControlApiHealth,
  listControlApiAdminRunEvents,
  listControlApiAdminRunners,
  listControlApiAdminRuns,
  listControlApiAgentProfiles,
  type AdminRunnerRecord,
  type AdminRunnersResponse,
  type AdminRunSummary,
  type AdminRunsResponse,
  type AgentProfileRegistryRecord,
  type RunEvent
} from "../lib/control-api";
import { useAuth } from "./auth-context";
import { cn } from "../lib/utils";
import { BrandHeader } from "./app/brand-header";
import { Button } from "./app/button";
import { Panel } from "./app/panel";
import { SectionHeader } from "./app/section-header";
import { StatusPill } from "./app/status-pill";
import { MetricCard } from "./app/metric-card";
import { TimelineItem } from "./app/timeline-item";
import { Textarea } from "./app/textarea";

const defaultAdminState: AdminRunsResponse = {
  runs: [],
  totals: { totalRuns: 0, failedRuns: 0, runningRuns: 0, succeededRuns: 0 }
};

const defaultRunnerState: AdminRunnersResponse = {
  hosts: [],
  runners: [],
  totals: { hosts: 0, runners: 0, failedHosts: 0, failedRunners: 0, staleRunners: 0 }
};

export function AdminConsole() {
  const { isAuthed, userLabel, openSignIn, signOut } = useAuth();
  const api = getControlApiHealth();

  const [data, setData] = React.useState<AdminRunsResponse>(defaultAdminState);
  const [runnerData, setRunnerData] = React.useState<AdminRunnersResponse>(defaultRunnerState);
  const [selectedRunId, setSelectedRunId] = React.useState<string | undefined>();
  const [lineageEvents, setLineageEvents] = React.useState<RunEvent[]>([]);
  const [lineageLoading, setLineageLoading] = React.useState(false);
  const [lineageError, setLineageError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [runnerError, setRunnerError] = React.useState<string | undefined>();
  const [lastLoadedAt, setLastLoadedAt] = React.useState<string | undefined>();

  const [workshopProfiles, setWorkshopProfiles] = React.useState<AgentProfileRegistryRecord[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = React.useState<string | undefined>();
  const [workshopStatus, setWorkshopStatus] = React.useState<string | undefined>();
  const [workshopError, setWorkshopError] = React.useState<string | undefined>();
  const [workshopBusy, setWorkshopBusy] = React.useState(false);
  const [draftRole, setDraftRole] = React.useState("Market Research Strategist");
  const [draftContext, setDraftContext] = React.useState(
    "Solo CEO launch planning and operator leverage for a small founder-led company."
  );
  const [draftGoals, setDraftGoals] = React.useState(
    "Find timely market/channel signals\nProduce an executive-ready brief\nAsk before paid APIs or external side effects"
  );
  const [draftConstraints, setDraftConstraints] = React.useState(
    "No paid Apify actor runs without approval\nNo public posts or email sends without approval\nCite source quality and uncertainty"
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setRunnerError(undefined);
    try {
      const runsResponse = await listControlApiAdminRuns({ limit: 75 });
      setData(runsResponse);
      setSelectedRunId((current) => current ?? runsResponse.runs[0]?.runId);
      setLastLoadedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load admin runs.");
    }

    try {
      const runnersResponse = await listControlApiAdminRunners({ limit: 75 });
      setRunnerData(runnersResponse);
    } catch (caught) {
      setRunnerError(caught instanceof Error ? caught.message : "Unable to load runner fleet.");
      setRunnerData(defaultRunnerState);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isAuthed) void refresh();
  }, [refresh, isAuthed]);

  React.useEffect(() => {
    if (!selectedRunId || !api.configured || !isAuthed) {
      setLineageEvents([]);
      return;
    }

    let cancelled = false;
    setLineageLoading(true);
    setLineageError(undefined);
    void listControlApiAdminRunEvents(selectedRunId, { limit: 100 })
      .then((response) => {
        if (!cancelled) setLineageEvents(response.events);
      })
      .catch((caught) => {
        if (!cancelled) {
          setLineageError(caught instanceof Error ? caught.message : "Unable to load run lineage.");
          setLineageEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLineageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api.configured, selectedRunId, isAuthed]);

  const refreshWorkshopProfiles = React.useCallback(async () => {
    if (!api.configured || !isAuthed) {
      setWorkshopProfiles([]);
      return;
    }
    setWorkshopError(undefined);
    try {
      const response = await listControlApiAgentProfiles({ limit: 25 });
      setWorkshopProfiles(response.profiles);
      setSelectedProfileKey((current) => current ?? profileSelectionKey(response.profiles[0]));
    } catch (caught) {
      setWorkshopError(
        caught instanceof Error ? caught.message : "Unable to load Agent Workshop profiles."
      );
    }
  }, [api.configured, isAuthed]);

  React.useEffect(() => {
    void refreshWorkshopProfiles();
  }, [refreshWorkshopProfiles]);

  const createWorkshopDraft = React.useCallback(async () => {
    setWorkshopBusy(true);
    setWorkshopError(undefined);
    setWorkshopStatus("Creating governed draft profile...");
    try {
      const profile = buildAgentWorkshopDraftProfile({
        workspaceId: "workspace-admin-playground",
        userId: "browser-user",
        role: draftRole,
        projectContext: draftContext,
        goals: linesFromTextarea(draftGoals),
        constraints: linesFromTextarea(draftConstraints)
      });
      const response = await createControlApiAgentProfileDraft({
        workspaceId: profile.workspaceId,
        profile
      });
      setWorkshopProfiles((profiles) => [
        response.profile,
        ...profiles.filter(
          (candidate) => profileSelectionKey(candidate) !== profileSelectionKey(response.profile)
        )
      ]);
      setSelectedProfileKey(profileSelectionKey(response.profile));
      setWorkshopStatus(
        `Draft ${response.profile.profileId}@${response.profile.version} stored in DynamoDB and S3.`
      );
    } catch (caught) {
      setWorkshopError(
        caught instanceof Error ? caught.message : "Unable to create Agent Workshop draft."
      );
    } finally {
      setWorkshopBusy(false);
    }
  }, [draftConstraints, draftContext, draftGoals, draftRole]);

  const approveSelectedWorkshopProfile = React.useCallback(async () => {
    const selected = workshopProfiles.find(
      (profile) => profileSelectionKey(profile) === selectedProfileKey
    );
    if (!selected) return;
    setWorkshopBusy(true);
    setWorkshopError(undefined);
    setWorkshopStatus("Recording approval evidence...");
    try {
      const response = await approveControlApiAgentProfile({
        workspaceId: selected.workspaceId,
        profileId: selected.profileId,
        version: selected.version,
        notes: "Approved from admin Agent Workshop playground."
      });
      setWorkshopProfiles((profiles) =>
        profiles.map((profile) =>
          profileSelectionKey(profile) === profileSelectionKey(response.profile)
            ? response.profile
            : profile
        )
      );
      setSelectedProfileKey(profileSelectionKey(response.profile));
      setWorkshopStatus(
        `Approved ${response.profile.profileId}@${response.profile.version}; lifecycleState is now ${response.profile.lifecycleState}.`
      );
    } catch (caught) {
      setWorkshopError(
        caught instanceof Error ? caught.message : "Unable to approve Agent Workshop profile."
      );
    } finally {
      setWorkshopBusy(false);
    }
  }, [selectedProfileKey, workshopProfiles]);

  const inspectSelectedWorkshopProfile = React.useCallback(async () => {
    const selected = workshopProfiles.find(
      (profile) => profileSelectionKey(profile) === selectedProfileKey
    );
    if (!selected) return;
    setWorkshopBusy(true);
    setWorkshopError(undefined);
    setWorkshopStatus("Loading full profile version...");
    try {
      const response = await getControlApiAgentProfile({
        workspaceId: selected.workspaceId,
        profileId: selected.profileId,
        version: selected.version
      });
      setWorkshopProfiles((profiles) =>
        profiles.map((profile) =>
          profileSelectionKey(profile) === profileSelectionKey(response.profile)
            ? response.profile
            : profile
        )
      );
      setWorkshopStatus(`Loaded ${response.profile.profileId}@${response.profile.version} from Control API.`);
    } catch (caught) {
      setWorkshopError(
        caught instanceof Error ? caught.message : "Unable to inspect Agent Workshop profile."
      );
    } finally {
      setWorkshopBusy(false);
    }
  }, [selectedProfileKey, workshopProfiles]);

  const selectedRun = React.useMemo(
    () => data.runs.find((run) => run.runId === selectedRunId),
    [data.runs, selectedRunId]
  );
  const recentFailures = React.useMemo(
    () => data.runs.filter((run) => run.failureCount > 0 || run.status === "failed").slice(0, 5),
    [data.runs]
  );
  const selectedWorkshopProfile = React.useMemo(
    () => workshopProfiles.find((profile) => profileSelectionKey(profile) === selectedProfileKey),
    [selectedProfileKey, workshopProfiles]
  );
  const selectedWorkshopSummary = React.useMemo(
    () =>
      selectedWorkshopProfile ? summarizeAgentProfileRecord(selectedWorkshopProfile) : undefined,
    [selectedWorkshopProfile]
  );

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <div className="mx-auto max-w-[1440px] p-3 md:p-5">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandHeader title="Agents Cloud" subtitle="Admin operations" />
          </div>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <>
                <span className="hidden sm:inline-block max-w-[200px] truncate text-[12px] text-app-muted">
                  {userLabel}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={loading || !api.configured}
                >
                  <ReloadIcon className={cn(loading && "animate-spin")} />
                  {loading ? "Refreshing" : "Refresh"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={openSignIn}>
                Sign in
              </Button>
            )}
          </div>
        </header>

        <div className="mb-4">
          <SectionHeader
            title="Operations console"
            subtitle="Requests, processes, artifacts, failures, and per-user run state from the durable ledger."
          />
        </div>

        {!isAuthed ? (
          <Panel padding={16} className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-app-text">Sign in to load live data</div>
                <div className="mt-1 text-[12px] text-app-muted">
                  Admin endpoints require Cognito authentication. Local fixtures are visible without
                  signing in.
                </div>
              </div>
              <Button variant="primary" size="md" onClick={openSignIn}>
                Sign in
              </Button>
            </div>
          </Panel>
        ) : null}

        {!api.configured ? (
          <AlertBar tone="warning">Control API is not configured for this deployment.</AlertBar>
        ) : null}
        {error ? <AlertBar tone="danger">{error}</AlertBar> : null}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-2.5 mb-3">
          <MetricCard label="Total runs" value={String(data.totals.totalRuns)} hint="Durable ledger" />
          <MetricCard label="Running" value={String(data.totals.runningRuns)} hint="In progress" />
          <MetricCard label="Succeeded" value={String(data.totals.succeededRuns)} hint="Terminal ✓" />
          <MetricCard
            label="Failed"
            value={String(data.totals.failedRuns)}
            hint={data.totals.failedRuns > 0 ? "Investigate" : "All clear"}
          />
          <MetricCard
            label="Runners"
            value={String(runnerData.totals.runners)}
            hint={
              runnerData.totals.failedRunners + runnerData.totals.staleRunners > 0
                ? `${runnerData.totals.failedRunners} failed · ${runnerData.totals.staleRunners} stale`
                : "Healthy"
            }
          />
        </section>

        <section className="mb-3">
          <Panel padding={14}>
            <SectionHeader
              title="Runner fleet"
              subtitle={
                runnerError
                  ? "Runner fleet could not be loaded; request ledger remains available."
                  : describeRunnerHealth(runnerData.totals)
              }
            />
            {runnerError ? <AlertBar tone="danger" inline>{runnerError}</AlertBar> : null}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-app-muted">
                  Hosts
                </div>
                <div className="flex flex-col gap-1.5">
                  {runnerData.hosts.length ? (
                    runnerData.hosts.slice(0, 8).map((host) => (
                      <div
                        key={host.hostId}
                        className="flex items-start gap-2 rounded-[8px] border border-app-border bg-app-panel-deep p-2.5"
                      >
                        <StatusDot status={host.status} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-extrabold text-app-text truncate">
                            {host.hostId}
                          </div>
                          <div className="mt-0.5 text-[11px] text-app-muted truncate">
                            {host.placementTarget} · {host.status} · heartbeat{" "}
                            {formatDate(host.lastHeartbeatAt)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyLine>No runner hosts have checked in yet.</EmptyLine>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-app-muted">
                  User runners
                </div>
                <div className="flex flex-col gap-1.5">
                  {runnerData.runners.length ? (
                    sortRunnerRows(runnerData.runners)
                      .slice(0, 8)
                      .map((runner) => (
                        <RunnerRow key={`${runner.userId}-${runner.runnerId}`} runner={runner} />
                      ))
                  ) : (
                    <EmptyLine>No user runners have checked in yet.</EmptyLine>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </section>

        <section className="mb-3">
          <AgentWorkshopPanel
            busy={workshopBusy}
            constraints={draftConstraints}
            context={draftContext}
            error={workshopError}
            goals={draftGoals}
            onApproveSelected={() => void approveSelectedWorkshopProfile()}
            onCreateDraft={() => void createWorkshopDraft()}
            onInspectSelected={() => void inspectSelectedWorkshopProfile()}
            onRefresh={() => void refreshWorkshopProfiles()}
            onSelectProfile={setSelectedProfileKey}
            profiles={workshopProfiles}
            role={draftRole}
            selectedProfile={selectedWorkshopProfile}
            selectedProfileKey={selectedProfileKey}
            selectedSummary={selectedWorkshopSummary}
            setConstraints={setDraftConstraints}
            setContext={setDraftContext}
            setGoals={setDraftGoals}
            setRole={setDraftRole}
            status={workshopStatus}
          />
        </section>

        <section className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel padding={14}>
            <SectionHeader
              title="Recent requests"
              subtitle={lastLoadedAt ? `Updated ${formatDate(lastLoadedAt)}` : "Loading latest ledger state"}
            />
            <div className="mt-3 max-h-[620px] overflow-y-auto pr-1 flex flex-col gap-1.5">
              {data.runs.length ? (
                data.runs.map((run) => (
                  <button
                    key={run.runId}
                    onClick={() => setSelectedRunId(run.runId)}
                    type="button"
                    className={cn(
                      "flex items-start gap-2.5 rounded-[8px] border p-2.5 text-left transition-colors",
                      run.runId === selectedRunId
                        ? "bg-app-input border-app-text"
                        : "bg-app-panel-deep border-app-border hover:border-app-border-strong"
                    )}
                  >
                    <StatusDot status={run.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-extrabold text-app-text truncate">
                        {run.objective || "Untitled request"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-app-muted truncate">
                        {run.ownerEmail || run.userId} · {run.status} ·{" "}
                        {formatDate(run.updatedAt || run.createdAt)}
                      </div>
                    </div>
                    <div className="text-[10px] text-app-muted shrink-0">{run.eventCount} events</div>
                  </button>
                ))
              ) : (
                <EmptyLine>No runs found yet.</EmptyLine>
              )}
            </div>
          </Panel>

          <Panel padding={14}>
            {selectedRun ? (
              <RunDetail
                run={selectedRun}
                events={lineageEvents}
                lineageLoading={lineageLoading}
                lineageError={lineageError}
              />
            ) : (
              <EmptyLine>Select a run to inspect it.</EmptyLine>
            )}
          </Panel>
        </section>

        <section>
          <Panel padding={14}>
            <SectionHeader
              title="Failure watch"
              subtitle="Runs with failed status or failure events. Click to load lineage."
            />
            <div className="mt-3 flex flex-col gap-1.5">
              {recentFailures.length ? (
                recentFailures.map((run) => (
                  <button
                    key={run.runId}
                    onClick={() => setSelectedRunId(run.runId)}
                    type="button"
                    className="grid grid-cols-1 sm:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr_240px] items-center gap-2 rounded-[8px] border border-app-border bg-app-panel-deep p-2.5 text-left hover:border-app-border-strong"
                  >
                    <div className="flex items-center gap-2">
                      <CrossCircledIcon className="h-3.5 w-3.5 text-[#ff8f8f]" />
                      <span className="text-[12px] font-extrabold text-app-text truncate">
                        {run.ownerEmail || run.userId}
                      </span>
                    </div>
                    <span className="text-[12px] text-app-muted truncate">
                      {run.objective || run.runId}
                    </span>
                    <code className="hidden lg:block text-[10px] font-mono text-[#ff8f8f] truncate">
                      {formatFailure(run)}
                    </code>
                  </button>
                ))
              ) : (
                <EmptyLine>No failures in the current window.</EmptyLine>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function AgentWorkshopPanel({
  busy,
  constraints,
  context,
  error,
  goals,
  onApproveSelected,
  onCreateDraft,
  onInspectSelected,
  onRefresh,
  onSelectProfile,
  profiles,
  role,
  selectedProfile,
  selectedProfileKey,
  selectedSummary,
  setConstraints,
  setContext,
  setGoals,
  setRole,
  status
}: {
  busy: boolean;
  constraints: string;
  context: string;
  error?: string;
  goals: string;
  onApproveSelected: () => void;
  onCreateDraft: () => void;
  onInspectSelected: () => void;
  onRefresh: () => void;
  onSelectProfile: (key: string) => void;
  profiles: AgentProfileRegistryRecord[];
  role: string;
  selectedProfile?: AgentProfileRegistryRecord;
  selectedProfileKey?: string;
  selectedSummary?: AgentProfileDisplaySummary;
  setConstraints: (value: string) => void;
  setContext: (value: string) => void;
  setGoals: (value: string) => void;
  setRole: (value: string) => void;
  status?: string;
}) {
  const stages = agentWorkshopLifecycle();
  return (
    <Panel padding={14}>
      <SectionHeader
        title="Agent Workshop"
        subtitle={summarizeLifecycleReadiness(stages)}
        trailing={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
              Refresh profiles
            </Button>
            <Button variant="primary" size="sm" onClick={onCreateDraft} disabled={busy}>
              {busy ? "Working" : "Create live draft"}
            </Button>
          </div>
        }
      />
      {error ? <AlertBar tone="danger" inline>{error}</AlertBar> : null}
      {status ? <AlertBar tone="info" inline>{status}</AlertBar> : null}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[10px] border border-app-border bg-app-panel-deep p-3">
          <div className="text-[12px] font-extrabold text-app-text mb-2">Playground input</div>
          <div className="flex flex-col gap-2">
            <FormField label="Specialist role">
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-[6px] border border-app-border bg-app-input px-2.5 py-2 text-[13px] text-app-text focus:outline-none focus:border-app-text/40"
              />
            </FormField>
            <FormField label="Project context">
              <Textarea rows={3} value={context} onChange={(e) => setContext(e.target.value)} />
            </FormField>
            <FormField label="Goals, one per line">
              <Textarea rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} />
            </FormField>
            <FormField label="Constraints / approval rules">
              <Textarea
                rows={4}
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
              />
            </FormField>
            <p className="mt-1 text-[11px] leading-[1.4] text-app-muted">
              Creating a draft calls Control API, validates the shared profile contract, writes
              DynamoDB registry metadata, and persists the profile JSON bundle in S3.
            </p>
          </div>
        </div>

        <div className="rounded-[10px] border border-app-border bg-app-panel-deep p-3">
          <div className="text-[12px] font-extrabold text-app-text mb-2">Lifecycle map</div>
          <ol className="flex flex-col gap-2.5">
            {stages.map((stage) => (
              <li
                key={stage.id}
                className="rounded-[8px] border border-app-border bg-app-panel p-2.5"
              >
                <div className="flex items-center gap-2">
                  <StatusPill label={stage.status} />
                  <strong className="text-[13px] text-app-text">{stage.title}</strong>
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.4] text-app-muted">
                  {stage.operatorSummary}
                </p>
                <div className="mt-1.5 text-[10px] text-app-muted">
                  {stage.durableEvidence.join(" · ")}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-[10px] border border-app-border bg-app-panel-deep p-3">
          <div className="text-[12px] font-extrabold text-app-text mb-2">Profile registry</div>
          <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
            {profiles.length ? (
              profiles.map((profile) => {
                const summary = summarizeAgentProfileRecord(profile);
                const key = profileSelectionKey(profile);
                return (
                  <button
                    key={key}
                    onClick={() => onSelectProfile(key)}
                    type="button"
                    className={cn(
                      "flex items-start gap-2 rounded-[8px] border p-2.5 text-left transition-colors",
                      key === selectedProfileKey
                        ? "bg-app-input border-app-text"
                        : "bg-app-panel border-app-border hover:border-app-border-strong"
                    )}
                  >
                    <StatusDot status={summary.lifecycleState} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-extrabold text-app-text truncate">
                        {summary.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-app-muted truncate">
                        {summary.subtitle} · {formatDate(summary.updatedAt)}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <EmptyLine>No profiles yet. Create a draft to hit the live registry.</EmptyLine>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border border-app-border bg-app-panel-deep p-3">
          <div className="text-[12px] font-extrabold text-app-text mb-2">Selected version</div>
          {selectedProfile && selectedSummary ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-extrabold text-app-text truncate">
                    {selectedSummary.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-app-muted truncate">
                    {selectedSummary.id}
                  </div>
                </div>
                <StatusPill label={selectedSummary.lifecycleState} />
              </div>
              <ul className="text-[12px] text-app-muted leading-[1.5] pl-4 list-disc">
                {selectedSummary.toolPosture.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <KeyValueGrid>
                <KeyValue label="Workspace" value={selectedProfile.workspaceId} mono />
                <KeyValue
                  label="Artifact"
                  value={selectedProfile.artifactS3Uri || "not written"}
                  mono
                />
                <KeyValue label="Review ready" value={selectedSummary.reviewReady ? "yes" : "no"} />
                <KeyValue label="Promotion ready" value={selectedSummary.promotionReady ? "yes" : "no"} />
              </KeyValueGrid>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onInspectSelected} disabled={busy}>
                  Inspect from API
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onApproveSelected}
                  disabled={
                    busy ||
                    selectedProfile.lifecycleState === "approved" ||
                    selectedProfile.lifecycleState === "promoted"
                  }
                >
                  Approve version
                </Button>
              </div>
              <CollapsibleJson
                summary="Profile policy snapshot"
                payload={{
                  mission: selectedProfile.profile.mission,
                  toolPolicy: selectedProfile.profile.toolPolicy,
                  mcpPolicy: selectedProfile.profile.mcpPolicy,
                  evalPack: selectedProfile.profile.evalPack,
                  approval: selectedProfile.profile.approval
                }}
              />
            </div>
          ) : (
            <EmptyLine>Select or create a profile version to inspect approval and policy posture.</EmptyLine>
          )}
        </div>
      </div>
    </Panel>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-extrabold uppercase tracking-wider text-app-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function KeyValueGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-2">{children}</dl>;
}

function KeyValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[6px] border border-app-border bg-app-panel p-2 min-w-0">
      <dt className="text-[10px] font-extrabold uppercase tracking-wider text-app-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-[12px] text-app-text truncate",
          mono && "font-mono break-all"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function RunnerRow({ runner }: { runner: AdminRunnerRecord }) {
  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-app-border bg-app-panel-deep p-2.5">
      <StatusDot status={runner.status} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-extrabold text-app-text truncate">{runner.runnerId}</div>
        <div className="mt-0.5 text-[11px] text-app-muted truncate">
          {runner.userId} · {runner.workspaceId} · {runner.status} / {runner.desiredState}
        </div>
        <div className="text-[11px] text-app-muted truncate">
          {runner.hostId || "unassigned"} · heartbeat {formatDate(runner.lastHeartbeatAt)}
        </div>
      </div>
    </div>
  );
}

function RunDetail({
  run,
  events,
  lineageLoading,
  lineageError
}: {
  run: AdminRunSummary;
  events: RunEvent[];
  lineageLoading: boolean;
  lineageError?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[16px] font-black text-app-text truncate">
            {run.objective || "Untitled request"}
          </div>
          <div className="mt-1 text-[12px] text-app-muted">{run.ownerEmail || run.userId}</div>
        </div>
        <StatusPill label={run.status} />
      </div>

      <KeyValueGrid>
        <KeyValue label="Run ID" value={run.runId} mono />
        <KeyValue label="Workspace" value={run.workspaceId} mono />
        <KeyValue label="User" value={run.userId} mono />
        <KeyValue label="Created" value={formatDate(run.createdAt)} />
        <KeyValue label="Updated" value={formatDate(run.updatedAt)} />
        <KeyValue label="Latest event" value={run.latestEventType || "none"} />
        <KeyValue label="Latest event at" value={formatDate(run.latestEventAt)} />
        <KeyValue label="Events" value={String(run.eventCount)} />
        <KeyValue label="Artifacts" value={String(run.artifactCount)} />
        <KeyValue label="Failures" value={String(run.failureCount)} />
      </KeyValueGrid>
      {run.executionArn ? (
        <KeyValue label="Execution ARN" value={run.executionArn} mono />
      ) : null}

      <div className="rounded-[10px] border border-app-border bg-app-panel-deep p-3">
        <div className="flex items-start gap-2">
          <ActivityLogIcon className="mt-1 h-4 w-4 text-app-text" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-app-muted">
              Lineage
            </div>
            <div className="mt-1 text-sm font-extrabold text-app-text">
              {lineageLoading ? "Loading request pipeline..." : summarizePipelinePosition(events)}
            </div>
            <p className="mt-1 text-[12px] text-app-muted">
              User asked: {run.objective || "unknown request"}
            </p>
          </div>
        </div>
        {lineageError ? <AlertBar tone="danger" inline>{lineageError}</AlertBar> : null}
        {events.length ? (
          <div className="mt-3">
            {events.map((event, i) => {
              const step = describeAdminLineageEvent(event);
              return (
                <TimelineItem
                  key={event.id || `${event.runId}-${event.seq}`}
                  status={`#${step.seq}`}
                  title={step.summary}
                  body={`${step.type} · ${step.source} · ${formatDate(step.createdAt)}`}
                  isLast={i === events.length - 1}
                />
              );
            })}
            <details className="mt-2 group">
              <summary className="cursor-pointer text-[11px] text-app-muted flex items-center gap-1 hover:text-app-text">
                <ChevronDownIcon className="h-3 w-3 transition-transform group-open:rotate-180" />
                Raw event payloads
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {events.map((event) => (
                  <CollapsibleJson
                    key={event.id || `${event.runId}-${event.seq}-payload`}
                    summary={`#${event.seq} ${event.type}`}
                    payload={event.payload ?? {}}
                  />
                ))}
              </div>
            </details>
          </div>
        ) : (
          <EmptyLine>
            {lineageLoading ? "Loading lineage events..." : "No lineage events found for this run."}
          </EmptyLine>
        )}
      </div>

      <CollapsibleJson summary="Raw admin summary" payload={run as unknown as Record<string, unknown>} />
    </div>
  );
}

function CollapsibleJson({
  summary,
  payload
}: {
  summary: string;
  payload: unknown;
}) {
  return (
    <details className="rounded-[8px] border border-app-border bg-app-panel group">
      <summary className="cursor-pointer text-[11px] font-extrabold uppercase tracking-wider text-app-muted px-2.5 py-2 flex items-center gap-1.5 hover:text-app-text">
        <ChevronDownIcon className="h-3 w-3 transition-transform group-open:rotate-180" />
        {summary}
      </summary>
      <pre className="text-[11px] font-mono leading-[1.45] text-app-muted overflow-x-auto p-2.5 border-t border-app-border bg-app-panel-deep">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = statusClassName(status);
  const colorMap: Record<string, string> = {
    running: "bg-white",
    queued: "bg-app-muted",
    succeeded: "bg-emerald-400/80",
    failed: "bg-[#ff8f8f]",
    cancelled: "bg-app-muted",
    healthy: "bg-emerald-400/80",
    online: "bg-emerald-400/80",
    stale: "bg-amber-400/80",
    offline: "bg-[#ff8f8f]",
    approved: "bg-emerald-400/80",
    pending: "bg-amber-400/80",
    draft: "bg-app-muted",
    promoted: "bg-emerald-400/80",
    rejected: "bg-[#ff8f8f]"
  };
  const color = colorMap[cls] ?? "bg-app-muted";
  return (
    <span
      className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", color)}
      title={status}
      aria-label={status}
    />
  );
}

function AlertBar({
  tone,
  inline,
  children
}: {
  tone: "warning" | "danger" | "info";
  inline?: boolean;
  children: React.ReactNode;
}) {
  const toneStyles = {
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    danger: "border-[#7F1D1D]/60 bg-[#7F1D1D]/15 text-[#ff8f8f]",
    info: "border-app-border bg-app-input text-app-text"
  } as const;
  return (
    <div
      className={cn(
        "rounded-[8px] border p-2.5 text-[12px] leading-[1.45]",
        toneStyles[tone],
        inline ? "mt-2" : "mb-3"
      )}
    >
      {children}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-app-muted py-1">{children}</div>;
}

function formatDate(value?: string): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusClassName(status: string): string {
  return /^[a-z0-9_-]+$/i.test(status) ? status.toLowerCase() : "unknown";
}

function profileSelectionKey(
  profile: Pick<AgentProfileRegistryRecord, "workspaceId" | "profileId" | "version">
): string;
function profileSelectionKey(
  profile?: Pick<AgentProfileRegistryRecord, "workspaceId" | "profileId" | "version">
): string | undefined {
  if (!profile) return undefined;
  return `${profile.workspaceId}#${profile.profileId}#${profile.version}`;
}

function linesFromTextarea(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatFailure(run: AdminRunSummary): string {
  if (run.lastFailure) {
    return JSON.stringify(run.lastFailure);
  }
  return run.status === "failed" ? "failed status" : `${run.failureCount} failure events`;
}
