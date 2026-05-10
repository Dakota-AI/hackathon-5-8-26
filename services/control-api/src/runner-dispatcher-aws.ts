import { DescribeTasksCommand, ECSClient, RunTaskCommand, type RunTaskCommandInput } from "@aws-sdk/client-ecs";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { dispatchRunnerWake, RunnerDispatchError, type DispatcherWakeRequest, type RunnerApiTokenProvider, type RunnerLauncher, type RunnerLifecycleStatus, type RunnerObserver, type RunnerWakeClient } from "./runner-dispatcher.js";
import type { AuthenticatedUser, ExecutionStarter, RunnerStateStore } from "./ports.js";

/**
 * AWS-backed wiring for the RunnerDispatcher.
 *
 * - launchRunner → ecs:RunTask against the resident-runner family.
 * - postWake     → fetch POST http://<runnerEndpoint>/wake.
 * - getToken     → secretsmanager:GetSecretValue (cached per Lambda warm boot).
 *
 * Implements ExecutionStarter so it can be swapped in for StepFunctionsExecutionStarter
 * inside handlers.ts without touching create-run.ts.
 */

interface ResidentDispatchEnv {
  readonly residentTaskDefinitionArn: string;
  readonly residentContainerName: string;
  readonly clusterArn: string;
  readonly subnetIds: readonly string[];
  readonly securityGroupId: string;
  readonly runnerApiTokenSecretArn: string;
  readonly endpointPort: number;
  readonly launchWaitMs: number;
  readonly pollIntervalMs: number;
  readonly assignPublicIp: boolean;
}

function readEnv(): ResidentDispatchEnv {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return value;
  };
  return {
    residentTaskDefinitionArn: required("RESIDENT_RUNNER_TASK_DEFINITION_ARN"),
    residentContainerName: process.env.RESIDENT_RUNNER_CONTAINER_NAME ?? "resident-runner",
    clusterArn: required("RESIDENT_RUNNER_CLUSTER_ARN"),
    subnetIds: required("RESIDENT_RUNNER_SUBNET_IDS").split(",").map((s) => s.trim()).filter(Boolean),
    securityGroupId: required("RESIDENT_RUNNER_SECURITY_GROUP_ID"),
    runnerApiTokenSecretArn: required("RESIDENT_RUNNER_API_TOKEN_SECRET_ARN"),
    endpointPort: Number(process.env.RESIDENT_RUNNER_ENDPOINT_PORT ?? "8787"),
    launchWaitMs: Number(process.env.RESIDENT_RUNNER_LAUNCH_WAIT_MS ?? "150000"),
    pollIntervalMs: Number(process.env.RESIDENT_RUNNER_POLL_INTERVAL_MS ?? "1500"),
    assignPublicIp: (process.env.RESIDENT_RUNNER_ASSIGN_PUBLIC_IP ?? "false").toLowerCase() === "true"
  };
}

class EcsRunTaskLauncher implements RunnerLauncher {
  public constructor(private readonly client: ECSClient, private readonly env: ResidentDispatchEnv, private readonly controlApiUrl?: string) {}

  public async launchRunner(input: { readonly userId: string; readonly runnerId: string; readonly workspaceId: string }): Promise<{ readonly taskArn: string }> {
    const overrides: RunTaskCommandInput = {
      cluster: this.env.clusterArn,
      taskDefinition: this.env.residentTaskDefinitionArn,
      count: 1,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [...this.env.subnetIds],
          securityGroups: [this.env.securityGroupId],
          assignPublicIp: this.env.assignPublicIp ? "ENABLED" : "DISABLED"
        }
      },
      overrides: {
        containerOverrides: [{
          name: this.env.residentContainerName,
          environment: [
            { name: "USER_ID", value: input.userId },
            { name: "RUNNER_ID", value: input.runnerId },
            { name: "WORKSPACE_ID", value: input.workspaceId },
            { name: "ORG_ID", value: `org-${input.userId}` },
            ...(this.controlApiUrl ? [{ name: "CONTROL_API_URL", value: this.controlApiUrl }] : [])
          ]
        }]
      },
      propagateTags: "TASK_DEFINITION"
    };
    const result = await this.client.send(new RunTaskCommand(overrides));
    const task = result.tasks?.[0];
    const failure = result.failures?.[0];
    if (failure) {
      throw new Error(`ECS RunTask failed: ${failure.reason ?? "unknown"} (${failure.detail ?? "no detail"})`);
    }
    if (!task?.taskArn) {
      throw new Error("ECS RunTask returned no task ARN.");
    }
    return { taskArn: task.taskArn };
  }
}

class EcsTaskObserver implements RunnerObserver {
  public constructor(private readonly client: ECSClient, private readonly clusterArn: string) {}

  public async describeRunner({ taskArn }: { readonly taskArn: string }): Promise<{ readonly status: RunnerLifecycleStatus; readonly privateIp?: string; readonly error?: string }> {
    const result = await this.client.send(new DescribeTasksCommand({ cluster: this.clusterArn, tasks: [taskArn] }));
    const task = result.tasks?.[0];
    if (!task) {
      return { status: "PROVISIONING" };
    }
    const lastStatus = task.lastStatus ?? "PROVISIONING";
    const status = mapEcsStatus(lastStatus);
    if (status === "STOPPED") {
      const reason = task.stoppedReason ?? task.containers?.[0]?.reason ?? "Task stopped";
      return { status, error: reason };
    }
    const privateIp = extractPrivateIp(task);
    return { status, privateIp };
  }
}

function mapEcsStatus(lastStatus: string): RunnerLifecycleStatus {
  if (lastStatus === "RUNNING") return "RUNNING";
  if (lastStatus === "STOPPED" || lastStatus === "DEPROVISIONING" || lastStatus === "STOPPING") return "STOPPED";
  if (lastStatus === "PENDING" || lastStatus === "ACTIVATING") return "PENDING";
  return "PROVISIONING";
}

function extractPrivateIp(task: { readonly attachments?: ReadonlyArray<{ readonly details?: ReadonlyArray<{ readonly name?: string; readonly value?: string }> }>; readonly containers?: ReadonlyArray<{ readonly networkInterfaces?: ReadonlyArray<{ readonly privateIpv4Address?: string }> }> }): string | undefined {
  const direct = task.containers?.flatMap((c) => c.networkInterfaces ?? []).find((nic) => nic.privateIpv4Address)?.privateIpv4Address;
  if (direct) return direct;
  const eniIp = task.attachments?.flatMap((a) => a.details ?? []).find((detail) => detail.name === "privateIPv4Address")?.value;
  return eniIp;
}

class FetchWakeClient implements RunnerWakeClient {
  public async postWake(input: { readonly endpoint: string; readonly token: string; readonly request: DispatcherWakeRequest }): Promise<unknown> {
    const url = `${input.endpoint.replace(/\/+$/, "")}/wake`;
    const retryMs = Number(process.env.RESIDENT_RUNNER_WAKE_RETRY_MS ?? "30000");
    const deadline = Date.now() + (Number.isFinite(retryMs) && retryMs > 0 ? retryMs : 30_000);
    let lastError: unknown;
    do {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${input.token}`
          },
          body: JSON.stringify(input.request)
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`POST ${url} → HTTP ${response.status}: ${text}`);
        }
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return { raw: text };
        }
      } catch (error) {
        lastError = error;
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    } while (Date.now() < deadline);
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

class CachedSecretsManagerTokenProvider implements RunnerApiTokenProvider {
  private cached?: string;
  public constructor(private readonly client: SecretsManagerClient, private readonly secretArn: string) {}
  public async getToken(): Promise<string> {
    if (this.cached) return this.cached;
    const result = await this.client.send(new GetSecretValueCommand({ SecretId: this.secretArn }));
    const value = result.SecretString ?? (result.SecretBinary ? Buffer.from(result.SecretBinary as Uint8Array).toString("utf8") : undefined);
    if (!value) {
      throw new Error(`Secret ${this.secretArn} returned no value.`);
    }
    this.cached = value;
    return value;
  }
}

export interface DispatcherExecutionStarterOptions {
  readonly store: RunnerStateStore;
  readonly resolveUser: (input: { readonly userId: string }) => AuthenticatedUser;
  readonly controlApiUrl?: string;
  readonly env?: ResidentDispatchEnv;
}

/**
 * Adapter: makes the runner dispatcher behave like a StepFunctions ExecutionStarter so
 * create-run.ts can use it without modification.
 */
export class DispatcherExecutionStarter implements ExecutionStarter {
  private readonly env: ResidentDispatchEnv;
  private readonly launcher: RunnerLauncher;
  private readonly observer: RunnerObserver;
  private readonly wakeClient: RunnerWakeClient;
  private readonly tokenProvider: RunnerApiTokenProvider;

  public constructor(private readonly options: DispatcherExecutionStarterOptions) {
    this.env = options.env ?? readEnv();
    const ecsClient = new ECSClient({});
    const secretsClient = new SecretsManagerClient({});
    this.launcher = new EcsRunTaskLauncher(ecsClient, this.env, options.controlApiUrl);
    this.observer = new EcsTaskObserver(ecsClient, this.env.clusterArn);
    this.wakeClient = new FetchWakeClient();
    this.tokenProvider = new CachedSecretsManagerTokenProvider(secretsClient, this.env.runnerApiTokenSecretArn);
  }

  public static isConfigured(): boolean {
    return Boolean(process.env.RESIDENT_RUNNER_TASK_DEFINITION_ARN);
  }

  public static fromEnvironment(options: DispatcherExecutionStarterOptions): DispatcherExecutionStarter {
    return new DispatcherExecutionStarter(options);
  }

  public async startExecution(input: {
    readonly runId: string;
    readonly taskId: string;
    readonly workspaceId: string;
    readonly workItemId?: string;
    readonly userId: string;
    readonly objective: string;
  }): Promise<{ executionArn: string }> {
    const user = this.options.resolveUser({ userId: input.userId });
    try {
      const result = await dispatchRunnerWake(
        {
          store: this.options.store,
          launcher: this.launcher,
          observer: this.observer,
          wakeClient: this.wakeClient,
          tokenProvider: this.tokenProvider,
          user,
          workspaceId: input.workspaceId,
          now: () => new Date().toISOString(),
          newId: () => `${input.runId}-runner`,
          launchWaitMs: this.env.launchWaitMs,
          pollIntervalMs: this.env.pollIntervalMs,
          endpointPort: this.env.endpointPort
        },
        {
          objective: input.objective,
          runId: input.runId,
          taskId: input.taskId,
          workItemId: input.workItemId
        }
      );
      // Reuse executionArn slot for the resident task ARN so the rest of the
      // ledger stays compatible. Frontends that read executionArn now see the
      // ECS task ARN instead of an SFN one.
      return { executionArn: result.runner.taskArn ?? `runner-${result.runner.runnerId}` };
    } catch (error) {
      if (error instanceof RunnerDispatchError) {
        throw error;
      }
      throw new Error(`Dispatcher execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
