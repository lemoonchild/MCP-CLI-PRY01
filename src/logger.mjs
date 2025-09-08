import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Directory path for storing log files.
 * Will be created automatically if it doesn't exist.
 */
const LOG_DIR = join(process.cwd(), 'src', 'logs');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Path to the current session log file.
 * Filename is based on current date and time (safe for filesystems).
 * Format: session-YYYY-MM-DDTHH-MM-SS-SSSZ.jsonl
 */
const sessionFile = join(LOG_DIR, `session-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

/**
 * Appends a log entry to the current session file in JSON Lines format.
 *
 * @param {string} role - The role of the message sender. Expected values: "user", "assistant", "system", "mcp".
 * @param {string} content - The content of the message to log.
 */
export function logMessage(role, content) {
  const entry = {
    timestamp: new Date().toISOString(),
    role,
    content
  };

  appendFileSync(sessionFile, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * Returns the full path to the current session log file.
 *
 * @returns {string} Path to the log file.
 */
export function getLogFile() {
  return sessionFile;
}