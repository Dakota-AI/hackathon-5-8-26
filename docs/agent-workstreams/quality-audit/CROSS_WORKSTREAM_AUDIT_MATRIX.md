# Cross-Workstream Audit Matrix

Updated: 2026-05-10

## Required Audits By Lane

| Implementing lane | Required adjacent audit | Required validation focus |
| --- | --- | --- |
| Access Control | Realtime Streaming, Clients, Quality Audit | Tenant denial cases, workspace membership, group/capability checks, access-code redemption |
| Realtime Streaming | Access Control, Clients | Subscribe authorization, replay/gap repair, event envelope compatibility |
| Clients | Access Control, Realtime Streaming, Product Coordination | Access denied states, workspace picker, retry/idempotency, realtime status visibility |
| Agent Harness | Infrastructure, Quality Audit | Scoped runner context, event/artifact writes, tool approvals, retry/cancel behavior |
| Infrastructure | Agent Harness, Access Control | IAM grants, table/index shape, triggers, deployment outputs, alarms |
| Preview Hosting | Infrastructure, Access Control, Clients | Public read policy, publish capability, wildcard routing, TTL/retire |
| Source Control | Access Control, Quality Audit, Agent Harness | Credential broker, secret scan, branch policy, approval gates |
| Miro Integration | Access Control, Agent Harness, Clients | Token brokering, board access, write approvals, artifact records |
| Specialist Creation | Self-Improvement, Quality Audit, Clients | Profile schema, eval packs, scorecards, review/revision flow |
| Self-Improvement | Quality Audit, Agent Harness, Access Control | Quarantine, promotion approval, rollback, runtime approved-only loading |

## Minimum Finding Shape

Every audit finding should include:

- severity,
- owner,
- exact file/contract evidence,
- risk,
- requested action,
- validation required,
- closeout criteria.

## Current P0 Focus

Until closed, every implementation audit should check:

- no route trusts client-supplied `workspaceId` without membership lookup,
- no realtime subscription is stored before membership authorization,
- no worker receives a spoofable workspace context,
- no public preview/source-control/Miro action bypasses approval policy,
- no generated UI renders unvalidated component payloads.
