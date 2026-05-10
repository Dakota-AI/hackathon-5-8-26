---
name: apify-tool-discovery
description: "Discover, inspect, prototype, and gate Apify Actors as tools for an Agents Cloud specialist using the local apifycli CLI. Load whenever a role needs external data acquisition (scraping, enrichment, social listening, search)."
version: 2.0.0
metadata:
  hermes:
    tags: [agents-cloud, apify, tool-discovery, scraping, cli]
---

# Apify tool discovery for Agent Creator (apifycli)

Apify hosts thousands of Actors with consistent auth, schemas, and pricing.
For the Agent Creator workflow, use the local `apifycli` Python CLI — no
MCP, no SDK, just `terminal` calls.

## Setup (one-time)

Token in `~/.hermes/profiles/agentcreator/.env`:

```
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxx
```

Verify with:

```bash
apifycli me
```

If `me` returns plan + usage, you're good. If you get
`error: APIFY_TOKEN not set`, the env file isn't loaded — restart Hermes.

## Two-layer pattern

```
Discovery (Agent Creator session)            Production (specialist runtime)
-------------------------------------        -----------------------------------
apifycli search/get/openapi/validate         Curated platform connector
apifycli run-sync (small bounded probes)     Allowlisted actors, per-run budget
                                              Approval gate per actor call
                                              workspaceId/runId binding
```

You (Agent Creator) use the discovery layer. The specialist you produce uses
the production layer; only production-layer entries go in `toolPolicy`.

## Discovery workflow

For a given role brief (e.g. "competitor pricing analyst"):

### 1. Search broadly

```bash
mkdir -p /tmp/agent-creator/prototypes/<profileId>
apifycli search --q "pricing scraper" --limit 10 --sort popularity \
  > /tmp/agent-creator/prototypes/<profileId>/candidates-pricing.json
apifycli search --q "saas pricing monitor" --limit 10 \
  > /tmp/agent-creator/prototypes/<profileId>/candidates-monitor.json
apifycli search --q "website change detection" --limit 10 \
  > /tmp/agent-creator/prototypes/<profileId>/candidates-change.json
```

Trim by `stats.totalRuns` (proxy for proven actors) and prefer
`username: apify` or well-known orgs.

### 2. Fetch full metadata for each shortlist candidate

```bash
apifycli get apify/website-content-crawler \
  > /tmp/agent-creator/prototypes/<profileId>/wcc.meta.json
apifycli openapi apify/website-content-crawler \
  > /tmp/agent-creator/prototypes/<profileId>/wcc.openapi.json
apifycli readme apify/website-content-crawler \
  > /tmp/agent-creator/prototypes/<profileId>/wcc.readme.md
```

Capture `currentPricingInfo`, `defaultRunOptions`, `exampleRunInput`, and
`stats`.

### 3. Capture cost reality

Pricing is the #1 reason a draft fails review. Record actual numbers, not
"low cost":

```
apify/website-content-crawler  | $0.50 per 1k pages | 1k pages bound = $0.50/run
apify/google-search-scraper    | $0.003 per result  | 50 results     = $0.15/run
apify/instagram-scraper        | $2.30 per 1k items | 100 profiles   = $0.23/run
```

### 4. Validate input (free, no run)

```bash
cat > /tmp/agent-creator/prototypes/<profileId>/wcc.input.json <<'JSON'
{ "startUrls": [{"url":"https://stripe.com/pricing"}], "maxCrawlPages": 1 }
JSON
apifycli validate apify/website-content-crawler \
  /tmp/agent-creator/prototypes/<profileId>/wcc.input.json
```

A 200 with no errors means input matches schema. Errors come back with
field-level paths.

### 5. Prototype with a tiny synchronous run

For cheap, fast actors:

```bash
apifycli run-sync apify/website-content-crawler \
  /tmp/agent-creator/prototypes/<profileId>/wcc.input.json \
  --timeout 60 --max-items 5 \
  > /tmp/agent-creator/prototypes/<profileId>/wcc.sample.json
```

For long-running actors, use async + scheduled poll:

```bash
RUN=$(apifycli run apify/instagram-scraper \
       /tmp/agent-creator/prototypes/<profileId>/ig.input.json \
       --timeout 300 | jq -r .runId)
echo "$RUN" > /tmp/agent-creator/prototypes/<profileId>/ig.runid
# then schedule a follow-up via cronjob to fetch:
#   apifycli status $RUN ; apifycli items $RUN --limit 20
```

Don't block the workshop on a long run — schedule a follow-up via the
`cronjob` tool and move on.

### 6. Score per `iterative-tool-assembly` rubric

Append a one-line trace to
`/tmp/agent-creator/prototypes/<profileId>/TRACE.md` with id, input,
result, cost, and decision.

## Risk taxonomy

```
low        catalog/docs read; validate-input; free synchronous actors with
           bounded output (small scrapes on first-party sites you own)

medium     paid scrapers on third-party public sites; per-result-priced actors
           with bounded inputs; data enrichment; PDF/text extractors

high       lead-gen / contact enrichment / personal-data extractors;
           social-media scrapers (Instagram, LinkedIn, TikTok); PII output;
           anything > $1/run typical; anything that posts/messages/follows
```

## Policy mapping

When you wire an Apify actor into a specialist's `toolPolicy`:

```json
{
  "toolId": "apify.run-actor.apify~website-content-crawler",
  "name": "Apify: website-content-crawler",
  "category": "data-acquisition",
  "risk": "medium",
  "description": "Scrape competitor pricing pages. Prototype trace: TRACE.md#L14. Avg cost $0.50/run on 1k-page bound.",
  "source": "apify",
  "requiresApproval": true,
  "catalogHash": "sha256:apify~website-content-crawler@<buildId>",
  "budget": { "maxCallsPerRun": 1, "maxCostUsdPerRun": 1.00 }
}
```

Rules:

- Always pin to `username~name` (and ideally a build).
  Never grant `apify.run-actor.*` as a wildcard.
- Always set `budget.maxCostUsdPerRun`.
- Always reference the prototype trace in `description`.
- Medium and high risk → `approvalRequiredTools`. Only catalog/discovery
  helpers (e.g. an internal `apify.search` tool) can sit in `allowedTools`.

## Common discovery queries by role

```
marketing strategist     "social listening", "trend analysis", "ad library",
                         "competitor content", "seo keyword"
sales researcher         "lead generation", "company enrichment", "linkedin",
                         "google maps places", "email finder"
competitor analyst       "pricing scraper", "saas monitor", "website change",
                         "review scraper", "g2 capterra"
news/research            "news scraper", "rss", "google news",
                         "reddit", "hacker news"
ecommerce                "amazon", "shopify", "product listing",
                         "price tracker", "review sentiment"
```

## Anti-patterns

- Granting `apify.*` wildcard. → Pin specific actors.
- Skipping `validate`. → It's free and saves cost on a bad payload.
- Trusting actor `description` without inspecting `openapi`. → Descriptions
  oversell.
- Running paid actors during discovery without user OK. → Use search/get/
  validate first; ask before spending.
- Forgetting to record pricing in TRACE. → Reviewer will reject on cost.
- Running a long actor synchronously and blocking the workshop. → Use `run`
  + `cronjob` follow-up.
