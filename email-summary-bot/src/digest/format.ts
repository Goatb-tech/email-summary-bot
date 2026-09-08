import type { DigestItem } from '../types.js';

function senderLabel(sender: string) {
  const trimmed = sender.trim();
  const namedMatch = trimmed.match(/^(.*?)\s*<.+>$/);
  if (namedMatch?.[1]?.trim()) {
    return namedMatch[1].replace(/^"|"$/g, '').trim();
  }

  return trimmed;
}

function priorityRank(priority: DigestItem['priority']) {
  return priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDigest(items: DigestItem[]) {
  const importantItems = [...items]
    .filter((item) => item.priority !== 'low')
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));

  if (!importantItems.length) {
    return null;
  }

  const blocks = importantItems.map((item, index) => {
    const action = item.action.trim() || 'None';
    return [
      `${index + 1}. ${senderLabel(item.sender)}`,
      `Subject: ${item.subject}`,
      `Priority: ${titleCase(item.priority)}`,
      `Summary: ${item.summary}`,
      `Action: ${action}`,
    ].join('\n');
  });

  return `Inbox Digest\n\n${blocks.join('\n\n')}`;
}

export function splitTelegramMessage(message: string, maxLength = 3500) {
  if (message.length <= maxLength) {
    return [message];
  }

  const sections = message.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = chunks.length === 0 ? section : `Inbox Digest (continued)\n\n${section}`;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
