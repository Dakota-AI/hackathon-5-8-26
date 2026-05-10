import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, resolve } from "node:path";
import {
  inspectLocalHarness,
  renderInspection,
  renderLocalHarnessSummary,
  runLocalHarnessScenario,
  type LocalApprovalDecision
} from "./local-harness.js";

interface ParsedArgs {
  readonly command: "run" | "inspect" | "help";
  readonly flags: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === "help") {
    console.log(usage());
    return;
  }

  if (parsed.command === "inspect") {
    const root = stringFlag(parsed.flags, "root");
    if (!root) {
      throw new Error("inspect requires --root");
    }
    const { state, events } = await inspectLocalHarness(root);
    if (parsed.flags.json === true) {
      console.log(JSON.stringify({ state, events }, null, 2));
    } else {
      console.log(renderInspection(state, events));
    }
    return;
  }

  const interactive = parsed.flags.interactive === true;
  const answers = interactive ? await askInteractiveQuestions(parsed.flags) : undefined;
  const objective = answers?.objective ?? stringFlag(parsed.flags, "objective") ?? "Create a stock dashboard preview site and concise report.";
  const runId = stringFlag(parsed.flags, "run-id") ?? `run-local-${Date.now()}`;
  const root = stringFlag(parsed.flags, "root") ?? join(".agents", "local-runs", runId);
  await mkdir(resolve(root), { recursive: true });

  const result = await runLocalHarnessScenario({
    rootDir: root,
    objective,
    runId,
    taskId: stringFlag(parsed.flags, "task-id"),
    userId: stringFlag(parsed.flags, "user-id"),
    workspaceId: stringFlag(parsed.flags, "workspace-id"),
    orgId: stringFlag(parsed.flags, "org-id"),
    runnerId: stringFlag(parsed.flags, "runner-id"),
    agentRole: answers?.agentRole ?? stringFlag(parsed.flags, "agent-role"),
    userAnswer: answers?.userAnswer ?? stringFlag(parsed.flags, "answer"),
    previewDecision: answers?.previewDecision ?? approvalDecisionFlag(parsed.flags)
  });

  if (parsed.flags.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderLocalHarnessSummary(result));
  }

  if (parsed.flags["print-inspection"] === true) {
    const { state, events } = await inspectLocalHarness(result.rootDir);
    console.log("");
    console.log(renderInspection(state, events));
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const first = normalizedArgs[0];
  const command = first === "inspect" || first === "run" || first === "help" ? first : "run";
  const flagArgs = command === first ? normalizedArgs.slice(1) : normalizedArgs;
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < flagArgs.length; index += 1) {
    const item = flagArgs[index];
    if (!item?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${item}`);
    }
    const name = item.slice(2);
    const next = flagArgs[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }

  return { command, flags };
}

async function askInteractiveQuestions(flags: Record<string, string | boolean>): Promise<{
  readonly objective: string;
  readonly agentRole: string;
  readonly userAnswer: string;
  readonly previewDecision: LocalApprovalDecision;
}> {
  if (!input.isTTY) {
    const lines = await readPipedLines();
    const objectiveDefault = stringFlag(flags, "objective") ?? "Create a stock dashboard preview site and concise report.";
    const agentRoleDefault = stringFlag(flags, "agent-role") ?? "Product Builder Agent";
    const userAnswerDefault = stringFlag(flags, "answer") ?? "Use approved public information, keep the update concise, and ask before publishing.";
    return {
      objective: lines[0] || objectiveDefault,
      agentRole: lines[1] || agentRoleDefault,
      userAnswer: lines[2] || userAnswerDefault,
      previewDecision: parseApprovalDecision(lines[3] || approvalDecisionFlag(flags))
    };
  }

  const rl = createInterface({ input, output });
  try {
    const objective = await askWithDefault(
      rl,
      "Objective",
      stringFlag(flags, "objective") ?? "Create a stock dashboard preview site and concise report."
    );
    const agentRole = await askWithDefault(rl, "Agent role", stringFlag(flags, "agent-role") ?? "Product Builder Agent");
    const userAnswer = await askWithDefault(
      rl,
      "Answer to agent constraint question",
      stringFlag(flags, "answer") ?? "Use approved public information, keep the update concise, and ask before publishing."
    );
    const approval = await askWithDefault(rl, "Approve preview publishing? approved/rejected/pending", approvalDecisionFlag(flags));
    return {
      objective,
      agentRole,
      userAnswer,
      previewDecision: parseApprovalDecision(approval)
    };
  } finally {
    rl.close();
  }
}

async function readPipedLines(): Promise<string[]> {
  let raw = "";
  for await (const chunk of input) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  return raw.split(/\r?\n/).map((line) => line.trim());
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: string
): Promise<string> {
  const answer = await rl.question(`${label} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

function stringFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function approvalDecisionFlag(flags: Record<string, string | boolean>): LocalApprovalDecision {
  const value = stringFlag(flags, "approve-preview");
  if (!value) {
    return "approved";
  }
  return parseApprovalDecision(value);
}

function parseApprovalDecision(value: string): LocalApprovalDecision {
  const normalized = value.trim().toLowerCase();
  if (normalized === "approved" || normalized === "yes" || normalized === "y") {
    return "approved";
  }
  if (normalized === "rejected" || normalized === "no" || normalized === "n") {
    return "rejected";
  }
  if (normalized === "pending" || normalized === "wait") {
    return "pending";
  }
  throw new Error(`Invalid approval decision: ${value}`);
}

function usage(): string {
  return [
    "Usage:",
    "  node dist/src/local-runner-cli.js run --objective \"Create a stock dashboard\" --approve-preview approved --print-inspection",
    "  node dist/src/local-runner-cli.js run --interactive",
    "  node dist/src/local-runner-cli.js inspect --root .agents/local-runs/<run-id>",
    "",
    "Flags:",
    "  --root <path>",
    "  --objective <text>",
    "  --agent-role <text>",
    "  --answer <text>",
    "  --approve-preview approved|rejected|pending",
    "  --run-id <id>",
    "  --task-id <id>",
    "  --user-id <id>",
    "  --workspace-id <id>",
    "  --runner-id <id>",
    "  --interactive",
    "  --json",
    "  --print-inspection"
  ].join("\n");
}

await main();
