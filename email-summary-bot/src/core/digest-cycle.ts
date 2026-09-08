import { formatDigest } from '../digest/format.js';
import type { AppRepository } from '../db/client.js';
import type {
  DigestItem,
  GmailThreadSummary,
  ProcessedThreadState,
  RunMode,
  ThreadFilterResult,
  ThreadSummaryResult,
} from '../types.js';

export interface CycleDependencies {
  mode: RunMode;
  accountEmail: string;
  repo: AppRepository;
  gmailService: {
    listUnreadInboxThreadIds(): Promise<string[]>;
    getThread(threadId: string): Promise<GmailThreadSummary | null>;
  };
  filterThread(thread: GmailThreadSummary): ThreadFilterResult;
  summarizeThread(thread: GmailThreadSummary): Promise<ThreadSummaryResult | null>;
  messenger: {
    sendDigest(message: string): Promise<void>;
  };
  logger: {
    info(message: unknown, description?: string): void;
    warn(message: unknown, description?: string): void;
    error(message: unknown, description?: string): void;
  };
}

interface CycleResult {
  digest: string | null;
  threadCount: number;
  deliveredCount: number;
  skippedCount: number;
}

function buildDigestItem(thread: GmailThreadSummary, summary: ThreadSummaryResult): DigestItem {
  return {
    threadId: thread.threadId,
    sender: thread.latestSender,
    subject: thread.subject,
    priority: summary.priority,
    summary: summary.summary,
    action: summary.action_needed ? summary.action : 'None',
    latestMessageId: thread.latestMessageId,
    historyId: thread.historyId,
  };
}

function ignoredState(
  accountEmail: string,
  thread: GmailThreadSummary,
  runId: number,
  reason: string,
  summary: ThreadSummaryResult | null = null,
): ProcessedThreadState {
  return {
    accountEmail,
    threadId: thread.threadId,
    latestMessageId: thread.latestMessageId,
    latestHistoryId: thread.historyId,
    status: 'ignored',
    runId,
    reason,
    summaryJson: summary ? JSON.stringify(summary) : null,
  };
}

function sentState(accountEmail: string, item: DigestItem, runId: number): ProcessedThreadState {
  return {
    accountEmail,
    threadId: item.threadId,
    latestMessageId: item.latestMessageId,
    latestHistoryId: item.historyId,
    status: 'sent',
    runId,
    reason: null,
    summaryJson: JSON.stringify({
      priority: item.priority,
      summary: item.summary,
      action: item.action,
    }),
  };
}

export async function runDigestCycle(deps: CycleDependencies): Promise<CycleResult> {
  const runId = deps.repo.createDigestRun(deps.mode);

  try {
    const threadIds = await deps.gmailService.listUnreadInboxThreadIds();
    const digestItems: DigestItem[] = [];
    const ignoredThreads: ProcessedThreadState[] = [];

    for (const threadId of threadIds) {
      let thread: GmailThreadSummary | null;

      try {
        thread = await deps.gmailService.getThread(threadId);
      } catch (error) {
        deps.logger.warn({ err: error, threadId }, 'Skipping thread because Gmail fetch failed');
        continue;
      }

      if (!thread) {
        continue;
      }

      if (!deps.repo.shouldProcessThread(deps.accountEmail, thread.threadId, thread.latestMessageId, thread.historyId)) {
        continue;
      }

      const filterResult = deps.filterThread(thread);
      if (filterResult.excluded) {
        ignoredThreads.push(ignoredState(deps.accountEmail, thread, runId, filterResult.reasons.join(',')));
        continue;
      }

      let summary: ThreadSummaryResult | null;

      try {
        summary = await deps.summarizeThread(thread);
      } catch (error) {
        deps.logger.warn({ err: error, threadId: thread.threadId }, 'Skipping thread because summarization failed');
        continue;
      }

      if (!summary) {
        deps.logger.warn({ threadId: thread.threadId }, 'Skipping thread because summarization failed');
        continue;
      }

      if (summary.priority === 'low') {
        ignoredThreads.push(ignoredState(deps.accountEmail, thread, runId, 'low-priority', summary));
        continue;
      }

      digestItems.push(buildDigestItem(thread, summary));
    }

    const digest = formatDigest(digestItems);
    if (!digest) {
      for (const state of ignoredThreads) {
        deps.repo.recordThreadState(state);
      }

      deps.repo.finishDigestRun(runId, 'success', {
        threadCount: threadIds.length,
        deliveredCount: 0,
        skippedCount: ignoredThreads.length,
      });

      deps.logger.info({ threadCount: threadIds.length }, 'No important emails found');
      return {
        digest: null,
        threadCount: threadIds.length,
        deliveredCount: 0,
        skippedCount: ignoredThreads.length,
      };
    }

    await deps.messenger.sendDigest(digest);

    for (const state of ignoredThreads) {
      deps.repo.recordThreadState(state);
    }

    for (const item of digestItems) {
      deps.repo.recordThreadState(sentState(deps.accountEmail, item, runId));
    }

    deps.repo.finishDigestRun(runId, 'success', {
      threadCount: threadIds.length,
      deliveredCount: digestItems.length,
      skippedCount: ignoredThreads.length,
    });

    deps.logger.info(
      { deliveredCount: digestItems.length, skippedCount: ignoredThreads.length },
      'Digest cycle completed',
    );

    return {
      digest,
      threadCount: threadIds.length,
      deliveredCount: digestItems.length,
      skippedCount: ignoredThreads.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown digest cycle error';
    deps.repo.finishDigestRun(runId, 'failure', {
      threadCount: 0,
      deliveredCount: 0,
      skippedCount: 0,
      errorText: message,
    });
    deps.logger.error({ err: error }, 'Digest cycle failed');
    throw error;
  }
}
