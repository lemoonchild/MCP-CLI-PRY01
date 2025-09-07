import { logMessage } from '../logger.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { connectHttpServer } from './connect_http.mjs'; 

function ensureConfig(cfg) {
  if (!cfg?.command || typeof cfg.command !== 'string') {
    throw new Error(`Config inválida: "command" no definido para ${cfg?.name || '(sin nombre)'}`);
  }
  if (!Array.isArray(cfg.args)) cfg.args = [];
  if (!cfg.env) cfg.env = process.env;
}

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