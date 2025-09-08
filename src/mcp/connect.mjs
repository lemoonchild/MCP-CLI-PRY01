import { logMessage } from '../logger.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { connectHttpServer } from './connect_http.mjs'; 

/**
 * Ensures that the provided configuration object is valid and complete.
 *
 * @param {object} cfg - The configuration object.
 * @param {string} cfg.command - Command to launch the server.
 * @param {string[]} [cfg.args] - Command-line arguments for the server.
 * @param {object} [cfg.env] - Environment variables for the server process.
 * @throws Will throw an error if the config is invalid.
 */
function ensureConfig(cfg) {
  if (!cfg?.command || typeof cfg.command !== 'string') {
    throw new Error(`Config inválida: "command" no definido para ${cfg?.name || '(sin nombre)'}`);
  }
  if (!Array.isArray(cfg.args)) cfg.args = [];
  if (!cfg.env) cfg.env = process.env;
}


/**
 * Connects to an MCP-compatible server using either HTTP or stdio.
 *
 * @param {object} cfg - Server configuration.
 * @param {'http'|'stdio'} [cfg.transport] - Transport method. Defaults to stdio.
 * @param {string} [cfg.url] - URL for HTTP-based servers.
 * @param {string} [cfg.command] - Command to launch a stdio server.
 * @param {string[]} [cfg.args] - Arguments to pass to the stdio server.
 * @param {object} [cfg.env] - Environment variables for the stdio server.
 * @param {string} [cfg.cwd] - Working directory for launching the stdio server.
 * @param {string} [cfg.name] - Friendly name for logging and client naming.
 * @returns {Promise<object>} A connected client instance.
 * @throws Will throw if the transport is unsupported or config is invalid.
 */
export async function connectServer(cfg) {
  
  if (cfg.transport === 'http') {
    logMessage('mcp', `Conectando a servidor HTTP MCP: ${cfg.url}`);
    return connectHttpServer(cfg);
  }

  // STDIO
  ensureConfig(cfg);

  logMessage('mcp', `Lanzando servidor ${cfg.name}: ${cfg.command} ${cfg.args.join(' ')}`);

  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    cwd: cfg.cwd,
  });

  const client = new Client({
    name: `host-${cfg.name}`,
    version: '0.1.0',
  });

  await client.connect(transport);
  logMessage('mcp', `Conectado a servidor MCP: ${cfg.name}`);
  return client;
}