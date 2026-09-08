import type { GmailThreadSummary, ThreadFilterResult } from '../types.js';

const NO_REPLY_PATTERN = /(no[\s-]?reply|do[\s-]?not[\s-]?reply|donotreply)/i;
const MARKETING_PATTERNS = [
  /newsletter/i,
  /unsubscribe/i,
  /manage preferences/i,
  /view in browser/i,
  /special offer/i,
  /limited time/i,
  /register now/i,
  /webinar/i,
  /sale ends/i,
];

function countMarketingSignals(text: string) {
  return MARKETING_PATTERNS.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
}

export function evaluateThread(thread: GmailThreadSummary): ThreadFilterResult {
  const reasons = new Set<string>();
  const latestText = `${thread.subject}\n${thread.messages.at(-1)?.bodyText ?? ''}`.toLowerCase();

  if (NO_REPLY_PATTERN.test(thread.latestSender)) {
    reasons.add('no-reply-sender');
  }

  for (const message of thread.messages) {
    const headers = message.headers;
    const precedence = headers.precedence?.toLowerCase() ?? '';
    const autoSubmitted = headers['auto-submitted']?.toLowerCase() ?? '';

    if (headers['list-unsubscribe']) {
      reasons.add('list-unsubscribe');
    }

    if (headers['list-id']) {
      reasons.add('list-id');
    }

    if (/(bulk|list|junk)/.test(precedence)) {
      reasons.add('bulk-precedence');
    }

    if (autoSubmitted && autoSubmitted !== 'no') {
      reasons.add('auto-submitted');
    }
  }

  if (countMarketingSignals(latestText) >= 2) {
    reasons.add('marketing-keywords');
  }

  return {
    excluded: reasons.size > 0,
    reasons: [...reasons],
  };
}
