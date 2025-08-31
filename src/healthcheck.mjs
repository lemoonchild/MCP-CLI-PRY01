import 'dotenv/config';
import { connectServer } from './mcp/connect.mjs';
import { getFilesystemServerConfig, getGitServerConfig, getFoodServerConfig } from './mcp/servers.mjs';
import { listTools } from './mcp/tools/call.mjs';

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout > ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeToolsList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.tools)) return res.tools;
  return [];
}

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

(async () => {
  console.log('--- MCP Healthcheck ---');
  await checkServer('Filesystem', getFilesystemServerConfig);
  await checkServer('Git', getGitServerConfig);
  await checkServer('Food', getFoodServerConfig);
  console.log('--- Fin Healthcheck ---');
  process.exit(0);
})();