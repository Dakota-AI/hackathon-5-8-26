# apifycli

A tiny, zero-dep Python CLI for the Apify v2 API. Built for the Agent Creator
workflow: discover Actors, inspect schemas/pricing, validate inputs, run
synchronously or async, fetch logs and dataset items. No MCP, no SDK, no
runtime overhead.

## Install

The CLI is a single executable Python script with no third-party imports
(only stdlib `urllib`). It's installed by symlinking into `~/.local/bin`:

    ln -sf $(pwd)/tools/apifycli/apifycli ~/.local/bin/apifycli

Verify:

    apifycli --help

## Auth

Set `APIFY_TOKEN` in your environment. For the Agent Creator profile it lives
in `~/.hermes/profiles/agentcreator/.env`:

    APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxx

Get a token at https://console.apify.com/account/integrations.

## Subcommands

All output is JSON on stdout. Errors go to stderr with non-zero exit.

### Discovery

```
apifycli search [--q QUERY] [--category CAT] [--pricing FREE|PAID|...]
                [--username AUTHOR] [--limit N] [--sort relevance|latest|popularity]
                [--full]
apifycli get ACTOR_ID [--full]      # actor metadata: input schema, pricing, stats
apifycli openapi ACTOR_ID            # default-build OpenAPI input/output spec
apifycli readme ACTOR_ID             # actor README from default build
```

`ACTOR_ID` accepts both `apify/website-content-crawler` and
`apify~website-content-crawler`. The CLI normalizes.

### Validation and runs

```
apifycli validate ACTOR_ID INPUT.json    # free input-schema check (no run)
apifycli run-sync ACTOR_ID INPUT.json [--timeout 120] [--memory MB] [--max-items N]
                                          # synchronous run, returns dataset items
apifycli run ACTOR_ID INPUT.json [--timeout 300] [--memory MB]
                                          # async run, returns runId + console URL
apifycli status RUN_ID [--full]          # poll run status, usage USD, dataset id
apifycli log RUN_ID [--tail 200]         # last N log lines
apifycli items RUN_ID [--limit 100] [--offset 0] [--clean]
                                          # fetch dataset items
apifycli abort RUN_ID                    # abort a running actor run
```

### Account

```
apifycli me [--full]                     # whoami, plan, usage, limits
apifycli runs [--limit 20] [--status READY|RUNNING|SUCCEEDED|FAILED|...]
```

## Typical Agent Creator flow

```bash
# 1. Discover candidate actors for a role brief
apifycli search --q "competitor pricing" --pricing PAY_PER_RESULT --limit 10 \
  > /tmp/agent-creator/prototypes/<profileId>/candidates.json

# 2. Inspect the top candidate
apifycli get apify/website-content-crawler \
  > /tmp/agent-creator/prototypes/<profileId>/website-content-crawler.meta.json
apifycli openapi apify/website-content-crawler \
  > /tmp/agent-creator/prototypes/<profileId>/website-content-crawler.openapi.json

# 3. Validate input is correct (free)
cat > /tmp/agent-creator/prototypes/<profileId>/input.json <<'JSON'
{ "startUrls": [{"url":"https://stripe.com/pricing"}], "maxCrawlPages": 1 }
JSON
apifycli validate apify/website-content-crawler \
  /tmp/agent-creator/prototypes/<profileId>/input.json

# 4. Prototype with a small synchronous run (bounded cost)
apifycli run-sync apify/website-content-crawler \
  /tmp/agent-creator/prototypes/<profileId>/input.json \
  --timeout 60 --max-items 5 \
  > /tmp/agent-creator/prototypes/<profileId>/website-content-crawler.sample.json

# 5. Score the result and append a TRACE.md line per iterative-tool-assembly skill.
```

## Why a CLI and not MCP

- **Zero startup cost.** Runs as a normal subprocess; nothing to keep alive.
- **Zero dependency surface.** Stdlib only; works on any Python 3.11+ machine.
- **Trivial to reason about.** One file, ~400 lines, no SDK abstractions to
  audit when designing tool policy for production specialists.
- **Easy to embed.** Specialists can shell out via the `terminal` tool with
  per-call cost tracking, instead of an MCP server with implicit allowlists.
- **Works with the Hermes `terminal` toolset** the Agent Creator already has,
  so no extra MCP wiring per profile.
