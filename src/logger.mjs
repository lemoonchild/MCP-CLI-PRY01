import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_DIR = join(process.cwd(), 'src', 'logs');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// Nombre de archivo basado en fecha/hora
const sessionFile = join(LOG_DIR, `session-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

/**
 * Escribe una entrada de log en formato JSONL
 * @param {string} role "user" | "assistant" | "system" | "mcp"
 * @param {string} content texto del mensaje
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
 * Devuelve la ruta del archivo actual de la sesión
 */
export function getLogFile() {
  return sessionFile;
}