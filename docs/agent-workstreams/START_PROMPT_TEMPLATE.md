# Start Prompt Template

Use this when assigning an AI agent to one workstream.

```text
You are assigned to the [WORKSTREAM NAME] workstream for this repository.

Start by reading:

1. AGENTS.md
2. docs/agent-workstreams/README.md
3. docs/agent-workstreams/[WORKSTREAM FOLDER]/README.md
4. docs/agent-workstreams/COORDINATION.md
5. any handoff files in docs/agent-workstreams/handoffs/ that mention your workstream

Your job:

- stay focused on your workstream's mission and primary paths,
- audit the current code/docs in your scope,
- identify what is complete, missing, risky, or blocked,
- implement the next highest-value task in your scope when it is clear,
- coordinate through handoff notes when another workstream is needed,
- preserve unrelated changes from other agents,
- run the validation commands listed for your workstream,
- update docs if implementation reality changes,
- summarize what changed, what was validated, and what remains.

Before editing files:

- run git status --short --branch,
- inspect the files you intend to touch,
- check whether another workstream likely owns those files,
- create a handoff note instead of editing outside your lane unless the change is
  small, necessary, and clearly safe.

Do not claim a task is complete unless code, tests, and docs agree.
```

## Workstream Folder Names

- Infrastructure: `infrastructure`
- Clients: `clients`
- Agent Harness: `agent-harness`
- Realtime Streaming: `realtime-streaming`
- Product Coordination: `product-coordination`

