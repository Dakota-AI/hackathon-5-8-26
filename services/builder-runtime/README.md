# Builder Runtime

Heavy build/test/browser worker runtime package boundary.

Use for:

- Large repository builds.
- Browser automation.
- Docker or container-like build workflows where allowed.
- Test suites that need more CPU, memory, or disk than default Fargate workers.

Expected default capacity: ECS Managed Instances or another explicitly approved sandbox.
