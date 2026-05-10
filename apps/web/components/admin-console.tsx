"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readAmplifyEnv } from "../lib/amplify-config";
import {
  agentWorkshopLifecycle,
  buildAgentWorkshopDraftProfile,
  summarizeAgentProfileRecord,
  summarizeLifecycleReadiness,
  type AgentProfileDisplaySummary
} from "../lib/agent-workshop";
import { resetAmplifyAuthSession } from "../lib/auth-session-reset";
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

const defaultAdminState: AdminRunsResponse = {
  runs: [],
  totals: {
    totalRuns: 0,
    failedRuns: 0,
    runningRuns: 0,
    succeededRuns: 0
  }
};

const defaultRunnerState: AdminRunnersResponse = {
  hosts: [],
  runners: [],
  totals: {
    hosts: 0,
    runners: 0,
    failedHosts: 0,
    failedRunners: 0,
    staleRunners: 0
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
  const [runnerData, setRunnerData] = useState<AdminRunnersResponse>(defaultRunnerState);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [lineageEvents, setLineageEvents] = useState<RunEvent[]>([]);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [runnerError, setRunnerError] = useState<string | undefined>();
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>();
  const [workshopProfiles, setWorkshopProfiles] = useState<AgentProfileRegistryRecord[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | undefined>();
  const [workshopStatus, setWorkshopStatus] = useState<string | undefined>();
  const [workshopError, setWorkshopError] = useState<string | undefined>();
  const [workshopBusy, setWorkshopBusy] = useState(false);
  const [draftRole, setDraftRole] = useState("Market Research Strategist");
  const [draftContext, setDraftContext] = useState("Solo CEO launch planning and operator leverage for a small founder-led company.");
  const [draftGoals, setDraftGoals] = useState("Find timely market/channel signals\nProduce an executive-ready brief\nAsk before paid APIs or external side effects");
  const [draftConstraints, setDraftConstraints] = useState("No paid Apify actor runs without approval\nNo public posts or email sends without approval\nCite source quality and uncertainty");

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedRunId || !api.configured) {
      setLineageEvents([]);
      return;
    }

    let cancelled = false;
    setLineageLoading(true);
    setLineageError(undefined);
    void listControlApiAdminRunEvents(selectedRunId, { limit: 100 })
      .then((response) => {
        if (!cancelled) {
          setLineageEvents(response.events);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setLineageError(caught instanceof Error ? caught.message : "Unable to load run lineage.");
          setLineageEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLineageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api.configured, selectedRunId]);

  const refreshWorkshopProfiles = useCallback(async () => {
    if (!api.configured) {
      setWorkshopProfiles([]);
      return;
    }
    setWorkshopError(undefined);
    try {
      const response = await listControlApiAgentProfiles({ limit: 25 });
      setWorkshopProfiles(response.profiles);
      setSelectedProfileKey((current) => current ?? profileSelectionKey(response.profiles[0]));
    } catch (caught) {
      setWorkshopError(caught instanceof Error ? caught.message : "Unable to load Agent Workshop profiles.");
    }
  }, [api.configured]);

  useEffect(() => {
    void refreshWorkshopProfiles();
  }, [refreshWorkshopProfiles]);

  const createWorkshopDraft = useCallback(async () => {
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
      const response = await createControlApiAgentProfileDraft({ workspaceId: profile.workspaceId, profile });
      setWorkshopProfiles((profiles) => [response.profile, ...profiles.filter((candidate) => profileSelectionKey(candidate) !== profileSelectionKey(response.profile))]);
      setSelectedProfileKey(profileSelectionKey(response.profile));
      setWorkshopStatus(`Draft ${response.profile.profileId}@${response.profile.version} stored in DynamoDB and S3.`);
    } catch (caught) {
      setWorkshopError(caught instanceof Error ? caught.message : "Unable to create Agent Workshop draft.");
    } finally {
      setWorkshopBusy(false);
    }
  }, [draftConstraints, draftContext, draftGoals, draftRole]);

  const approveSelectedWorkshopProfile = useCallback(async () => {
    const selected = workshopProfiles.find((profile) => profileSelectionKey(profile) === selectedProfileKey);
    if (!selected) {
      return;
    }
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
      setWorkshopProfiles((profiles) => profiles.map((profile) => profileSelectionKey(profile) === profileSelectionKey(response.profile) ? response.profile : profile));
      setSelectedProfileKey(profileSelectionKey(response.profile));
      setWorkshopStatus(`Approved ${response.profile.profileId}@${response.profile.version}; lifecycleState is now ${response.profile.lifecycleState}.`);
    } catch (caught) {
      setWorkshopError(caught instanceof Error ? caught.message : "Unable to approve Agent Workshop profile.");
    } finally {
      setWorkshopBusy(false);
    }
  }, [selectedProfileKey, workshopProfiles]);

  const inspectSelectedWorkshopProfile = useCallback(async () => {
    const selected = workshopProfiles.find((profile) => profileSelectionKey(profile) === selectedProfileKey);
    if (!selected) {
      return;
    }
    setWorkshopBusy(true);
    setWorkshopError(undefined);
    setWorkshopStatus("Loading full profile version...");
    try {
      const response = await getControlApiAgentProfile({ workspaceId: selected.workspaceId, profileId: selected.profileId, version: selected.version });
      setWorkshopProfiles((profiles) => profiles.map((profile) => profileSelectionKey(profile) === profileSelectionKey(response.profile) ? response.profile : profile));
      setWorkshopStatus(`Loaded ${response.profile.profileId}@${response.profile.version} from Control API.`);
    } catch (caught) {
      setWorkshopError(caught instanceof Error ? caught.message : "Unable to inspect Agent Workshop profile.");
    } finally {
      setWorkshopBusy(false);
    }
  }, [selectedProfileKey, workshopProfiles]);

  const selectedRun = useMemo(() => data.runs.find((run) => run.runId === selectedRunId), [data.runs, selectedRunId]);
  const recentFailures = useMemo(() => data.runs.filter((run) => run.failureCount > 0 || run.status === "failed").slice(0, 5), [data.runs]);
  const selectedWorkshopProfile = useMemo(() => workshopProfiles.find((profile) => profileSelectionKey(profile) === selectedProfileKey), [selectedProfileKey, workshopProfiles]);
  const selectedWorkshopSummary = useMemo(() => selectedWorkshopProfile ? summarizeAgentProfileRecord(selectedWorkshopProfile) : undefined, [selectedWorkshopProfile]);

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
        <MetricCard label="Runners" value={runnerData.totals.runners} danger={runnerData.totals.failedRunners + runnerData.totals.staleRunners > 0} />
      </section>

      <section className="admin-panel runner-panel">
        <div className="panel-heading">
          <div>
            <h2>Runner fleet</h2>
            <p>{runnerError ? "Runner fleet could not be loaded; request ledger remains available." : describeRunnerHealth(runnerData.totals)}</p>
          </div>
        </div>
        {runnerError ? <div className="admin-alert danger inline-alert">{runnerError}</div> : null}
        <div className="runner-grid">
          <div>
            <h3>Hosts</h3>
            <div className="runner-list">
              {runnerData.hosts.length ? (
                runnerData.hosts.slice(0, 8).map((host) => (
                  <div className="runner-row" key={host.hostId}>
                    <span className={`status-dot ${statusClassName(host.status)}`} />
                    <span>
                      <strong>{host.hostId}</strong>
                      <small>{host.placementTarget} · {host.status} · heartbeat {formatDate(host.lastHeartbeatAt)}</small>
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">No runner hosts have checked in yet.</div>
              )}
            </div>
          </div>
          <div>
            <h3>User runners</h3>
            <div className="runner-list">
              {runnerData.runners.length ? (
                sortRunnerRows(runnerData.runners).slice(0, 8).map((runner) => <RunnerRow key={`${runner.userId}-${runner.runnerId}`} runner={runner} />)
              ) : (
                <div className="empty-state">No user runners have checked in yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>

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
                  <span className={`status-dot ${statusClassName(run.status)}`} />
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
          {selectedRun ? (
            <RunDetail run={selectedRun} events={lineageEvents} lineageLoading={lineageLoading} lineageError={lineageError} />
          ) : (
            <div className="empty-state">Select a run to inspect it.</div>
          )}
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
    <section className="admin-panel workshop-panel">
      <div className="panel-heading workshop-heading">
        <div>
          <span className="eyebrow">Agent Workshop</span>
          <h2>Create, validate, audit, approve</h2>
          <p>{summarizeLifecycleReadiness(stages)}</p>
        </div>
        <div className="workshop-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>Refresh profiles</button>
          <button type="button" onClick={onCreateDraft} disabled={busy}>{busy ? "Working" : "Create live draft"}</button>
        </div>
      </div>

      {error ? <div className="admin-alert danger inline-alert">{error}</div> : null}
      {status ? <div className="admin-alert inline-alert">{status}</div> : null}

      <div className="workshop-grid">
        <div className="workshop-card workshop-form">
          <h3>Playground input</h3>
          <label>
            <span>Specialist role</span>
            <input value={role} onChange={(event) => setRole(event.target.value)} />
          </label>
          <label>
            <span>Project context</span>
            <textarea rows={3} value={context} onChange={(event) => setContext(event.target.value)} />
          </label>
          <label>
            <span>Goals, one per line</span>
            <textarea rows={4} value={goals} onChange={(event) => setGoals(event.target.value)} />
          </label>
          <label>
            <span>Constraints / approval rules</span>
            <textarea rows={4} value={constraints} onChange={(event) => setConstraints(event.target.value)} />
          </label>
          <p className="workshop-copy">Creating a draft calls Control API, validates the shared profile contract, writes DynamoDB registry metadata, and persists the profile JSON bundle in S3.</p>
        </div>

        <div className="workshop-card">
          <h3>Lifecycle map</h3>
          <ol className="workshop-stage-list">
            {stages.map((stage) => (
              <li key={stage.id} className={`workshop-stage ${stage.status}`}>
                <span>{stage.status}</span>
                <strong>{stage.title}</strong>
                <p>{stage.operatorSummary}</p>
                <small>{stage.durableEvidence.join(" · ")}</small>
              </li>
            ))}
          </ol>
        </div>

        <div className="workshop-card">
          <h3>Profile registry</h3>
          <div className="workshop-profile-list">
            {profiles.length ? profiles.map((profile) => {
              const summary = summarizeAgentProfileRecord(profile);
              const key = profileSelectionKey(profile);
              return (
                <button className={key === selectedProfileKey ? "workshop-profile-row selected" : "workshop-profile-row"} key={key} onClick={() => onSelectProfile(key)} type="button">
                  <span className={`status-dot ${statusClassName(summary.lifecycleState)}`} />
                  <span>
                    <strong>{summary.title}</strong>
                    <small>{summary.subtitle} · {formatDate(summary.updatedAt)}</small>
                  </span>
                </button>
              );
            }) : <div className="empty-state">No profiles yet. Create a draft to hit the live registry.</div>}
          </div>
        </div>

        <div className="workshop-card">
          <h3>Selected version</h3>
          {selectedProfile && selectedSummary ? (
            <div className="workshop-selected">
              <div className="workshop-selected-head">
                <div>
                  <strong>{selectedSummary.title}</strong>
                  <small>{selectedSummary.id}</small>
                </div>
                <span className={`status-badge ${selectedSummary.lifecycleState}`}>{selectedSummary.lifecycleState}</span>
              </div>
              <ul>
                {selectedSummary.toolPosture.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <dl className="detail-grid compact">
                <Detail label="Workspace" value={selectedProfile.workspaceId} code />
                <Detail label="Artifact" value={selectedProfile.artifactS3Uri || "not written"} code />
                <Detail label="Review ready" value={selectedSummary.reviewReady ? "yes" : "no"} />
                <Detail label="Promotion ready" value={selectedSummary.promotionReady ? "yes" : "no"} />
              </dl>
              <div className="workshop-actions left">
                <button type="button" onClick={onInspectSelected} disabled={busy}>Inspect from API</button>
                <button type="button" onClick={onApproveSelected} disabled={busy || selectedProfile.lifecycleState === "approved" || selectedProfile.lifecycleState === "promoted"}>Approve version</button>
              </div>
              <details className="json-details compact-json">
                <summary>Profile policy snapshot</summary>
                <pre>{JSON.stringify({
                  mission: selectedProfile.profile.mission,
                  toolPolicy: selectedProfile.profile.toolPolicy,
                  mcpPolicy: selectedProfile.profile.mcpPolicy,
                  evalPack: selectedProfile.profile.evalPack,
                  approval: selectedProfile.profile.approval
                }, null, 2)}</pre>
              </details>
            </div>
          ) : (
            <div className="empty-state">Select or create a profile version to inspect approval and policy posture.</div>
          )}
        </div>
      </div>
    </section>
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

function RunnerRow({ runner }: { runner: AdminRunnerRecord }) {
  return (
    <div className="runner-row">
      <span className={`status-dot ${statusClassName(runner.status)}`} />
      <span>
        <strong>{runner.runnerId}</strong>
        <small>{runner.userId} · {runner.workspaceId} · {runner.status} / {runner.desiredState}</small>
        <small>{runner.hostId || "unassigned"} · heartbeat {formatDate(runner.lastHeartbeatAt)}</small>
      </span>
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

      <section className="lineage-section">
        <div className="lineage-summary">
          <span className="eyebrow">Lineage</span>
          <strong>{lineageLoading ? "Loading request pipeline..." : summarizePipelinePosition(events)}</strong>
          <p>User asked: {run.objective || "unknown request"}</p>
        </div>
        {lineageError ? <div className="admin-alert danger">{lineageError}</div> : null}
        {events.length ? (
          <ol className="lineage-list">
            {events.map((event) => {
              const step = describeAdminLineageEvent(event);
              return (
                <li className={step.hasError ? "lineage-step error" : "lineage-step"} key={event.id || `${event.runId}-${event.seq}`}>
                  <div className="lineage-marker">{step.seq}</div>
                  <div className="lineage-body">
                    <div className="lineage-step-head">
                      <strong>{step.summary}</strong>
                      <time>{formatDate(step.createdAt)}</time>
                    </div>
                    <p>{step.type} · {step.source}</p>
                    <details className="payload-details">
                      <summary>Payload</summary>
                      <pre>{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
                    </details>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty-state">{lineageLoading ? "Loading lineage events..." : "No lineage events found for this run."}</div>
        )}
      </section>

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

function statusClassName(status: string): string {
  return /^[a-z0-9_-]+$/i.test(status) ? status.toLowerCase() : "unknown";
}

function profileSelectionKey(profile: Pick<AgentProfileRegistryRecord, "workspaceId" | "profileId" | "version">): string;
function profileSelectionKey(profile?: Pick<AgentProfileRegistryRecord, "workspaceId" | "profileId" | "version">): string | undefined {
  if (!profile) {
    return undefined;
  }
  return `${profile.workspaceId}#${profile.profileId}#${profile.version}`;
}

function linesFromTextarea(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function formatFailure(run: AdminRunSummary): string {
  if (run.lastFailure) {
    return JSON.stringify(run.lastFailure);
  }
  return run.status === "failed" ? "failed status" : `${run.failureCount} failure events`;
}
