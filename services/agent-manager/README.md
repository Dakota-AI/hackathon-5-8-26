# Agent Manager

Owns ECS task scheduling and worker lifecycle.

Responsibilities:

- Select worker class before scheduling.
- Start ECS tasks with the right capacity provider path.
- Inject scoped run environment.
- Track heartbeats and callbacks.
- Stop/cancel runs.
- Emit canonical events.

Do not mix incompatible Fargate and Managed Instances capacity provider types in one strategy.
