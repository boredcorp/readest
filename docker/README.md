# Self-Hosting with Docker/Podman with Compose

## Stack

| service         | Image                                      | Description                                       |
| --------------- | ------------------------------------------ | ------------------------------------------------- |
| **client**      | from `../Dockerfile`                       | readest frontend                                  |
| **db**          | `supabase/postgres`                        | psql db with supabase extensions                  |
| **kong**        | `kong:2.8.1`                               | api gateway routing requests to supabase services |
| **auth**        | `supabase/gotrue:v2.189.0`                 | auth service (email, JWT)                         |
| **rest**        | `postgrest/postgrest:v14.12`               | psql rest api                                     |
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
checkout. Run the build from the StoryBored repository root so the Dockerfile can build those
packages from source. The Dockerfile-specific allowlist keeps local secrets and generated artifacts
out of the build context, including every `.env*` file. Public Next.js configuration is passed
explicitly as build arguments and inlined at build time.

```bash
docker build -f readest/Dockerfile \
  --target production-stage \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://localhost:7000 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
  --build-arg NEXT_PUBLIC_APP_PLATFORM=web \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3 \
  --build-arg NEXT_PUBLIC_STORAGE_FIXED_QUOTA=1073741824 \
  --build-arg NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA=50000 \
  --build-arg NEXT_PUBLIC_STORYBORED_ENABLED=true \
  --build-arg NEXT_PUBLIC_STORYBORED_API_BASE_URL=https://api.storybored.localhost \
  --build-arg NEXT_PUBLIC_MARKETPLACE_URL=https://storybored.localhost/marketplace \
  -t readest-client \
  .
```

With the Compose dependencies running, run the built image on the same private network:

```bash
docker run --network readest_default -p 127.0.0.1:3000:3000 \
  -e SUPABASE_URL=http://kong:8000 \
  -e SUPABASE_ANON_KEY=<anon-key> \
  -e SUPABASE_ADMIN_KEY=<service-role-key> \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_REGION=us-east-1 \
  -e S3_BUCKET_NAME=readest-files \
  -e S3_ACCESS_KEY_ID=<minio-user> \
  -e S3_SECRET_ACCESS_KEY=<minio-password> \
  readest-client
```
