#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";

import { createRequestFromInteractiveAnswers } from "./interactive.js";
import { runScenarioFile, runWorkshopSimulation, writeProfileBundle } from "./index.js";

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function getArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

async function runInteractive(bundleDir?: string): Promise<void> {
  console.log("Agent Workshop interactive test mode");
  console.log("Answer as the user. The workshop will produce a draft profile, audit trail, and promotion blockers.\n");

  const answers = input.isTTY ? await readAnswersFromTty() : readAnswersFromPipedStdin();
  const request = createRequestFromInteractiveAnswers(answers);
  const result = runWorkshopSimulation(request);

  console.log("\n=== Workshop audit transcript ===");
  for (const line of result.demoTranscript) {
    console.log(`${line.actor}: ${line.message}`);
  }

  console.log("\n=== Audit trail ===");
  for (const step of result.auditTrail) {
    console.log(`- ${step.step}: ${step.status}`);
    for (const evidence of step.evidence) console.log(`  • ${evidence}`);
  }

  console.log("\n=== Draft profile summary ===");
  console.log(`Profile: ${result.profile.profileId}@${result.profile.version}`);
  console.log(`Role: ${result.profile.role}`);
  console.log(`Mission: ${result.profile.mission}`);
  console.log(`Allowed tools: ${result.profile.toolPolicy.allowedTools.map((tool) => tool.toolId).join(", ") || "none"}`);
  console.log(
    `Approval tools: ${result.profile.toolPolicy.approvalRequiredTools.map((tool) => tool.toolId).join(", ") || "none"}`,
  );
  console.log(`Eval scenarios: ${result.profile.evalPack.scenarios.length}`);

  if (bundleDir) {
    const bundle = await writeProfileBundle(result.profile, bundleDir);
    console.log(`Bundle written: ${bundle.rootDir}`);
    console.log(`Bundle hash: ${bundle.bundleHash}`);
  }

  console.log("\n=== Full JSON ===");
  console.log(JSON.stringify(result, null, 2));
}

async function readAnswersFromTty() {
  const rl = createInterface({ input, output });
  try {
    return {
      role: await rl.question("Agent role to create/tune: "),
      projectName: await rl.question("Project/company/context name: "),
      goals: await rl.question("Goals, separated by semicolons: "),
      constraints: await rl.question("Constraints, separated by semicolons: "),
      communicationCadence: await rl.question("Preferred cadence (default end_of_day_report): "),
      reportStyle: await rl.question("Preferred report style (default concise_pdf_brief): "),
      verbosity: await rl.question("Verbosity (concise/balanced/detailed, default concise): "),
      feedback: await rl.question("Existing feedback/preferences for this agent: "),
    };
  } finally {
    rl.close();
  }
}

function readAnswersFromPipedStdin() {
  const lines = readFileSync(0, "utf8").split(/\r?\n/);
  return {
    role: lines[0] ?? "Specialist Agent",
    projectName: lines[1] ?? "Untitled project",
    goals: lines[2] ?? "Produce useful work",
    constraints: lines[3] ?? "Ask before external side effects",
    communicationCadence: lines[4] ?? "end_of_day_report",
    reportStyle: lines[5] ?? "concise_pdf_brief",
    verbosity: lines[6] ?? "concise",
    feedback: lines[7] ?? "Prefer concise, auditable work.",
  };
}

const scenarioPath = getArg(process.argv, "--scenario");
const bundleDir = getArg(process.argv, "--bundle-dir");

try {
  if (hasFlag(process.argv, "--interactive")) {
    await runInteractive(bundleDir);
  } else if (scenarioPath) {
    const result = await runScenarioFile(scenarioPath);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error("Usage: node dist/src/cli.js --scenario <scenario.json>");
    console.error("   or: node dist/src/cli.js --interactive");
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
