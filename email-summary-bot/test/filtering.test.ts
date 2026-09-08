import { describe, expect, it } from 'vitest';

import { evaluateThread } from '../src/filtering/rules.js';
import type { GmailThreadSummary } from '../src/types.js';

function makeThread(overrides: Partial<GmailThreadSummary> = {}): GmailThreadSummary {
  return {
    threadId: 'thread-1',
    historyId: 'history-1',
    latestMessageId: 'message-1',
    subject: 'Contract revision',
    latestSender: 'Alice <alice@example.com>',
    contextText: 'Please review the attached contract updates.',
    messages: [
      {
        id: 'message-1',
        historyId: 'history-1',
        subject: 'Contract revision',
        from: 'Alice <alice@example.com>',
        date: '2026-03-31T12:00:00.000Z',
        bodyText: 'Please review the attached contract updates.',
        snippet: 'Please review the attached contract updates.',
        headers: {},
      },
    ],
    ...overrides,
  };
}

describe('evaluateThread', () => {
  it('keeps a normal person-to-person email', () => {
    const result = evaluateThread(makeThread());
    expect(result).toEqual({ excluded: false, reasons: [] });
  });

  it('excludes no-reply senders', () => {
    const result = evaluateThread(makeThread({ latestSender: 'No Reply <noreply@example.com>' }));
    expect(result.excluded).toBe(true);
    expect(result.reasons).toContain('no-reply-sender');
  });

  it('excludes newsletter headers', () => {
    const result = evaluateThread(
      makeThread({
        messages: [
          {
            ...makeThread().messages[0],
            headers: {
              'list-unsubscribe': '<mailto:unsubscribe@example.com>',
            },
          },
        ],
      }),
    );
    expect(result.excluded).toBe(true);
    expect(result.reasons).toContain('list-unsubscribe');
  });
});
