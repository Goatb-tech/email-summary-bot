import { splitTelegramMessage } from '../digest/format.js';

export interface TelegramClient {
  sendDigest(message: string): Promise<void>;
}

export function createTelegramClient(
  botToken: string,
  chatId: string,
  fetchImpl: typeof fetch = fetch,
): TelegramClient {
  return {
    async sendDigest(message) {
      const chunks = splitTelegramMessage(message);

      for (const chunk of chunks) {
        const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
          }),
        });

        if (!response.ok) {
          throw new Error(`Telegram request failed with status ${response.status}`);
        }

        const data = (await response.json()) as { ok?: boolean };
        if (!data.ok) {
          throw new Error('Telegram API returned ok=false');
        }
      }
    },
  };
}
