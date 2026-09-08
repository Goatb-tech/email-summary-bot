import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import type { GmailThreadSummary, ThreadSummaryResult } from '../types.js';

const summarySchema = z
  .object({
    summary: z
      .string()
      .min(1)
      .refine((value) => value.trim().split(/\s+/).length <= 40, 'summary must be 40 words or fewer'),
    priority: z.enum(['high', 'medium', 'low']),
    action_needed: z.boolean(),
    action: z.string().min(1),
  })
  .strict();

interface OllamaResponse {
  message?: {
    content?: string;
  };
}

function buildPrompt(thread: GmailThreadSummary) {
  return [
    {
      role: 'system',
      content:
        'You summarize email threads for a concise inbox digest. Return strict JSON only. Focus on the latest state of the thread. Use high for urgent/actionable, medium for useful operational updates, and low for low-value FYI items. The summary must be at most 40 words.',
    },
    {
      role: 'user',
      content: `Return a JSON object with this exact schema:\n{"summary":"string","priority":"high|medium|low","action_needed":true,"action":"string"}\n\nThread ID: ${thread.threadId}\nLatest sender: ${thread.latestSender}\nSubject: ${thread.subject}\n\nThread context:\n${thread.contextText}`,
    },
  ];
}

function buildRepairPrompt(rawResponse: string) {
  return [
    {
      role: 'system',
      content:
        'Repair the invalid response into strict JSON only. Do not add markdown, commentary, or code fences. Preserve meaning when possible and satisfy the exact schema.',
    },
    {
      role: 'user',
      content: `Invalid response:\n${rawResponse}\n\nRequired schema:\n{"summary":"string up to 40 words","priority":"high|medium|low","action_needed":true,"action":"string"}`,
    },
  ];
}

function parseSummary(raw: string): ThreadSummaryResult | null {
  try {
    const parsed = JSON.parse(raw);
    const result = summarySchema.parse(parsed);
    return {
      ...result,
      action: result.action_needed ? result.action.trim() : 'None',
    };
  } catch {
    return null;
  }
}

async function requestOllama(
  config: AppConfig,
  messages: Array<{ role: string; content: string }>,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
      },
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OllamaResponse;
  const content = data.message?.content?.trim();
  if (!content) {
    throw new Error('Ollama returned an empty response.');
  }

  return content;
}

export function createOllamaClient(
  config: AppConfig,
  logger: { warn: (message: unknown, description?: string) => void },
  fetchImpl: typeof fetch = fetch,
) {
  return {
    async summarizeThread(thread: GmailThreadSummary) {
      const firstAttempt = await requestOllama(config, buildPrompt(thread), fetchImpl);
      const parsed = parseSummary(firstAttempt);
      if (parsed) {
        return parsed;
      }

      logger.warn({ threadId: thread.threadId }, 'Invalid Ollama JSON, retrying with repair prompt');
      const repaired = await requestOllama(config, buildRepairPrompt(firstAttempt), fetchImpl);
      const repairedParsed = parseSummary(repaired);
      if (repairedParsed) {
        return repairedParsed;
      }

      logger.warn({ threadId: thread.threadId }, 'Skipping thread after invalid Ollama repair response');
      return null;
    },
  };
}
