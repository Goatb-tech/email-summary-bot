import { describe, expect, it, vi } from 'vitest';

import { createRepository } from '../src/db/client.js';
import { runDigestCycle } from '../src/core/digest-cycle.js';
import type { GmailThreadSummary } from '../src/types.js';

const thread: GmailThreadSummary = {
  threadId: 'thread-1',
  historyId: 'history-1',
  latestMessageId: 'message-1',
  subject: 'Weekly newsletter',
  latestSender: 'Newsletter <updates@example.com>',
  contextText: 'Weekly update',
  messages: [],
};

describe('runDigestCycle', () => {
  it('does not send Telegram when no important emails are found', async () => {
    const repo = createRepository(':memory:');
    const messenger = { sendDigest: vi.fn() };

    try {
      const result = await runDigestCycle({
        mode: 'run-once',
        accountEmail: 'me@example.com',
        repo,
        gmailService: {
          async listUnreadInboxThreadIds() {
            return ['thread-1'];
          },
          async getThread() {
            return thread;
          },
        },
        filterThread() {
          return { excluded: false, reasons: [] };
        },
        async summarizeThread() {
          return {
            summary: 'Low-value weekly update.',
            priority: 'low',
            action_needed: false,
            action: 'None',
          };
        },
        messenger,
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      });

      expect(result.digest).toBeNull();
      expect(messenger.sendDigest).not.toHaveBeenCalled();
      expect(repo.shouldProcessThread('me@example.com', 'thread-1', 'message-1', 'history-1')).toBe(false);
    } finally {
      repo.close();
    }
  });
});
