---
name: iterative-tool-assembly
description: "Prototype-test-wire methodology for Agent Creator. Each candidate tool is researched, prototyped in isolation, tested against a real input, and only then proposed for the agent's toolPolicy. Load whenever you are deciding whether a tool earns a place in a specialist's policy."
version: 1.0.0
metadata:
  hermes:
    tags: [agents-cloud, methodology, tool-assembly, iterative]
---

# Iterative tool assembly

A specialist agent is only as good as the tools you give it. Do not list tools
from imagination. Walk every candidate through the loop below before it lands
in `toolPolicy`.

## The loop (per candidate tool)

1. **Discover** — `web_search` / `web_extract` / `browser` / `apify-tool-discovery`
   skill. Capture: tool id, vendor, what it returns, pricing, auth model,
   risk class.
2. **Prototype** — write the smallest possible working call. Use
   `code_execution` for Python/JS prototypes, `terminal` for `curl`. Save the
   script under `/tmp/agent-creator/prototypes/<profileId>/<toolId>.{py|sh}`
   so the user can re-run it.
3. **Test on a real input** — run the prototype against an input that
   resembles what the specialist will actually receive. Capture stdout,
   stderr, exit code, and (if external) cost.
4. **Score** — against four axes:
   - Correctness: did it return what the specialist needs?
   - Stability: does it work twice in a row with the same input?
   - Cost: $/call and worst-case $/run.
   - Risk: does it write externally, spend money, or expose PII?
5. **Decide** — one of:
   - `allowedTools` (low risk, prototype passed)
   - `approvalRequiredTools` (medium/high risk, prototype passed, requires
     human OK per call or per budget)
   - `deniedTools` (prototype failed or risk too high to gate safely)
   - `re-test` (prototype was inconclusive — schedule a follow-up via cronjob
     or ask the user to test offline)
6. **Document** — append a one-line trace to
   `/tmp/agent-creator/prototypes/<profileId>/TRACE.md`:
   ```
   <toolId> | input=<one-line> | result=<pass|fail|inconclusive> |
   cost=$X.XX | decision=<bucket> | reason=<why>
   ```
7. **Wire** — only after step 6, add the tool to the draft profile's
   `toolPolicy` with the correct bucket and a `description` that references
   the prototype trace.

## Parallelism

For roles with 4+ candidate tools, use `delegate_task` (toolset `delegation`)
to prototype 2-3 tools concurrently. Each subagent gets:

- the tool id and vendor docs URL,
- a representative input,
- the score rubric above,
- write access only to `/tmp/agent-creator/prototypes/<profileId>/<toolId>.*`,
- 5-10 minute budget.

Aggregate the results yourself and own the final decision.

## When the user is in the loop

The Agent Creator workshop is collaborative, not autonomous-on-rails. Trigger
a `clarify` call when:

- A prototype costs more than $0.50 to run and you don't have explicit budget.
- A tool would touch a credential the user hasn't provided (Apify token,
  GitHub PAT, email sender).
- Two tools are near-equivalent and the user's preference matters
  (e.g., `serpapi` vs `apify/google-search-scraper`).
- The role brief implies external action (publish, email, post) that the
  draft policy currently denies.

Batch related questions into one `clarify` call. Do not interrupt the user
five times in a row.

## When the prototype is too slow to run inline

Some tools take minutes (long-running Apify actors, browser scrapes of large
sites, scheduled-only APIs). Don't block the workshop. Instead:

```
cronjob(action='create',
  schedule='in 30 minutes',
  prompt='Re-check the apify/website-content-crawler prototype run started at <iso>;
          fetch the dataset items, score the result against
          /tmp/agent-creator/prototypes/<profileId>/website-content-crawler.criteria.md,
          and append the trace line to TRACE.md. Then DM the user with the decision.',
  enabled_toolsets=['terminal', 'web', 'file'])
```

Tell the user you've scheduled a follow-up, give them the cronjob id, and
move on to the next candidate. Pick up the result in the next session.

## Anti-patterns

- "I'll add `apify.run-actor` and the agent will figure out which actor to
  call at runtime." → No. Pin specific actors per role.
- "All `web.*` tools are low-risk, so allow everything." → No. `web_extract`
  on a paywalled site costs money; `browser` write actions can be
  destructive. Score per tool.
- "The user said marketing, so I added MailChimp." → No. Don't infer external
  integrations the user didn't ask for. Discover, propose, get OK, then
  prototype.
- "I'll skip the prototype because the docs look fine." → No. Docs lie. Run
  the call.

## Output the user expects

Per workshop session, the user should see:

1. Updated `todo` list with prototype steps.
2. A short table of candidate tools and their current decision state.
3. The actual prototype scripts under `/tmp/agent-creator/prototypes/<profileId>/`.
4. The `TRACE.md` log so they can replay your reasoning.
5. The current draft profile JSON (even if incomplete) so they can review
   policy as it forms.
6. An explicit ask for the next decision they need to make, OR an explicit
   "I'm continuing autonomously, ping me when I block."
