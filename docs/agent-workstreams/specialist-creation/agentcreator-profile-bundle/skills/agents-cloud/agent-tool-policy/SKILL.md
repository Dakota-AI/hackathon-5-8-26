---
name: agent-tool-policy
description: "Default tool/MCP/Apify allow/deny policy for newly created Agents Cloud specialists. Load whenever you assemble toolPolicy or mcpPolicy."
version: 1.0.0
metadata:
  hermes:
    tags: [agents-cloud, tool-policy, mcp, apify, governance]
---

# Default tool policy for new specialists

Default-deny. A new specialist gets the smallest blast radius that lets it do
its job. Anything that spends money, contacts a human, publishes content,
mutates external state, or accesses credentials is `requiresApproval: true`.

## Risk taxonomy

```
low     -> read-only, sandboxed, no external side effect, no spend
medium  -> external read with cost, broad scraping, browser use, dataset writes
            inside workspace, multi-step research that costs > $0.10/run
high    -> any external write (email/post/publish), spend > $1/run,
            credential access, deletion, public-facing changes, social outreach,
            personal data extraction at scale
```

## Built-in toolset defaults by role family

| Role family               | low (allowed)                                          | approval-required                                      |
|---------------------------|--------------------------------------------------------|--------------------------------------------------------|
| research/analyst          | web.search, web.extract, file.read, skills, memory.read| browser.navigate, code_execution                       |
| marketing strategist      | web.search, file.read, skills, memory.read             | browser, apify.run-actor, email.send, social.post      |
| sales researcher          | web.search, file.read, skills                          | apify.run-actor (lead gen), email.send                 |
| finance analyst           | file.read, file.write (sandbox), skills, memory        | external accounting/banking connectors                 |
| coding agent              | file.read, file.write, skills                          | terminal, code_execution, github.push, deploy.*        |
| ops/admin                 | file.read, skills, memory                              | terminal, deploy.*, secrets.read                       |
| agent creator (this one)  | file.read, file.write (sandbox), web.*, skills, memory | terminal, code_execution, control-api.write            |

If the user asks for a role outside this table, infer by closest analogy and
state your inference explicitly.

## Always-deny by default

Add to `deniedTools` (not approval-required) unless the user has a documented
business reason and a budget cap:

- raw shell with sudo
- production database write/delete
- DNS / domain admin
- billing/payment processor write
- mass-email / mass-SMS
- broad social scraping at PII scale
- self-modifying profile promotion (`agent-profile.promote`)

## MCP policy rules

- `allowDynamicServers: false` always.
- Every entry in `allowedServers` MUST have `pinnedDefinitionHash` and a
  finite `allowedToolIds: string[]`.
- `trustLevel: "trusted"` only for first-party Agents Cloud platform MCP.
  Apify and other third-party MCPs are `"reviewed"` at best.
- `responseInspectionRequired: true` always.

## Apify pattern

- Discovery uses MCP read-only (`apify.search-actors`, `apify.fetch-actor-details`).
- Production execution uses curated platform connector, not raw `run-actor`.
- Any `apify.run-actor.<actorId>` is `risk:"high"` until catalog-tagged
  `read_only: true` AND `pricing.estimated_cost_usd < 0.50/run`.

## Notes you must include in `toolPolicy.notes`

For each approval-required tool, append a one-line note explaining:

```
<toolId>: requires approval because <spend|external write|publication|PII>;
suggested guardrail: <budget cap | recipient allowlist | dry-run first>.
```

## Catalog hash placeholders

For drafts, `catalogHash: "sha256:<toolId>-draft-placeholder"` is acceptable.
Real hashes get stamped at promotion time by the Control API.
