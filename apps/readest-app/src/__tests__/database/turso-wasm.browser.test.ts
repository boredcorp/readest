import { describe, beforeEach, afterEach } from 'vitest';
import { WebDatabaseService } from '@/services/database/webDatabaseService';
import { DatabaseService } from '@/types/database';
import { baseTests } from './suites/base-tests';
import { ftsTests } from './suites/fts-tests';
import { vectorTests } from './suites/vector-tests';
import { migrationTests } from './suites/migration-tests';

/**
 * Browser-based integration tests for WebDatabaseService using @readest/turso-database-wasm.
 * These run in real headless Chromium via @vitest/browser + Playwright, providing
 * Web Workers, SharedArrayBuffer, and OPFS support required by the WASM module.
 */
describe('WebDatabaseService (browser WASM, in-memory SQLite)', () => {
  let db: DatabaseService | undefined;
  const getDb = (): DatabaseService => {
    if (!db) throw new Error('WebDatabaseService was not initialized');
    return db;
  };

  beforeEach(async () => {
    db = await WebDatabaseService.open(':memory:', { experimental: ['index_method'] });
  });

  afterEach(async () => {
    await db?.close();
    db = undefined;
  });

  describe('Base Operations', () => {
    baseTests(getDb);
  });

  describe('Full-Text Search', () => {
    ftsTests(getDb);
  });

  describe('Vector Search', () => {
    vectorTests(getDb);
  });

  describe('Migrations', () => {
    migrationTests(getDb);
  });
});
