import cron from 'node-cron';

import type { AppConfig } from '../config/env.js';

export function startScheduler(config: AppConfig, runCycle: () => Promise<void>, logger: { info: (message: unknown, description?: string) => void; error: (message: unknown, description?: string) => void; }) {
  logger.info({ cron: config.digestCron }, 'Starting scheduler');

  const task = cron.schedule(config.digestCron, async () => {
    try {
      await runCycle();
    } catch (error) {
      logger.error({ err: error }, 'Scheduled run failed');
    }
  });

  return task;
}
