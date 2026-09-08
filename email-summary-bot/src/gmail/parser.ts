import { convert as htmlToText } from 'html-to-text';
import type { gmail_v1 } from 'googleapis';

import type { GmailThreadSummary, NormalizedMessage } from '../types.js';

function decodeBase64Url(input?: string | null) {
  if (!input) {
    return '';
  }

  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function collectBodies(part?: gmail_v1.Schema$MessagePart): { plain: string[]; html: string[] } {
  if (!part) {
    return { plain: [], html: [] };
  }

  const plain: string[] = [];
  const html: string[] = [];

  if (part.mimeType === 'text/plain' && part.body?.data) {
    plain.push(decodeBase64Url(part.body.data));
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    html.push(decodeBase64Url(part.body.data));
  }

  for (const child of part.parts ?? []) {
    const nested = collectBodies(child);
    plain.push(...nested.plain);
    html.push(...nested.html);
  }

  return { plain, html };
}

function cleanEmailText(text: string) {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();

  const stopMarkers = [
    /^On .+wrote:$/im,
    /^From:\s.+$/im,
    /^-----Original Message-----$/im,
    /^_{5,}$/m,
  ];

  let trimmed = normalized;
  for (const marker of stopMarkers) {
    const match = marker.exec(trimmed);
    if (match && typeof match.index === 'number') {
      trimmed = trimmed.slice(0, match.index).trim();
    }
  }

  trimmed = trimmed
    .split('\n')
    .filter((line) => !/^>+/.test(line.trim()))
    .filter((line) => !/(unsubscribe|manage preferences|view in browser|privacy policy)/i.test(line))
    .filter((line) => !/^Sent from my /i.test(line.trim()))
    .join('\n')
    .split(/^--\s*$/m)[0]
    .trim();

  return trimmed.replace(/\n{3,}/g, '\n\n').slice(0, 2000).trim();
}

function getHeaderMap(headers?: gmail_v1.Schema$MessagePartHeader[]) {
  const map: Record<string, string> = {};
  for (const header of headers ?? []) {
    if (!header.name || !header.value) {
      continue;
    }

    map[header.name.toLowerCase()] = header.value;
  }
  return map;
}

function buildMessage(message: gmail_v1.Schema$Message): NormalizedMessage {
  const headers = getHeaderMap(message.payload?.headers);
  const bodies = collectBodies(message.payload);
  const plainText = bodies.plain.join('\n').trim();
  const htmlText = bodies.html.length
    ? htmlToText(bodies.html.join('\n'), {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
          { selector: 'img', format: 'skip' },
        ],
      })
    : '';

  const bodyText = cleanEmailText(plainText || htmlText || message.snippet || '');

  return {
    id: message.id ?? '',
    historyId: message.historyId ?? '',
    subject: headers.subject ?? '(no subject)',
    from: headers.from ?? 'Unknown sender',
    date: headers.date ?? new Date(Number(message.internalDate ?? Date.now())).toISOString(),
    bodyText,
    snippet: (message.snippet ?? '').trim(),
    headers,
  };
}

function buildContext(messages: NormalizedMessage[]) {
  const recentMessages = messages.slice(-3);
  const parts: string[] = [];
  let totalLength = 0;

  for (const message of recentMessages) {
    const body = message.bodyText || message.snippet || '(no readable body)';
    const chunk = `From: ${message.from}\nDate: ${message.date}\nSubject: ${message.subject}\nBody:\n${body}`;
    const bounded = chunk.slice(0, 1800);

    if (totalLength + bounded.length > 6000) {
      break;
    }

    parts.push(bounded);
    totalLength += bounded.length;
  }

  return parts.join('\n\n---\n\n');
}

export function normalizeThread(thread: gmail_v1.Schema$Thread): GmailThreadSummary | null {
  if (!thread.id || !thread.messages?.length) {
    return null;
  }

  const messages = [...thread.messages]
    .sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0))
    .map(buildMessage)
    .filter((message) => message.id);

  if (!messages.length) {
    return null;
  }

  const latestMessage = messages[messages.length - 1];

  return {
    threadId: thread.id,
    historyId: thread.historyId ?? latestMessage.historyId,
    latestMessageId: latestMessage.id,
    subject: latestMessage.subject,
    latestSender: latestMessage.from,
    messages,
    contextText: buildContext(messages),
  };
}
