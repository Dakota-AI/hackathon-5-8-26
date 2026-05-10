# User Runner Local And ECS Architecture

Date: 2026-05-10
Status: Current architecture plan

## Summary

The execution model is one resident runner container per user, with many
user-created logical agents inside that runner.

```text
User
  -> UserRunner container
    -> Research Agent
    -> Coding Agent
    -> Marketing Agent
    -> Daily Brief Agent
    -> Status/Approval Agent
```

The user runner is the isolation boundary. Logical agents inside the runner
share user-scoped memory, state, workspaces, artifacts, wake timers, approvals,
and coordination channels.

Placement is flexible:

```text
local Docker host first
ECS Fargate fallback
ECS on EC2 later for denser always-on scale
```

S3 remains the durable workspace, artifact, and snapshot source of truth. Local
disk and ECS task storage are warm runtime scratch, not permanent state.

## Why This Model

The product needs proactive agents that can stay alive, wait for each other,
watch for timers or approvals, and respond quickly when a user returns.

A short job queue alone is not enough because:

- a user expects their agent team to feel present,
- agents need background state machines,
- agents can block on other agents or user approvals,
- custom agents should not require one host container each,
- the platform must support long-lived workflows without keeping heavyweight
  build containers active forever.

The user runner solves this by keeping a lightweight resident process online per
user while keeping heavy work bounded and supervised.

## Balanced Runner Class

Use one runner class for every user until real usage data proves otherwise.

```yaml
balancedUserRunner:
  cpu: 1 vCPU
  memory: 3 GiB
  memoryReservation: 768 MiB
  localDiskBudget: 8 GiB
  maxAgentsInside: 10
  maxActiveAgentActions: 3
  snapshotIntervalMinutes: 5
  heartbeatIntervalSeconds: 15
  idleCheckpointMinutes: 15
```

Do not add separate basic, power, or GPU classes yet. Keep admission, billing,
capacity, and user messaging simple.

## Local Host Capacity

The inspected local Docker host is viable as a first dedicated placement target:

```yaml
cpuThreads: 12
memory: 30 GiB
gpuMemory: 12 GiB
rootDiskFreeAfterCleanup: 116 GiB
dockerInstalled: true
gpuRuntimeInstalled: true
recommendedUserRunnerCap: 8
demoMaximumUserRunnerCap: 10
```

Use 8 as the first hard cap. Ten is acceptable for a controlled demo, but 8
leaves better room for the operating system, Docker, existing services, logs,
image pulls, snapshots, and temporary workspaces.

## Local Host Directory Layout

```text
/srv/agents-cloud/
  host/
    config.json
    supervisor-state.json
  users/
    {userId}/
      profile/
      agents/
        {agentId}/
          config.json
          memory/
          state.json
      workspaces/
      artifacts/
      snapshots/
      tmp/
```

Only the matching user's directory is mounted into a user's runner container.

Inside the container:

```text
/home/runner/.agents-cloud
/agents
/workspaces
/artifacts
/state
/tmp
```

## Local Runner Container Shape

The host supervisor should create containers with strict limits:

```bash
docker run -d \
  --name user-runner-$USER_ID \
  --cpus 1 \
  --memory 3g \
  --memory-reservation 768m \
  --memory-swap 3g \
  --pids-limit 512 \
  --ulimit nofile=4096:4096 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --restart unless-stopped \
  -v /srv/agents-cloud/users/$USER_ID/profile:/home/runner/.agents-cloud \
  -v /srv/agents-cloud/users/$USER_ID/agents:/agents \
  -v /srv/agents-cloud/users/$USER_ID/workspaces:/workspaces \
  -v /srv/agents-cloud/users/$USER_ID/artifacts:/artifacts \
  -v /srv/agents-cloud/users/$USER_ID/snapshots:/snapshots \
  -v /srv/agents-cloud/users/$USER_ID/tmp:/tmp \
  agents-cloud-user-runner:latest
```

The runner container must not receive:

- `/var/run/docker.sock`,
- host home directory mounts,
- broad host paths,
- unscoped cloud credentials,
- cross-user filesystem mounts.

## ECS Fargate Shape

The first ECS version should run the same image and contract:

```yaml
task:
  cpu: 1 vCPU
  memory: 3 GiB
  ephemeralStorage: default
service:
  desiredCount: 1
  publicInbound: false
  outboundControlPlane: true
```

Represent each cloud user runner as a resident ECS service with desired count 1.
This preserves the product behavior: each user has a warm runner that ECS
replaces if it crashes.

For a hackathon/demo, ECS Fargate is the easiest cloud placement. For many
always-on users, ECS on EC2 should become the denser placement target.

## Placement Flow

```text
Create or restore user runner
  -> scheduler loads host capacity
  -> if local host is online and under cap:
       place on local-docker
     else:
       place on ecs-fargate
  -> write RunnerPlacement
  -> supervisor or ECS starts runner
  -> runner restores state from S3
  -> runner heartbeats to Control API
```

No user-visible queue is needed for resident runner placement. The system either
places the runner locally or places it in cloud capacity.

## Runtime Flow Inside A User Runner

```text
User message / timer / event arrives
  -> runner receives it
  -> logical agent wakes
  -> agent plans or delegates to another logical agent
  -> runner records state/events
  -> runner writes artifacts/checkpoints
  -> runner sleeps until next event or timer
```

Logical agents should be event-driven. They should not spin in busy loops while
waiting for other agents.

Agent wait states must be explicit:

```json
{
  "agentId": "agent-001",
  "status": "waiting",
  "waitingFor": "agent-002",
  "blockedOn": "approval-001",
  "nextWakeAt": "2026-05-10T14:00:00Z"
}
```

## Heavy Work

The resident user runner can perform lightweight planning, coordination, and
small tool work directly. Heavy or risky work should be handed to a supervised
execution path.

Examples:

- package installation,
- large repository builds,
- browser automation,
- model-heavy work,
- long-running code generation,
- external deployment,
- destructive actions.

The runner asks the host supervisor or cloud control plane to execute bounded
work. The runner does not receive direct host Docker control.

## Data Model Additions

### HostNode

Tracks a placement host.

```json
{
  "hostId": "host-local-001",
  "type": "local-docker",
  "status": "online",
  "cpuCapacity": 12,
  "memoryGiB": 30,
  "diskFreeGiB": 116,
  "maxUserRunners": 8,
  "runningUserRunners": 3,
  "lastHeartbeatAt": "..."
}
```

### UserRunner

Tracks a user's resident runner.

```json
{
  "runnerId": "runner-user-001",
  "userId": "user-001",
  "workspaceId": "workspace-001",
  "status": "running",
  "desiredState": "running",
  "placementTarget": "local-docker",
  "hostId": "host-local-001",
  "cpuLimit": 1,
  "memoryLimitMiB": 3072,
  "diskLimitGiB": 8,
  "lastHeartbeatAt": "..."
}
```

### AgentInstance

Tracks a logical agent inside a user runner.

```json
{
  "agentId": "agent-001",
  "runnerId": "runner-user-001",
  "userId": "user-001",
  "name": "Research Agent",
  "status": "idle",
  "nextWakeAt": null,
  "blockedOn": null
}
```

### RunnerSnapshot

Tracks state saved to S3.

```json
{
  "snapshotId": "snapshot-001",
  "runnerId": "runner-user-001",
  "userId": "user-001",
  "s3Prefix": "users/user-001/runners/runner-user-001/snapshots/snapshot-001/",
  "createdAt": "...",
  "reason": "periodic"
}
```

## New Services Needed

### Host Supervisor

Runs on local Docker hosts.

Responsibilities:

- authenticate to Control API,
- register and heartbeat `HostNode`,
- poll desired `UserRunner` placements assigned to the host,
- create and supervise Docker containers,
- enforce limits,
- collect runner health,
- trigger snapshot/restore,
- report container exits and failures,
- clean old scratch state.

### Runner Placement Scheduler

Runs in the cloud control plane.

Responsibilities:

- decide local vs ECS placement,
- enforce local host caps,
- create `UserRunner` and `RunnerPlacement` records,
- mark stale runners,
- start ECS runner services when needed,
- request local supervisor placement when available.

### User Runner Runtime

Runs inside each user runner container.

Responsibilities:

- host multiple logical agents,
- maintain user-scoped state,
- process messages, wake timers, approvals, and events,
- write canonical events,
- create artifacts,
- checkpoint state,
- request bounded heavy work through trusted control surfaces.

## Security Requirements

- User runner tokens must be scoped to one user/workspace.
- Runner credentials must not allow cross-user reads.
- Runners must not receive host Docker control.
- Host supervisor credentials are privileged and must stay outside user runners.
- S3 prefixes must be user/workspace scoped.
- DynamoDB access must enforce user/workspace boundaries in application logic and
  IAM where possible.
- Logs must not include provider keys, runner tokens, user secrets, or raw
  workspace credentials.
- Every runner action that can spend money, publish externally, delete data, or
  mutate connected systems needs an approval policy.

## Implementation Phases

### Phase 1: Documented Control-Plane Model

- Add ADR 0008.
- Add this roadmap.
- Update agent instructions and docs indexes.

### Phase 2: Data Model And APIs

- Add `HostNode` table.
- Add `UserRunner` table.
- Add `AgentInstance` table.
- Add runner heartbeat endpoint.
- Add runner desired-state endpoint.
- Add placement scheduler interface.

### Phase 3: Local Host Supervisor

- Create a `services/local-runner-supervisor` package.
- Implement host registration and heartbeat.
- Implement Docker container create/stop/status.
- Implement per-user directory creation under `/srv/agents-cloud`.
- Implement resource-limit enforcement.
- Implement stale container cleanup.

### Phase 4: User Runner Runtime

- Create a user-runner image or mode.
- Add logical agent registry.
- Add inbox, wake timers, and inter-agent messages.
- Add snapshot/restore to S3.
- Add canonical event writing.
- Add minimal proactive loop.

### Phase 5: ECS Placement

- Add ECS task/service path for `UserRunner`.
- Use the same runner image and environment contract.
- Add desired count 1 per cloud runner.
- Add cloud placement fallback when local capacity is unavailable.

### Phase 6: Product Surface

- Add web UI for user runner status.
- Add custom agent creation inside a runner.
- Add agent list, agent state, wake timers, recent events, artifacts, and
  approvals.
- Add admin host capacity view.

## Testing Requirements

- Unit test placement decisions.
- Unit test host-cap admission checks.
- Unit test runner token scope checks.
- Unit test runner heartbeat stale detection.
- Integration test local supervisor against Docker in a controlled environment.
- Integration test runner snapshot/restore against S3-compatible mocks or
  isolated test buckets.
- E2E test: create user runner, create logical agent, send message, receive
  canonical event, snapshot state, restart runner, restore state.
- E2E test: local host full -> scheduler places runner on ECS.

## What Is Explicitly Deferred

- EFS mounted workspaces.
- Per-agent containers.
- Multiple runner classes.
- GPU-specific runner classes.
- ECS Anywhere.
- Public inbound access to user runners.
- Cross-user shared runner containers.
- Direct Docker control from inside user runners.
