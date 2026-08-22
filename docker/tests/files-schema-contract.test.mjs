import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const CANONICAL_FILES_CONTRACT = `
create table public.files (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  book_hash text,
  file_key text not null,
  file_size bigint not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  constraint files_pkey primary key (id),
  constraint files_file_key_key unique (file_key),
  constraint files_file_size_positive check (file_size > 0),
  constraint files_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade
);

create index files_user_deleted_at_idx
  on public.files (user_id, deleted_at);
create index files_user_book_hash_deleted_at_idx
  on public.files (user_id, book_hash, deleted_at);

alter table public.files enable row level security;

create policy files_select_own
  on public.files
  for select
  to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);

create policy files_insert_own
  on public.files
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy files_update_own
  on public.files
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy files_delete_own
  on public.files
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.files from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.files to authenticated, service_role;
`;

const normalizeStatement = (statement) =>
  statement
    .replace(/--.*$/gmu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*([(),])\s*/gu, '$1')
    .trim()
    .toLowerCase();

const filesContractStatements = (sql) =>
  sql
    .split(';')
    .map(normalizeStatement)
    .filter(
      (statement) =>
        statement.includes('public.files') ||
        statement === 'grant usage on schema public to authenticated,service_role',
    );

test('bootstrap public.files SQL matches the canonical StoryBored contract', async () => {
  const schemaPath = fileURLToPath(new URL('../volumes/db/init/schema.sql', import.meta.url));
  const integratedMigrationPath = fileURLToPath(
    new URL(
      '../../../supabase/migrations/20260820210000_readest_files_schema.sql',
      import.meta.url,
    ),
  );
  const bootstrapSql = await readFile(schemaPath, 'utf8');
  let canonicalSql = CANONICAL_FILES_CONTRACT;

  try {
    canonicalSql = await readFile(integratedMigrationPath, 'utf8');
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) throw error;
  }

  assert.deepEqual(
    filesContractStatements(bootstrapSql),
    filesContractStatements(canonicalSql),
  );
});
