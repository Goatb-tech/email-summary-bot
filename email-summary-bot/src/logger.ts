import pino from 'pino';

export function createLogger() {
  return pino({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    redact: {
      paths: ['tokens', 'authorization', 'refresh_token', 'access_token', 'err', 'error', 'password', 'client_secret', '*.tokens', '*.authorization', '*.refresh_token', '*.access_token'],
      remove: true,
    },
  });
}
