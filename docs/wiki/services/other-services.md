# Other services

[← services](README.md) · [wiki index](../README.md)

This page covers `agent-creator` (functional CLI) and the five README-only scaffolds: `agent-manager`, `builder-runtime`, `event-relay`, `miro-bridge`, `preview-router`.

---

## agent-creator

**Maturity:** ⚠️ functional slice — workshop CLI exists and is tested. Not wired to HTTP routes.

**Source:** `services/agent-creator/src/`
**Tests:** 4 files (workshop simulation, scenario validation, profile bundling)

### What it does
Drafts specialist agent profiles in a "workshop" simulation. CLI and interactive modes. Can render markdown reports and bundle profiles into S3.

```sh
pnpm agent-creator:smoke
```

### Why it's not in the live API
Profile lifecycle endpoints exist on `control-api` (`/agent-profiles/*`) but they're owned by `services/control-api/src/agent-profiles.ts`, not by agent-creator. Agent-creator is a development/CLI tool.

### Hackathon
- ✅ Use as-is for drafting profiles.
- ❌ No web UI integration beyond what's in the admin-console Agent Workshop panel (which calls control-api's profile routes, not agent-creator).

---

## Scaffolds (README only, no code)

These five services have READMEs documenting intent but no `src/` implementation:

### agent-manager
**Intended responsibility:** ECS task scheduling layer above raw `ecs:RunTask`. Worker-class selection, run cancellation, heartbeat tracking.

**Status:** ❌ no code.
**Hackathon:** the resident-runner dispatcher (described in [agent-runtime.md](agent-runtime.md) and [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#2)) is the minimal version of this. Build it inside `control-api` rather than as a separate service.

### builder-runtime
**Intended responsibility:** heavy-build worker for Docker workflows, browser automation, etc.

**Status:** ❌ no code.
**Hackathon:** 🗑️ skip. The smoke/resident worker handles all execution for the demo.

### event-relay
**Intended responsibility:** AWS → Cloudflare event bridge (EventBridge / SQS / DDB Streams → Cloudflare Durable Objects).

**Status:** ❌ no code.
**Hackathon:** 🗑️ skip — Cloudflare deferred.

### miro-bridge
**Intended responsibility:** Miro OAuth, board operations, webhook processing.

**Status:** ❌ no code.
**Hackathon:** 🗑️ skip — out of scope.

### preview-router
**Intended responsibility:** wildcard preview hosting via Route 53 → ALB → static S3 fetch.

**Status:** ❌ no code (the PreviewIngressStack uses upstream nginx as placeholder).
**Hackathon:** 🗑️ skip.

---

## Summary

```
agent-creator      ⚠️ functional CLI (use for profile drafting)
agent-manager      ❌ replace with control-api dispatcher
builder-runtime    🗑️ skip
event-relay        🗑️ skip
miro-bridge        🗑️ skip
preview-router     🗑️ skip
```

[→ services overview](README.md) · [→ HACKATHON_CRITICAL_PATH](../HACKATHON_CRITICAL_PATH.md) · [→ gaps](../gaps.md)
