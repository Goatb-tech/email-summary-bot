import { describe, expect, it, vi } from 'vitest';

import { createOllamaClient } from '../src/ollama/client.js';
import type { AppConfig } from '../src/config/env.js';
import type { GmailThreadSummary } from '../src/types.js';

const config: AppConfig = {
  port: 8787,
  nodeEnv: 'test',
  sqlitePath: ':memory:',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
  gmailClientId: 'id',
  gmailClientSecret: 'secret',
  gmailRedirectUri: 'http://127.0.0.1:8787/oauth2callback',
  telegramBotToken: 'token',
  telegramChatId: 'chat',
  digestCron: '*/30 * * * *',
  gmailQuery: 'is:unread in:inbox -category:promotions -category:social',
};

const thread: GmailThreadSummary = {
  threadId: 'thread-1',
  historyId: 'history-1',
  latestMessageId: 'message-1',
  subject: 'Contract revision',
  latestSender: 'Alice <alice@example.com>',
  contextText: 'Acme asked for net 45 payment terms.',
  messages: [],
};

describe('createOllamaClient', () => {
  it('retries once and returns null on malformed responses', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { content: 'not-json' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { content: 'still not json' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

    const logger = { warn: vi.fn() };
    const client = createOllamaClient(config, logger, fetchImpl);

    await expect(client.summarizeThread(thread)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
