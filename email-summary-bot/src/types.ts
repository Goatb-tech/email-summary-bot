export type Priority = 'high' | 'medium' | 'low';

export type RunMode = 'run-once' | 'dry-run' | 'scheduled';

export interface NormalizedMessage {
  id: string;
  historyId: string;
  subject: string;
  from: string;
  date: string;
  bodyText: string;
  snippet: string;
  headers: Record<string, string>;
}

export interface GmailThreadSummary {
  threadId: string;
  historyId: string;
  latestMessageId: string;
  subject: string;
  latestSender: string;
  messages: NormalizedMessage[];
  contextText: string;
}

export interface ThreadFilterResult {
  excluded: boolean;
  reasons: string[];
}

export interface ThreadSummaryResult {
  summary: string;
  priority: Priority;
  action_needed: boolean;
  action: string;
}

export interface DigestItem {
  threadId: string;
  sender: string;
  subject: string;
  priority: Priority;
  summary: string;
  action: string;
  latestMessageId: string;
  historyId: string;
}

export interface ProcessedThreadState {
  accountEmail: string;
  threadId: string;
  latestMessageId: string;
  latestHistoryId: string;
  status: 'sent' | 'ignored';
  runId: number | null;
  reason: string | null;
  summaryJson: string | null;
}
