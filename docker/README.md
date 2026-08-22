# Self-Hosting with Docker/Podman with Compose

## Stack

| service         | Image                                      | Description                                       |
| --------------- | ------------------------------------------ | ------------------------------------------------- |
| **client**      | from `../Dockerfile`                       | readest frontend                                  |
| **db**          | `supabase/postgres`                        | psql db with supabase extensions                  |
| **kong**        | `kong:2.8.1`                               | api gateway routing requests to supabase services |
| **auth**        | `supabase/gotrue:v2.189.0`                 | auth service (email, JWT)                         |
| **rest**        | `postgrest/postgrest:v14.12`               | psql rest api                                     |
| **storage**     | `supabase/storage-api:v1.60.4`             | private Supabase Storage API and deletion surface |
| **minio**       | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | local-only s3 storage                             |
| **minio-setup** | `minio/mc:RELEASE.2025-08-13T08-35-41Z`    | local bucket bootstrap                            |

### Exposed ports

| Port   | Service          |
| ------ | ---------------- |
| `3000` | readest          |
| `7000` | kong API gateway |
| `9000` | MinIO S3 API     |
| `9001` | MinIO console UI |

MinIO is retained here only as a deterministic local development dependency. Its community
container line is archived and has no supported security-update path, so this Compose stack must
not be used as a staging or production storage deployment. Hosted StoryBored environments use the
configured private managed S3-compatible service; replacing this local emulator is tracked as a
separate migration.

Supabase Storage is routed privately through Kong at `/storage/v1/` and persists its small
file-backed data plane in the `supabase-storage-data` volume. It is not the product ebook store:
Reader ebooks and temporary Reader objects continue to use the configured S3-compatible service.
The Storage service exists so Supabase-owned buckets have a supported API and account deletion can
enumerate and purge them without treating a missing service as an empty result.

---

## Running with Docker/Podman Compose

### 1. setup .env

```bash
cp docker/.env.example docker/.env
```

update `docker/.env`:

- update `POSTGRES_PASSWORD` to a strong password (32+ chars)
- update `JWT_SECRET` to a random secret (32+ chars)
- regenerate `ANON_KEY` and `SERVICE_ROLE_KEY` as HS256 JWTs signed with your `JWT_SECRET` (use [jwt.io](https://jwt.io/) or a similar tool):
  - `ANON_KEY` payload: `{"role": "anon"}`
  - `SERVICE_ROLE_KEY` payload: `{"role": "service_role"}`
- set `MINIO_ROOT_PASSWORD` to a strong password

### 2. Start the Stack

run from the `docker/` directory:

```bash
cd docker
docker compose up --build -d
```

the client image is built locally on first run. subsequent starts reuse the cached image.

### 3. Access

- Readest app: `http://localhost:3000`
- MinIO console: `http://localhost:9001` (login with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

### Hot Reload (development)

to develop using the compose stack, set the build target on `client` to `development-stage`, which'll runs the next.js dev server. to enable hot reload, uncomment the `volumes` block in the `client` service in `compose.yaml`:

```yaml
volumes:
  - ../:/app/readest
  - /app/readest/node_modules
  - /app/readest/apps/readest-app/node_modules
  - /app/readest/apps/readest-app/public/vendor
  - /app/readest/apps/readest-app/.next
  - /app/readest/packages/foliate-js/node_modules
```

the first mount overlays your local repo into the container. the remaining anonymous volumes shadow the directories that were pre-built inside the image, so the container's installed deps and vendor assets are used instead of what's on your host.

### Stop the Stack

```bash
cd docker
docker compose down
```

to also remove volumes (database and storage data):

```bash
cd docker
docker compose down -v
```

---

## Building the Dockerfile from StoryBored

The StoryBored integration branch imports generated SDK and shared-type artifacts from its parent
checkout. Initialize the checkout with `git submodule update --init --recursive`, then run the build
from the StoryBored repository root so the Dockerfile can build those packages and the Reader's
nested vendor submodules from source. The Dockerfile-specific allowlist keeps local secrets and
generated artifacts out of the build context, including every `.env*` file. Public Next.js
configuration is passed explicitly as build arguments and inlined at build time.

Production image builds fail closed unless all six product endpoints are credential-free HTTP(S)
URLs without a query or fragment:

- `NEXT_PUBLIC_API_BASE_URL` uses the externally reachable Reader web origin; in the bundled local
  Compose profile that is `http://localhost:3000`.
- `NEXT_PUBLIC_NODE_BASE_URL` uses a credential-free Reader node origin
  (`https://reader.storybored.ai`).
- `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_MARKETPLACE_URL` use the StoryBored origin
  (`https://storybored.ai`, with `/marketplace` on the latter).
- `NEXT_PUBLIC_STORYBORED_API_BASE_URL` uses `https://api.storybored.ai`.
- `NEXT_PUBLIC_SUPABASE_URL` uses `https://supabase.storybored.ai`.

This prevents Reader calls, metadata, marketplace/legal links, StoryBored API requests, and identity
traffic from falling back to upstream Readest or legacy StoryBored hosts. Sentry and PostHog remain
optional.

The production target copies only Next.js standalone output, static assets, and public assets into
its runtime stage. It runs as the image's unprivileged `node` user and probes `/health/live` from
inside the container. Release builds must also pass the OCI metadata arguments shown below; the
deterministic defaults are for local builds only. A valid `OCI_READER_SHA` also becomes Next.js's
build ID, so release assets are reproducibly tied to the exact Reader gitlink. `PUBLIC_CONFIG_SHA256`
records the release pipeline's hash of the public `NEXT_PUBLIC_*` build configuration.

StoryBored container releases use the root application's semantic version in `OCI_VERSION` and the
exact fork revision in `OCI_READER_SHA`. Packaging-only changes here do not change Readest's upstream
application version or upstream release notes.

Privacy-safe Sentry exception delivery is optional. Leave `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_ENVIRONMENT`, and `NEXT_PUBLIC_SENTRY_RELEASE` blank to disable it, or configure
all three together with an HTTPS DSN. They must be passed when the image is built because Next.js
freezes public environment variables into the browser bundle during `next build`; changing only the
running container environment does not update that bundle.

```bash
docker build -f readest/Dockerfile \
  --target production-stage \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://localhost:7000 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
  --build-arg NEXT_PUBLIC_APP_PLATFORM=web \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_NODE_BASE_URL=https://reader.storybored.localhost \
  --build-arg NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3 \
  --build-arg NEXT_PUBLIC_STORAGE_FIXED_QUOTA=1073741824 \
  --build-arg NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA=50000 \
  --build-arg NEXT_PUBLIC_STORYBORED_ENABLED=true \
  --build-arg NEXT_PUBLIC_STORYBORED_API_BASE_URL=https://api.storybored.localhost \
  --build-arg NEXT_PUBLIC_MARKETPLACE_URL=https://storybored.localhost/marketplace \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=<https-public-sentry-dsn> \
  --build-arg NEXT_PUBLIC_SENTRY_ENVIRONMENT=production \
  --build-arg NEXT_PUBLIC_SENTRY_RELEASE=<release-id> \
  --build-arg NEXT_PUBLIC_SITE_URL=https://storybored.localhost \
  --build-arg OCI_PRODUCT=storybored \
  --build-arg OCI_PROJECT=storybored \
  --build-arg OCI_REPOSITORY=https://github.com/boredcorp/storybored \
  --build-arg OCI_VERSION=<root-package-version> \
  --build-arg OCI_ROOT_SHA=<40-character-root-sha> \
  --build-arg OCI_READER_SHA=<40-character-reader-sha> \
  --build-arg OCI_BUILD_PROFILE=production \
  --build-arg OCI_CREATED=<rfc3339-creation-time> \
  --build-arg PUBLIC_CONFIG_SHA256=<lowercase-sha256-of-public-config> \
  -t readest-client \
  .
```

With the Compose dependencies running, run the built image on the same private network:

```bash
docker run --network readest_default -p 127.0.0.1:3000:3000 \
  -e SUPABASE_URL=http://localhost:7000 \
  -e SUPABASE_INTERNAL_URL=http://kong:8000 \
  -e SUPABASE_ANON_KEY=<anon-key> \
  -e SUPABASE_ADMIN_KEY=<service-role-key> \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_REGION=us-east-1 \
  -e S3_BUCKET_NAME=readest-files \
  -e S3_ACCESS_KEY_ID=<minio-user> \
  -e S3_SECRET_ACCESS_KEY=<minio-password> \
  readest-client
```
