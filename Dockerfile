# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_BUILD_IMAGE=docker.io/library/node:24.19.0-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03
ARG NODE_RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:774b7d020b24214835769e24c3544835526cd0288f0b094eae48e8b2c2429a79

FROM ${NODE_BUILD_IMAGE} AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack install --global pnpm@11.21.0
WORKDIR /app

FROM base AS storybored-build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY packages/storybored-sdk/package.json packages/storybored-sdk/tsconfig.json ./packages/storybored-sdk/
RUN --mount=type=cache,id=storybored-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @storybored/storybored-sdk...
COPY packages/types/src/ ./packages/types/src/
COPY packages/storybored-sdk/src/ ./packages/storybored-sdk/src/
RUN pnpm --filter @storybored/types build && pnpm --filter @storybored/storybored-sdk build

FROM base AS reader-base
WORKDIR /app/readest
COPY readest/package.json readest/pnpm-lock.yaml readest/pnpm-workspace.yaml ./
COPY readest/apps/readest-app/package.json ./apps/readest-app/
COPY readest/patches/ ./patches/
COPY readest/packages/ ./packages/

FROM reader-base AS dependencies
RUN --mount=type=cache,id=reader-pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @readest/readest-app setup-vendors

FROM dependencies AS development-stage
COPY --from=storybored-build /app/node_modules /app/node_modules
COPY --from=storybored-build /app/packages/types /app/packages/types
COPY --from=storybored-build /app/packages/storybored-sdk /app/packages/storybored-sdk
COPY readest/ /app/readest/
WORKDIR /app/readest/apps/readest-app
EXPOSE 3000
ENTRYPOINT ["pnpm", "exec", "next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM reader-base AS build
ARG OCI_READER_SHA
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_PLATFORM
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_NODE_BASE_URL
ARG NEXT_PUBLIC_OBJECT_STORAGE_TYPE
ARG NEXT_PUBLIC_STORAGE_FIXED_QUOTA
ARG NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA
ARG NEXT_PUBLIC_STORYBORED_ENABLED
ARG NEXT_PUBLIC_STORYBORED_API_BASE_URL
ARG NEXT_PUBLIC_MARKETPLACE_URL
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_RELEASE
ARG NEXT_PUBLIC_SITE_URL
ENV OCI_READER_SHA="${OCI_READER_SHA}" \
    NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL}" \
    NEXT_PUBLIC_MARKETPLACE_URL="${NEXT_PUBLIC_MARKETPLACE_URL}" \
    NEXT_PUBLIC_NODE_BASE_URL="${NEXT_PUBLIC_NODE_BASE_URL}" \
    NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}" \
    NEXT_PUBLIC_STORYBORED_API_BASE_URL="${NEXT_PUBLIC_STORYBORED_API_BASE_URL}" \
    NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
COPY --from=storybored-build /app/node_modules /app/node_modules
COPY --from=storybored-build /app/packages/types /app/packages/types
COPY --from=storybored-build /app/packages/storybored-sdk /app/packages/storybored-sdk
COPY --from=dependencies /app/readest/node_modules /app/readest/node_modules
COPY --from=dependencies /app/readest/apps/readest-app/node_modules /app/readest/apps/readest-app/node_modules
COPY --from=dependencies /app/readest/apps/readest-app/public/vendor /app/readest/apps/readest-app/public/vendor
COPY --from=dependencies /app/readest/packages/foliate-js/node_modules /app/readest/packages/foliate-js/node_modules
COPY readest/ /app/readest/
WORKDIR /app/readest/apps/readest-app
RUN node ./container-build-config.mjs \
    && NODE_OPTIONS=--max-old-space-size=4096 pnpm exec next build

FROM ${NODE_RUNTIME_IMAGE} AS production-stage
ARG OCI_PRODUCT=storybored
ARG OCI_PROJECT=storybored
ARG OCI_REPOSITORY=https://github.com/boredcorp/storybored
ARG OCI_VERSION=0.0.0-local
ARG OCI_ROOT_SHA=unknown
ARG OCI_READER_SHA=unknown
ARG OCI_BUILD_PROFILE=production
ARG OCI_CREATED=1970-01-01T00:00:00Z
ARG PUBLIC_CONFIG_SHA256=unrecorded
LABEL org.opencontainers.image.title="StoryBored Reader" \
      org.opencontainers.image.source="${OCI_REPOSITORY}" \
      org.opencontainers.image.version="${OCI_VERSION}" \
      org.opencontainers.image.revision="${OCI_READER_SHA}" \
      org.opencontainers.image.created="${OCI_CREATED}" \
      ai.boredcorp.product="${OCI_PRODUCT}" \
      ai.boredcorp.project="${OCI_PROJECT}" \
      ai.boredcorp.component="reader" \
      ai.boredcorp.root-revision="${OCI_ROOT_SHA}" \
      ai.boredcorp.reader-revision="${OCI_READER_SHA}" \
      ai.boredcorp.build-profile="${OCI_BUILD_PROFILE}" \
      ai.boredcorp.public-config-sha256="${PUBLIC_CONFIG_SHA256}"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /app
COPY --from=build --chown=65532:65532 /app/readest/apps/readest-app/.next/standalone/ ./
COPY --from=build --chown=65532:65532 /app/readest/apps/readest-app/.next/static/ ./readest/apps/readest-app/.next/static/
COPY --from=build --chown=65532:65532 /app/readest/apps/readest-app/public/ ./readest/apps/readest-app/public/

WORKDIR /app/readest/apps/readest-app
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/health/live',{signal:AbortSignal.timeout(4000)}).then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node", "server.js"]
