import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const schemaPaths = [
  "schemas/event-envelope.schema.json",
  "schemas/events/run-status.schema.json",
  "schemas/events/tool-approval.schema.json",
  "schemas/events/artifact.schema.json",
  "schemas/events/a2ui-delta.schema.json"
];

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

for (const path of schemaPaths) {
  const schema = JSON.parse(await readFile(join(root, path), "utf8"));
  ajv.compile(schema);
}

const envelopeSchema = JSON.parse(
  await readFile(join(root, "schemas/event-envelope.schema.json"), "utf8")
);
const runStatusSchema = JSON.parse(
  await readFile(join(root, "schemas/events/run-status.schema.json"), "utf8")
);
const example = JSON.parse(
  await readFile(join(root, "examples/run-status-event.json"), "utf8")
);
const toolApprovalRequestExample = JSON.parse(
  await readFile(join(root, "examples/tool-approval-request-event.json"), "utf8")
);
const toolApprovalDecisionExample = JSON.parse(
  await readFile(join(root, "examples/tool-approval-decision-event.json"), "utf8")
);

const validateEnvelope = ajv.getSchema(envelopeSchema.$id);
const validateRunStatus = ajv.getSchema(runStatusSchema.$id);
const toolApprovalSchema = JSON.parse(
  await readFile(join(root, "schemas/events/tool-approval.schema.json"), "utf8")
);
const validateToolApproval = ajv.getSchema(toolApprovalSchema.$id);

if (!validateEnvelope || !validateRunStatus || !validateToolApproval) {
  throw new Error("Expected validators were not registered.");
}

if (!validateEnvelope(example)) {
  throw new Error(`Invalid envelope: ${JSON.stringify(validateEnvelope.errors, null, 2)}`);
}

if (!validateRunStatus(example.payload)) {
  throw new Error(`Invalid run status payload: ${JSON.stringify(validateRunStatus.errors, null, 2)}`);
}

for (const item of [toolApprovalRequestExample, toolApprovalDecisionExample]) {
  if (!validateEnvelope(item)) {
    throw new Error(`Invalid tool approval envelope: ${JSON.stringify(validateEnvelope.errors, null, 2)}`);
  }
  if (!validateToolApproval(item.payload)) {
    throw new Error(`Invalid tool approval payload: ${JSON.stringify(validateToolApproval.errors, null, 2)}`);
  }
}

console.log("Protocol schemas validated.");
