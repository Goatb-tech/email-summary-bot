import type { gmail_v1 } from 'googleapis';

import { normalizeThread } from './parser.js';

export interface GmailService {
  listUnreadInboxThreadIds(): Promise<string[]>;
  getThread(threadId: string): Promise<ReturnType<typeof normalizeThread>>;
}

export function createGmailService(gmail: gmail_v1.Gmail, query: string): GmailService {
  return {
    async listUnreadInboxThreadIds() {
      const ids: string[] = [];
      let pageToken: string | undefined;

      do {
        const response = await gmail.users.threads.list({
          userId: 'me',
          q: query,
          pageToken,
          maxResults: 100,
        });

        ids.push(...(response.data.threads ?? []).map((thread) => thread.id).filter((id): id is string => Boolean(id)));
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);

      return ids;
    },

    async getThread(threadId) {
      const response = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });

      return normalizeThread(response.data);
    },
  };
}
