FROM node:24-alpine AS base

# The api Dockerfile lives in packages/api but must be built from the repository
# root so the Turborepo workspace context is available. Example:
#   docker build -f packages/api/Dockerfile -t mercur-api .

FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install --global bun@1.3.8 turbo
COPY . .
# Prune the monorepo to the API plus the two dashboard Vite apps. The API's
# admin-ui and vendor-ui modules serve apps/admin/dist and apps/vendor/dist
# at /dashboard and /seller, so all three workspaces must be built.
RUN turbo prune @acme/api @acme/admin @acme/vendor --docker

FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install --global bun@1.3.8

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN bun install

# Build the project and its dependencies (api + admin + vendor dist)
COPY --from=builder /app/out/full/ .

RUN bun run build

FROM base AS runner
WORKDIR /app

# Install wget for healthcheck and bun for runtime
RUN apk add --no-cache wget
RUN npm install --global bun@1.3.8

# Don't run production as root
RUN addgroup --system --gid 1001 medusa
RUN adduser --system --uid 1001 medusa

# Ensure the medusa user owns the api and dashboard folders
RUN mkdir -p /app/packages/api/static /app/apps/admin /app/apps/vendor
RUN chown -R medusa:medusa /app/packages/api /app/apps

USER medusa
COPY --from=installer --chown=medusa:medusa /app .

WORKDIR /app/packages/api

EXPOSE 9000

# Run migrations, optionally seed demo data (controlled by SEED_DEMO_DATA env), and start server
# MIGRATE_LINKS options: "safe" (default), "skip", "all"
# - safe: auto-creates new links, skips deletions (recommended for most users)
# - skip: ignores all link operations
# - all: auto-executes all link operations including deletions (use with caution)
CMD ["sh", "-c", "case \"$MIGRATE_LINKS\" in skip) LINK_FLAG='--skip-links';; all) LINK_FLAG='--execute-all-links';; *) LINK_FLAG='--execute-safe-links';; esac && bunx medusa db:migrate $LINK_FLAG && if [ \"$SEED_DEMO_DATA\" = \"true\" ]; then bun run seed || true; fi && bun run start"]
