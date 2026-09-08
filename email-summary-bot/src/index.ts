import { createLogger } from './logger.js';
import { loadConfig } from './config/env.js';
import { runGmailAuthFlow, getAuthorizedGmail } from './gmail/auth.js';
import { createRepository } from './db/client.js';
import { createGmailService } from './gmail/client.js';
import { evaluateThread } from './filtering/rules.js';
import { createOllamaClient } from './ollama/client.js';
import { createTelegramClient } from './telegram/client.js';
import { runDigestCycle } from './core/digest-cycle.js';
import { startScheduler } from './scheduler/cron.js';
import type { RunMode } from './types.js';

type Command = RunMode | 'auth';

function parseCommand(value?: string): Command {
  if (!value) {
    return 'run-once';
  }

  if (value === 'run-once' || value === 'dry-run' || value === 'scheduled' || value === 'auth') {
    return value;
  }

  throw new Error(`Unknown command: ${value}. Use auth, run-once, dry-run, or scheduled.`);
}

async function main() {
  const command = parseCommand(process.argv[2]);
  const config = loadConfig(command);
  const logger = createLogger();
  const repo = createRepository(config.sqlitePath);

  const runSingleCycle = async (mode: RunMode) => {
    const authorized = await getAuthorizedGmail(config, repo);
    const gmailService = createGmailService(authorized.gmail, config.gmailQuery);
    const ollamaClient = createOllamaClient(config, logger);
    const messenger =
      mode === 'dry-run'
        ? {
            async sendDigest(message: string) {
              process.stdout.write(`${message}\n`);
            },
          }
        : createTelegramClient(config.telegramBotToken!, config.telegramChatId!);

    return runDigestCycle({
      mode,
      accountEmail: authorized.accountEmail,
      repo,
      gmailService,
      filterThread: evaluateThread,
      summarizeThread: ollamaClient.summarizeThread,
      messenger,
      logger,
    });
  };

  try {
    if (command === 'auth') {
      await runGmailAuthFlow(config, repo, console);
      return;
    }

    if (command === 'scheduled') {
      await runSingleCycle('scheduled');
      startScheduler(config, async () => {
        await runSingleCycle('scheduled');
      }, logger);
      return;
    }

    await runSingleCycle(command);
  } finally {
    if (command !== 'scheduled') {
      repo.close();
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
