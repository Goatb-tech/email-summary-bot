# Email Summary Bot

Fully local email summary MVP that reads unread Gmail inbox threads, filters low-value mail, summarizes important threads with local `Ollama`, and sends a concise digest to Telegram.

## What it does

- polls Gmail every 30 minutes by default
- reads unread inbox threads with this base Gmail query: `is:unread in:inbox -category:promotions -category:social`
- excludes newsletters, bulk mail, social/promotional mail, and no-reply senders
- summarizes important threads locally with Ollama using `qwen2.5:7b` by default
- sends a digest to Telegram only when important emails exist
- stores OAuth tokens, digest runs, and processed thread state in SQLite for idempotent re-runs
- supports `dry-run` mode to print the digest locally instead of sending to Telegram

## Local architecture

- `src/gmail/*`: Gmail OAuth, unread thread listing, and thread parsing
- `src/filtering/*`: low-value and bulk-mail filtering rules
- `src/ollama/*`: local Ollama HTTP summarization with strict JSON validation and one repair retry
- `src/digest/*`: digest shaping and Telegram-friendly formatting
- `src/telegram/*`: Telegram delivery
- `src/db/*`: SQLite persistence for connected accounts, processed threads, and digest runs
- `src/scheduler/*`: cron scheduler entrypoint
- `src/core/*`: one digest-cycle orchestrator used by CLI modes and tests

## Prerequisites

- Node.js 20+
- npm
- Ollama installed locally
- a Gmail account
- a Telegram bot and target chat ID

## Install

```bash
cd Email/email-summary-bot
npm install
```

## Install Ollama

Follow the official local installation instructions for your OS: `https://ollama.com/download`

Pull the recommended model:

```bash
ollama pull qwen2.5:7b
```

Start Ollama locally if it is not already running:

```bash
ollama serve
```

## Create Gmail OAuth credentials

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable the Gmail API.
4. Configure the OAuth consent screen for a personal/testing app.
5. Create an OAuth Client ID for a Desktop app or Web app.
6. Add your redirect URI, for example: `http://127.0.0.1:8787/oauth2callback`
7. Copy the client ID and client secret into your `.env` file.

The app uses Gmail read-only scope: `https://www.googleapis.com/auth/gmail.readonly`

## Create a Telegram bot

1. In Telegram, open `@BotFather`
2. Run `/newbot`
3. Follow the prompts and copy the bot token
4. Start a chat with your bot and send at least one message

## Get the Telegram chat ID

Use your bot token with Telegram's `getUpdates` endpoint after sending a message to the bot:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
```

Find the `chat.id` value in the JSON response and put it into `TELEGRAM_CHAT_ID`.

## Environment setup

Copy the example env file and fill in values:

```bash
cp .env.example .env
```

Required variables:

- `PORT`
- `NODE_ENV`
- `SQLITE_PATH` or `DATABASE_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `DIGEST_CRON`

## Run Gmail auth/setup

This starts a local OAuth callback server, opens the browser on macOS, and stores tokens in SQLite.

```bash
npm run auth
```

## Run one digest cycle

```bash
npm run run-once
```

## Run in dry-run mode

Print the digest locally instead of sending Telegram messages:

```bash
npm run dry-run
```

## Start the scheduler

This runs one cycle immediately and then keeps polling on `DIGEST_CRON`.

```bash
npm run scheduled
```

Default cron:

```bash
*/30 * * * *
```

## Dev mode

```bash
npm run dev -- run-once
npm run dev -- dry-run
npm run dev -- scheduled
```

## Run tests

```bash
npm test
npm run build
```

## SQLite tables

- `connected_accounts`: stored Gmail OAuth tokens for the local account
- `processed_threads`: latest delivered or ignored thread state for dedupe
- `digest_runs`: run history and outcomes

## Behavior notes

- The bot summarizes by thread, not by individual message.
- It bounds thread context to recent messages so local models stay stable.
- It does not log full email bodies.
- It only records `sent` thread states after successful digest delivery.
- It records `ignored` low-value states so unchanged low-priority/newsletter threads do not get re-summarized forever.
- In `dry-run`, local console output counts as successful local delivery for MVP usage.

## Limitations

- Filtering is heuristic and may still miss some marketing mail or over-filter edge cases.
- Gmail tokens are stored locally in SQLite for simplicity; this is acceptable for a single-user local MVP but not hardened multi-user storage.
- The app does not mark emails as read.
- Telegram formatting is plain text, not rich markdown.
- Local model quality depends on your Ollama setup and available machine resources.

## Future improvements

- add sender/domain allowlists and blocklists
- add richer thread ranking before Ollama calls
- add better HTML cleanup and reply-chain stripping
- add optional encryption for stored OAuth tokens
- add a small web UI for auth status, recent runs, and dry-run previews
