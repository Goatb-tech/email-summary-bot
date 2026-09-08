import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

import type { RunMode } from '../types.js';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  SQLITE_PATH: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5:7b'),
  GMAIL_CLIENT_ID: z.string().min(1, 'GMAIL_CLIENT_ID is required'),
  GMAIL_CLIENT_SECRET: z.string().min(1, 'GMAIL_CLIENT_SECRET is required'),
  GMAIL_REDIRECT_URI: z.string().url('GMAIL_REDIRECT_URI must be a valid URL'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  DIGEST_CRON: z.string().min(1).default('*/30 * * * *'),
});

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  sqlitePath: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  gmailClientId: string;
  gmailClientSecret: string;
  gmailRedirectUri: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  digestCron: string;
  gmailQuery: string;
}

function resolveSqlitePath(databaseUrl?: string, sqlitePath?: string) {
  if (databaseUrl?.startsWith('file:')) {
    return path.resolve(databaseUrl.slice(5));
  }

  return path.resolve(sqlitePath ?? './data/email-summary-bot.sqlite');
}

export function loadConfig(command: RunMode | 'auth'): AppConfig {
  const parsed = envSchema.parse(process.env);

  if (command !== 'dry-run' && command !== 'auth') {
    if (!parsed.TELEGRAM_BOT_TOKEN || !parsed.TELEGRAM_CHAT_ID) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required for Telegram delivery modes.');
    }
  }

  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    sqlitePath: resolveSqlitePath(parsed.DATABASE_URL, parsed.SQLITE_PATH),
    ollamaBaseUrl: parsed.OLLAMA_BASE_URL,
    ollamaModel: parsed.OLLAMA_MODEL,
    gmailClientId: parsed.GMAIL_CLIENT_ID,
    gmailClientSecret: parsed.GMAIL_CLIENT_SECRET,
    gmailRedirectUri: parsed.GMAIL_REDIRECT_URI,
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    telegramChatId: parsed.TELEGRAM_CHAT_ID,
    digestCron: parsed.DIGEST_CRON,
    gmailQuery: 'is:unread in:inbox -category:promotions -category:social',
  };
}
