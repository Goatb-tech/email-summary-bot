import http from 'node:http';
import { execFile } from 'node:child_process';
import { URL } from 'node:url';
import { promisify } from 'node:util';

import { google } from 'googleapis';

import type { AppConfig } from '../config/env.js';
import type { AppRepository } from '../db/client.js';

const execFileAsync = promisify(execFile);
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function createOAuthClient(config: AppConfig) {
  return new google.auth.OAuth2(config.gmailClientId, config.gmailClientSecret, config.gmailRedirectUri);
}

export async function runGmailAuthFlow(config: AppConfig, repo: AppRepository, logger: Pick<Console, 'info' | 'error'>) {
  const oauth2Client = createOAuthClient(config);
  const redirectUrl = new URL(config.gmailRedirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
  });

  logger.info(`Open this URL to authorize Gmail:\n${authUrl}`);

  if (process.platform === 'darwin') {
    execFileAsync('open', [authUrl]).catch(() => undefined);
  }

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', config.gmailRedirectUri);
      const authCode = requestUrl.searchParams.get('code');
      const authError = requestUrl.searchParams.get('error');

      if (authError) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Authorization failed. You can close this window.');
        server.close();
        reject(new Error(`Gmail authorization failed: ${authError}`));
        return;
      }

      if (!authCode) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code. You can close this window.');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Gmail authorization complete. You can close this window.');
      server.close();
      resolve(authCode);
    });

    server.listen(Number(redirectUrl.port || config.port), redirectUrl.hostname, () => {
      logger.info(`Waiting for OAuth callback on ${config.gmailRedirectUri}`);
    });

    server.on('error', reject);
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress;

  if (!email) {
    throw new Error('Unable to determine Gmail account email address.');
  }

  repo.upsertConnectedAccount(email, tokens);
  logger.info(`Stored Gmail OAuth tokens for ${email}`);
}

export async function getAuthorizedGmail(config: AppConfig, repo: AppRepository) {
  const account = repo.getConnectedAccount();
  if (!account) {
    throw new Error('No Gmail account is connected. Run `npm run auth` first.');
  }

  const oauth2Client = createOAuthClient(config);
  oauth2Client.setCredentials(account.tokens);
  oauth2Client.on('tokens', (tokens) => {
    repo.upsertConnectedAccount(account.email, {
      ...account.tokens,
      ...tokens,
    });
  });

  return {
    accountEmail: account.email,
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
  };
}
