# ADR 0008: User Runner Placement

Date: 2026-05-10
Status: Accepted

## Context

The platform needs proactive agents that feel present and fast. Some agents wait
on other agents, approvals, timers, external signals, or user messages. Treating
every agent action as a short queued job would make the experience feel cold and
would not match the product model.

At the same time, one container per custom agent is too expensive and too noisy
for the first platform shape. Users may create many custom agents, but the
security and resource boundary should be the user, not every individual logical
agent.

The platform also needs placement flexibility:

- a personal local Docker host can run resident user runners cheaply,
- ECS can run the same user runner when local capacity is full or unavailable,
- S3 remains the durable workspace, artifact, and snapshot store,
- EFS remains deferred until a hot shared POSIX workspace is required.

## Decision

Use one dedicated resident runner container per user.

Each user runner hosts many logical agents for that user:

```text
user runner container
  -> research agent
  -> coding agent
  -> marketing agent
  -> daily brief agent
  -> approval/status agent
```

The user runner is the tenancy boundary. Logical agents inside a runner can
share user-scoped memory, state, workspaces, plans, approvals, and coordination
channels. Separate users do not share runner containers, mounted workspaces,
profile state, or runtime tokens.

Use one balanced runner class for the first version:

```yaml
userRunner:
  cpu: 1 vCPU
  memory: 3 GiB
  memoryReservation: 768 MiB
  localDiskBudget: 8 GiB
  maxAgentsInside: 10
  maxActiveAgentActions: 3
```

Do not introduce basic, power, or GPU runner classes yet. Keep the product and
placement model simple until actual usage data proves the need for additional
classes.

Placement targets are:

```text
local-docker
ecs-fargate
ecs-ec2
```

Initial placement policy:

```text
if a local Docker host is online and has capacity:
  place or keep the user's runner locally
else:
  place or keep the user's runner on ECS
```

Do not present this as a user-visible queue. A user runner should either be
resident on an available host or restored on another placement target.

## Local Docker Placement

A trusted host supervisor runs on the local machine. It owns Docker control,
admission checks, lifecycle management, snapshots, and heartbeats.

The user runner container must not receive the Docker socket. If a user runner
needs privileged or heavyweight execution, it asks the host supervisor through a
controlled interface.

Local host responsibilities:

- report host capacity and health,
- start, stop, and restart user runners,
- enforce CPU, memory, process, filesystem, and network policy,
- snapshot runner state and workspaces to S3,
- restore user state from S3 before starting a runner,
- mark runners stale when heartbeats stop,
- delete bounded scratch state after upload/checkpoint.

The inspected local host profile is suitable for this first placement target:

```yaml
cpuThreads: 12
memory: 30 GiB
gpu: 12 GiB consumer GPU
rootDiskFreeAfterCleanup: 116 GiB
recommendedLocalUserRunners: 8
maximumLocalUserRunnersForDemo: 10
```

The conservative local cap is 8 resident user runners so the host retains
operating-system, Docker, cache, and burst headroom.

## ECS Placement

On ECS, use the same user runner image and contract.

For the first ECS implementation, a cloud runner can be represented as an ECS
service with desired count 1:

```text
user-runner-{userId}
  desiredCount: 1
  task size: 1 vCPU / 3 GiB
  ephemeral storage: default task storage
  public inbound access: none
  outbound control-plane connection: yes
```

This gives the runner resident behavior. If the task crashes, ECS replaces it.
The runner still writes durable state, artifacts, and snapshots to S3.

For larger always-on user counts, ECS on EC2 capacity can pack many user runner
tasks onto managed hosts. Fargate remains the simpler first cloud fallback.

## State Model

Add these product/control-plane objects:

```text
HostNode
UserRunner
RunnerPlacement
RunnerHeartbeat
RunnerSnapshot
AgentInstance
AgentMessage
AgentWakeTimer
AgentTask
```

`HostNode` records where runners can be placed:

```json
{
  "hostId": "host-local-001",
  "type": "local-docker",
  "status": "online",
  "cpuCapacity": 12,
  "memoryGiB": 30,
  "diskFreeGiB": 116,
  "maxUserRunners": 8,
  "lastHeartbeatAt": "..."
}
```

`UserRunner` records the user's resident runtime:

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

`AgentInstance` records logical agents inside a user runner:

```json
{
  "agentId": "agent-001",
  "runnerId": "runner-user-001",
  "userId": "user-001",
  "name": "Research Agent",
  "status": "idle",
  "nextWakeAt": "...",
  "blockedOn": null
}
```

## Runner Contract

Every runner receives only scoped runtime configuration:

```text
RUNNER_ID
USER_ID
WORKSPACE_ID
CONTROL_API_URL
RUNNER_TOKEN
S3_WORKSPACE_PREFIX
S3_ARTIFACT_PREFIX
S3_SNAPSHOT_PREFIX
```

Runner tokens must be scoped to a single user/workspace boundary.

## Security Rules

- Do not mount the Docker socket into user runner containers.
- Do not share host home directories with user runner containers.
- Mount only user-scoped runner directories.
- Drop unnecessary Linux capabilities.
- Use hard memory and process limits.
- Use per-run and per-user disk budgets.
- Keep durable state in S3, not only local disk.
- Use short-lived scoped credentials or a credential broker before enabling real
  provider/model/tool secrets in runners.
- Do not allow one runner to read another user's S3 prefixes, state, artifacts,
  or event streams.

## Consequences

- Users can have always-warm proactive agents without one container per custom
  agent.
- The local host can serve multiple users while preserving user-level isolation.
- ECS can run the same runner image for overflow or cloud-only users.
- The control plane needs placement, heartbeat, snapshot, and admission logic.
- Fargate is simple but expensive for many always-on free users.
- EC2-backed ECS becomes attractive once many resident runners need to stay
  online continuously.
- The runtime must distinguish logical agents from worker containers.
