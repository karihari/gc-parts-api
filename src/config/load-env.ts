import { existsSync } from 'node:fs';

// Loads .env into process.env (Node 22 built-in). Variables already set win,
// so a deployment's real environment is never overridden by a stray file.
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
