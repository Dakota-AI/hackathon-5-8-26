FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/agent-profile/package.json packages/agent-profile/package.json
COPY services/agent-creator/package.json services/agent-creator/package.json
RUN pnpm install --frozen-lockfile --filter @agents-cloud/agent-creator...

FROM deps AS build
COPY packages/agent-profile packages/agent-profile
COPY services/agent-creator services/agent-creator
RUN pnpm --filter @agents-cloud/agent-creator run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/agent-profile/node_modules ./packages/agent-profile/node_modules
COPY --from=deps /app/services/agent-creator/node_modules ./services/agent-creator/node_modules
COPY --from=build /app/packages/agent-profile/dist ./packages/agent-profile/dist
COPY --from=build /app/packages/agent-profile/package.json ./packages/agent-profile/package.json
COPY --from=build /app/services/agent-creator/dist ./services/agent-creator/dist
COPY --from=build /app/services/agent-creator/test/fixtures ./services/agent-creator/test/fixtures
COPY services/agent-creator/package.json services/agent-creator/package.json
WORKDIR /app/services/agent-creator
CMD ["node", "dist/src/cli.js", "--scenario", "test/fixtures/marketing-workshop-scenario.json"]
