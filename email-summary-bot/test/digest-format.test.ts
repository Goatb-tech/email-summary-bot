import { describe, expect, it } from 'vitest';

import { formatDigest } from '../src/digest/format.js';

describe('formatDigest', () => {
  it('formats a clean Telegram digest', () => {
    const output = formatDigest([
      {
        threadId: '1',
        sender: 'Acme Corp <legal@acme.com>',
        subject: 'Contract revision',
        priority: 'high',
        summary: 'Acme accepted most terms but requested net 45 payment terms.',
        action: 'Review and reply today.',
        latestMessageId: 'm1',
        historyId: 'h1',
      },
    ]);

    expect(output).toContain('Inbox Digest');
    expect(output).toContain('1. Acme Corp');
    expect(output).toContain('Priority: High');
    expect(output).toContain('Action: Review and reply today.');
  });

  it('returns null when only low-priority items exist', () => {
    const output = formatDigest([
      {
        threadId: '1',
        sender: 'Bot <bot@example.com>',
        subject: 'FYI',
        priority: 'low',
        summary: 'Just a low-value update.',
        action: 'None',
        latestMessageId: 'm1',
        historyId: 'h1',
      },
    ]);

    expect(output).toBeNull();
  });
});
