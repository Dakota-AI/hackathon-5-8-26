import { spawn } from "node:child_process";
import type { HermesRunner } from "./ports.js";

export class CliHermesRunner implements HermesRunner {
  public constructor(
    private readonly options: {
      readonly command: string;
      readonly timeoutMs: number;
      readonly model?: string;
      readonly provider?: string;
      readonly toolsets?: string;
    }
  ) {}

  public static fromEnvironment(): CliHermesRunner {
    return new CliHermesRunner({
      command: process.env.HERMES_COMMAND ?? "hermes",
      timeoutMs: Number(process.env.HERMES_TIMEOUT_MS ?? "120000"),
      model: process.env.HERMES_MODEL,
      provider: process.env.HERMES_PROVIDER,
      toolsets: process.env.HERMES_TOOLSETS ?? "web,file,terminal"
    });
  }

  async run(prompt: string): Promise<{ summary: string; rawOutput: string; mode: string }> {
    if (process.env.HERMES_RUNNER_MODE === "smoke") {
      const rawOutput = [
        "Hermes smoke runner executed without model calls.",
        "This validates the ECS worker event/artifact path before secrets are attached.",
        "Objective:",
        prompt
      ].join("\n");
      return {
        summary: "Hermes smoke runner completed the ECS worker lifecycle.",
        rawOutput,
        mode: "hermes-smoke"
      };
    }

    const args = ["chat", "-q", prompt, "--quiet"];
    if (this.options.model) {
      args.push("--model", this.options.model);
    }
    if (this.options.provider) {
      args.push("--provider", this.options.provider);
    }
    if (this.options.toolsets) {
      args.push("--toolsets", this.options.toolsets);
    }

    const rawOutput = await runProcess(this.options.command, args, this.options.timeoutMs);
    return {
      summary: firstNonEmptyLine(rawOutput) ?? "Hermes completed the worker run.",
      rawOutput,
      mode: "hermes-cli"
    };
  }
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Hermes timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Hermes exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}
