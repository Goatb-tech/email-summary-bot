import { afterEach, describe, expect, it } from 'vitest';

import { createRepository } from '../src/db/client.js';

describe('repository dedupe behavior', () => {
  const repos: Array<ReturnType<typeof createRepository>> = [];

  afterEach(() => {
    for (const repo of repos) {
      repo.close();
    }
    repos.length = 0;
  });

  it('does not reprocess identical thread state', () => {
    const repo = createRepository(':memory:');
    repos.push(repo);

    repo.recordThreadState({
      accountEmail: 'me@example.com',
      threadId: 'thread-1',
      latestMessageId: 'message-1',
      latestHistoryId: 'history-1',
      status: 'sent',
      runId: 1,
      reason: null,
      summaryJson: '{}',
    });

    expect(repo.shouldProcessThread('me@example.com', 'thread-1', 'message-1', 'history-1')).toBe(false);
    expect(repo.shouldProcessThread('me@example.com', 'thread-1', 'message-2', 'history-2')).toBe(true);
  });
});
