import 'dotenv/config';
import { connectServer } from './mcp/connect.mjs';
import { getFilesystemServerConfig, getGitServerConfig, getFoodServerConfig } from './mcp/servers.mjs';
import { listTools } from './mcp/tools/call.mjs';

/**
 * Runs a promise with a timeout. If the promise does not resolve within the given time, it rejects.
 * 
 * @param {Promise<any>} promise - The promise to execute.
 * @param {number} ms - Timeout in milliseconds.
 * @returns {Promise<any>} Resolves with the promise result or rejects on timeout.
 */
async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout > ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Normalizes a tool list response, handling either array or object shape.
 * 
 * @param {any} res - Raw response from listTools.
 * @returns {Array<object>} Normalized list of tools.
 */
function normalizeToolsList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.tools)) return res.tools;
  return [];
}

/**
 * Connects to an MCP server, lists its tools, and logs the results.
 * 
 * @param {string} label - Human-readable name for the server.
 * @param {Function} getCfg - Function returning the server configuration.
 */
async function checkServer(label, getCfg) {
  try {
    const cfg = getCfg();
    const client = await withTimeout(connectServer(cfg), 5000);
    const tools = await withTimeout(listTools(client), 5000);
    const lst = normalizeToolsList(tools);
    console.log(`${label} respondió, tools:`, lst.map(t => t.name || JSON.stringify(t)));
  } catch (e) {
    console.error(`${label} falló:`, e.message || e);
  }
}

// Entrypoint: MCP health check for local development environment
(async () => {
  console.log('--- MCP Healthcheck ---');
  await checkServer('Filesystem', getFilesystemServerConfig);
  await checkServer('Git', getGitServerConfig);
  await checkServer('Food', getFoodServerConfig);
  console.log('--- Fin Healthcheck ---');
  process.exit(0);
})();