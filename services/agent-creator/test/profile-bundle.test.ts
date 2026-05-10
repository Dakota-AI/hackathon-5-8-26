import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderDraftProfile, writeProfileBundle } from "../src/index.js";
import type { AgentWorkshopRequest } from "../src/index.js";

const request: AgentWorkshopRequest = {
  workspaceId: "workspace-demo",
  requestedByUserId: "user-demo",
  requestedRole: "Marketing Strategist",
  projectContext: {
    name: "Solo CEO launch",
    goals: ["Create a launch plan"],
    constraints: ["Avoid expensive APIs without approval"],
  },
  userPreferences: {
    communicationCadence: "end_of_day_report",
    reportStyle: "concise_pdf_brief",
    verbosity: "concise",
  },
  feedback: [{ source: "user", message: "Keep updates concise and do not use expensive APIs without approval." }],
  candidateTools: [
    {
      id: "apify.search-actors",
      name: "Apify Actor Search",
      category: "research",
      risk: "low",
      description: "Search Apify Store for actors without running them.",
    },
    {
      id: "apify.call-actor",
      name: "Apify Actor Run",
      category: "external_action",
      risk: "high",
      description: "Run selected Apify actors and spend credits.",
    },
  ],
};

test("profile bundle writer creates materialization files and manifest hashes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-profile-bundle-"));
  try {
    const profile = renderDraftProfile(request);
    const bundle = await writeProfileBundle(profile, dir);

    assert.equal(bundle.files.some((file) => file.path === "profile.json"), true);
    assert.equal(bundle.files.some((file) => file.path === "SOUL.md"), true);
    assert.equal(bundle.files.some((file) => file.path === "policy/tool-policy.json"), true);
    assert.equal(bundle.files.some((file) => file.path === "evals/eval-pack.json"), true);
    assert.equal(bundle.files.some((file) => file.path === "manifest.json"), true);
    assert.ok(bundle.bundleHash.startsWith("sha256:"));

    const soul = await readFile(join(dir, "SOUL.md"), "utf8");
    assert.match(soul, /Marketing Strategist/);
    assert.match(soul, /Approval-required tools/);

    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as { files: Array<{ path: string; sha256: string }> };
    assert.ok(manifest.files.every((file) => file.sha256.startsWith("sha256:")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
