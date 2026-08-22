FROM docker.io/node:24.19.0-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack install --global pnpm@11.21.0
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
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_PLATFORM
ARG NEXT_PUBLIC_API_BASE_URL
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
COPY --from=storybored-build /app/node_modules /app/node_modules
COPY --from=storybored-build /app/packages/types /app/packages/types
COPY --from=storybored-build /app/packages/storybored-sdk /app/packages/storybored-sdk
COPY --from=dependencies /app/readest/node_modules /app/readest/node_modules
COPY --from=dependencies /app/readest/apps/readest-app/node_modules /app/readest/apps/readest-app/node_modules
COPY --from=dependencies /app/readest/apps/readest-app/public/vendor /app/readest/apps/readest-app/public/vendor
COPY --from=dependencies /app/readest/packages/foliate-js/node_modules /app/readest/packages/foliate-js/node_modules
COPY readest/ /app/readest/
WORKDIR /app/readest/apps/readest-app
RUN pnpm exec next build

FROM build AS production-stage
ENTRYPOINT ["pnpm", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
EXPOSE 3000
