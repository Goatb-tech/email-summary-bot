import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import type { Credentials } from 'google-auth-library';

import type { ProcessedThreadState, RunMode } from '../types.js';

export interface ConnectedAccountRecord {
  email: string;
  tokens: Credentials;
}

export interface ProcessedThreadRecord {
  account_email: string;
  thread_id: string;
  latest_message_id: string;
  latest_history_id: string;
  status: 'sent' | 'ignored';
  run_id: number | null;
  reason: string | null;
  summary_json: string | null;
  delivered_at: string | null;
  updated_at: string;
}

export interface DigestRunSummary {
  threadCount: number;
  deliveredCount: number;
  skippedCount: number;
  errorText?: string | null;
}

export interface AppRepository {
  getConnectedAccount(): ConnectedAccountRecord | null;
  upsertConnectedAccount(email: string, tokens: Credentials): void;
  getProcessedThread(accountEmail: string, threadId: string): ProcessedThreadRecord | null;
  shouldProcessThread(accountEmail: string, threadId: string, latestMessageId: string, latestHistoryId: string): boolean;
  recordThreadState(state: ProcessedThreadState): void;
  createDigestRun(mode: RunMode): number;
  finishDigestRun(runId: number, status: 'success' | 'failure', summary: DigestRunSummary): void;
  close(): void;
}

export function createRepository(sqlitePath: string): AppRepository {
  if (sqlitePath !== ':memory:') {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  }

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS connected_accounts (
      email TEXT PRIMARY KEY,
      tokens_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processed_threads (
      account_email TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      latest_message_id TEXT NOT NULL,
      latest_history_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent', 'ignored')),
      run_id INTEGER,
      reason TEXT,
      summary_json TEXT,
      delivered_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (account_email, thread_id)
    );

    CREATE TABLE IF NOT EXISTS digest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      thread_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT
    );
  `);

  const getConnectedAccountStmt = db.prepare('SELECT email, tokens_json FROM connected_accounts LIMIT 1');
  const upsertConnectedAccountStmt = db.prepare(`
    INSERT INTO connected_accounts (email, tokens_json, created_at, updated_at)
    VALUES (@email, @tokens_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      tokens_json = excluded.tokens_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  const getProcessedThreadStmt = db.prepare(`
    SELECT * FROM processed_threads WHERE account_email = ? AND thread_id = ?
  `);
  const recordThreadStateStmt = db.prepare(`
    INSERT INTO processed_threads (
      account_email,
      thread_id,
      latest_message_id,
      latest_history_id,
      status,
      run_id,
      reason,
      summary_json,
      delivered_at,
      updated_at
    ) VALUES (
      @account_email,
      @thread_id,
      @latest_message_id,
      @latest_history_id,
      @status,
      @run_id,
      @reason,
      @summary_json,
      @delivered_at,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(account_email, thread_id) DO UPDATE SET
      latest_message_id = excluded.latest_message_id,
      latest_history_id = excluded.latest_history_id,
      status = excluded.status,
      run_id = excluded.run_id,
      reason = excluded.reason,
      summary_json = excluded.summary_json,
      delivered_at = excluded.delivered_at,
      updated_at = CURRENT_TIMESTAMP
  `);
  const createDigestRunStmt = db.prepare('INSERT INTO digest_runs (mode) VALUES (?)');
  const finishDigestRunStmt = db.prepare(`
    UPDATE digest_runs
    SET status = @status,
        finished_at = CURRENT_TIMESTAMP,
        thread_count = @thread_count,
        delivered_count = @delivered_count,
        skipped_count = @skipped_count,
        error_text = @error_text
    WHERE id = @id
  `);

  return {
    getConnectedAccount() {
      const row = getConnectedAccountStmt.get() as { email: string; tokens_json: string } | undefined;
      if (!row) {
        return null;
      }

      return {
        email: row.email,
        tokens: JSON.parse(row.tokens_json) as Credentials,
      };
    },

    upsertConnectedAccount(email, tokens) {
      upsertConnectedAccountStmt.run({
        email,
        tokens_json: JSON.stringify(tokens),
      });
    },

    getProcessedThread(accountEmail, threadId) {
      return (getProcessedThreadStmt.get(accountEmail, threadId) as ProcessedThreadRecord | undefined) ?? null;
    },

    shouldProcessThread(accountEmail, threadId, latestMessageId, latestHistoryId) {
      const existing = this.getProcessedThread(accountEmail, threadId);
      if (!existing) {
        return true;
      }

      return existing.latest_message_id !== latestMessageId || existing.latest_history_id !== latestHistoryId;
    },

    recordThreadState(state) {
      recordThreadStateStmt.run({
        account_email: state.accountEmail,
        thread_id: state.threadId,
        latest_message_id: state.latestMessageId,
        latest_history_id: state.latestHistoryId,
        status: state.status,
        run_id: state.runId,
        reason: state.reason,
        summary_json: state.summaryJson,
        delivered_at: state.status === 'sent' ? new Date().toISOString() : null,
      });
    },

    createDigestRun(mode) {
      const result = createDigestRunStmt.run(mode);
      return Number(result.lastInsertRowid);
    },

    finishDigestRun(runId, status, summary) {
      finishDigestRunStmt.run({
        id: runId,
        status,
        thread_count: summary.threadCount,
        delivered_count: summary.deliveredCount,
        skipped_count: summary.skippedCount,
        error_text: summary.errorText ?? null,
      });
    },

    close() {
      db.close();
    },
  };
}
