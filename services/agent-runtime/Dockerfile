# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY services/agent-runtime/package.json services/agent-runtime/package.json
RUN corepack enable \
  && corepack prepare pnpm@10.0.0 --activate \
  && pnpm install --filter @agents-cloud/protocol --filter @agents-cloud/agent-runtime --frozen-lockfile --prod=false

COPY packages/protocol packages/protocol
COPY services/agent-runtime services/agent-runtime
RUN pnpm --filter @agents-cloud/protocol run build \
  && pnpm --filter @agents-cloud/agent-runtime run build

FROM nousresearch/hermes-agent@sha256:df3361f51cff6a5c3cefc088276fe4b2f913097022344b95ecb25f74dd59fa71 AS runtime

ENV NODE_ENV=production \
    AGENTS_RUNTIME_MODE=ecs-worker \
    AGENTS_RUNNER_ROOT=/runner \
    HERMES_HOME=/runner/hermes \
    HERMES_GATEWAY_HOST=127.0.0.1 \
    HERMES_GATEWAY_PORT=8642 \
    HERMES_GATEWAY_BOOT_TIMEOUT_SECONDS=60 \
    HERMES_ACCEPT_HOOKS=1 \
    PATH=/opt/hermes/.venv/bin:/opt/hermes:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app /runner/workspace /runner/hermes \
  && chown -R hermes:hermes /runner /app

COPY --from=build --chown=hermes:hermes /app /app
COPY services/agent-runtime/docker/worker-entrypoint.sh /usr/local/bin/agents-cloud-worker-entrypoint
RUN chmod 0755 /usr/local/bin/agents-cloud-worker-entrypoint

USER hermes
WORKDIR /app/services/agent-runtime
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/agents-cloud-worker-entrypoint"]
CMD ["node", "dist/src/index.js"]
