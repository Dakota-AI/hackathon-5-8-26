FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HERMES_HOME=/root/.hermes \
    HERMES_RUNNER_MODE=smoke

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY services/agent-runtime/package.json services/agent-runtime/package.json
RUN corepack enable \
  && corepack prepare pnpm@10.0.0 --activate \
  && pnpm install --filter @agents-cloud/agent-runtime --frozen-lockfile

COPY services/agent-runtime services/agent-runtime
RUN pnpm --filter @agents-cloud/agent-runtime run build

# The worker defaults to HERMES_RUNNER_MODE=smoke so the durable ECS ->
# DynamoDB/S3 lifecycle can be verified before model/provider secrets are
# attached. Set HERMES_RUNNER_MODE=cli and provide a Hermes-enabled base image or
# layer with the `hermes` command to run real Hermes model calls.
WORKDIR /app/services/agent-runtime
CMD ["node", "dist/src/index.js"]
