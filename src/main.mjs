import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { logMessage, getLogFile } from './logger.mjs';
import { resolve } from 'node:path';

import { getFilesystemServerConfig, getGitServerConfig, getFoodServerConfig, getJokesServerConfig, getWfServerConfig, getTrainerServerConfig } from './mcp/servers.mjs';
import { connectServer } from './mcp/connect.mjs';
import { fs_createDirectory, fs_writeFile } from './mcp/tools/filesystem.mjs';
import { git_init, git_add, git_commit, git_status, git_log } from './mcp/tools/git.mjs';
import { buildToolCatalog, fulfillToolUses } from './mcp/toolbridge.mjs';
import { listTools } from './mcp/tools/call.mjs';

/**
 * @fileoverview
 * CLI chat client that connects to Anthropic's LLM with optional MCP (Model Context Protocol) tool integration.
 * Supports interactive multi-turn conversations, filesystem and git operations, food/jokes recommendations,
 * workflow orchestration, and training tool demos.
 *
 * Commands:
 *   /salir → terminate session
 *   /clear → clear conversation context
 *   /mcp:connect → connect to MCP servers (FS, Git, Food, Jokes, Workflow, Trainer)
 *   /tools:on → enable MCP tools for LLM
 *   /tools:off → disable MCP tools
 *   /demo:git <name> → create git repo with README and initial commit in ./repos/<name>
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  - Required, API key for Anthropic
 *   ANTHROPIC_MODEL    - Optional, defaults to "claude-3-5-sonnet-20240620"
 */

/**
* Load Anthropic API key and model.
*/
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Falta ANTHROPIC_API_KEY en tu archivo .env');
  process.exit(1);
}

const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
const client = new Anthropic({ apiKey });

/**
* Readline interface for user interaction.
*/
const rl = createInterface({ input, output });

/**
* Session and tool state variables.
*/
const messages = [];
let fsClient = null;
let gitClient = null;
let foodClient = null;
let jokesClient = null;
let wfClient = null;
let trainerClient = null; 
let toolsMode  = false;
let toolsForAnthropic = [];
let routeMap = new Map();
let sessionState = { currentRepoPath: null };

console.log('-- Chat LLM con Anthropic (multi-turno) --');
console.log('Comandos:\n  /salir → terminar\n  /clear → limpiar contexto\n  /mcp:connect → conecta FS y Git\n  /tools:on → conecta MCP y activa uso de tools por el LLM\n  /tools:off → desactiva uso de tools\n  /demo:git <nombre> → crea repo, README y commit en ./repos/<nombre>\n');
console.log(`(Tus logs se guardarán en: ${getLogFile()})\n`);

/**
 * Ensures MCP servers (filesystem, git, food, jokes, workflow, trainer) are connected.
 * Initializes clients if they do not already exist.
 *
 * @returns {Promise<void>}
 */
async function ensureMcpConnected() {
  if (fsClient && gitClient && foodClient && jokesClient && wfClient) return;

  const fsCfg = getFilesystemServerConfig();
  const gitCfg = getGitServerConfig();
  const foodCfg = getFoodServerConfig();
  const jokesCfg = getJokesServerConfig();
  const wfCfg = getWfServerConfig();
  const trainerCfg = getTrainerServerConfig();

  fsClient = fsClient ?? await connectServer(fsCfg);
  gitClient = gitClient ?? await connectServer(gitCfg);
  foodClient = foodClient ?? await connectServer(foodCfg);
  jokesClient= jokesClient ?? await connectServer(jokesCfg); 
  wfClient = wfClient ?? await connectServer(wfCfg); 
  trainerClient = trainerClient ?? await connectServer(trainerCfg);
}

/**
 * Extracts plain text from a list of Anthropic message blocks.
 *
 * @param {Array<{ type: string, text?: string }>} blocks - Response blocks
 * @returns {string} Concatenated plain text
 */
function extractText(blocks) {
  return (blocks || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

/**
 * Normalizes tool list responses from MCP servers.
 *
 * @param {any} res - Raw response
 * @returns {Array<{ name: string }>} List of tools
 */
function normalizeToolsList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.tools)) return res.tools;
  return [];
}

/**
 * Converts a tool or message response into plain text.
 *
 * @param {any} res - Response (string, object, or array of blocks)
 * @returns {string} Text representation
 */
function toText(res) {
  if (res?.content && Array.isArray(res.content)) {
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return typeof res === 'string' ? res : JSON.stringify(res);
}

/**
 * Extracts author information from a git log message.
 *
 * @param {string} text - Git log output
 * @returns {string} Author in format "Name <email>"
 */
function extractAuthor(text) {
  const m = text.match(/Author:\s*(.+?)\s*<([^>]+)>/i);
  return m ? `${m[1]} <${m[2]}>` : '(autor no detectado)';
}

/**
 * Extracts commit hash from a git log message.
 *
 * @param {string} text - Git log output
 * @returns {string} Commit hash or placeholder
 */
function extractHash(text) {
  const m = text.match(/commit\s+([0-9a-f]{7,40})/i);
  return m ? m[1] : '(hash no detectado)';
}

/**
 * Handles a conversation turn with Anthropic when tools are enabled.
 * Executes tool calls and integrates results into the conversation.
 *
 * @param {Array<{ role: string, content: any }>} messages - Conversation history
 * @param {Anthropic} client - Anthropic SDK client
 * @param {string} model - Model name
 * @returns {Promise<string>} Final assistant reply text
 */
async function askAnthropicWithTools(messages, client, model) {
  let resp = await client.messages.create({ model, max_tokens: 1024, tools: toolsForAnthropic, messages });
  messages.push({ role: 'assistant', content: resp.content });

  let toolResults = await fulfillToolUses(routeMap, resp.content, sessionState);

  while (toolResults.length > 0) {
    messages.push({ role: 'user', content: toolResults });

    resp = await client.messages.create({ model, max_tokens: 1024, tools: toolsForAnthropic, messages });
    messages.push({ role: 'assistant', content: resp.content });

    toolResults = await fulfillToolUses(routeMap, resp.content, sessionState);
  }

  const finalText = extractText(resp.content) || '(Sin texto en la respuesta)';
  return finalText;
}

/**
 * Connects to MCP servers and announces available tools.
 * Updates global tool catalog and routing map.
 *
 * @returns {Promise<void>}
 */
async function connectAndAnnounceTools() {
  await ensureMcpConnected();
  
  const catalog = await buildToolCatalog([
    { label: 'filesystem', client: fsClient, sanitizer: 'fs' },
    { label: 'git',        client: gitClient, sanitizer: 'git' },
    { label: 'food',       client: foodClient, sanitizer: 'none' },
    { label: 'jokes',      client: jokesClient, sanitizer: 'none' }, 
    { label: 'wf',      client: wfClient, sanitizer: 'none' }, 
    { label: 'trainer', client: trainerClient, sanitizer: 'none' },
  ]);

  toolsForAnthropic = catalog.toolsForAnthropic;
  routeMap = catalog.routeMap;

  console.log('Tools enviadas a Anthropic:');
  console.dir(toolsForAnthropic, { depth: null });

  const show = async (label, client) => {
    try {
      const lst = normalizeToolsList(await listTools(client));
      console.log(`\nTools de ${label}:`);
      lst.forEach(t => console.log(' -', t.name));
    } catch (e) {
      console.log(`No pude listar tools de ${label}:`, e?.message || e);
    }
  };
  await show('filesystem', fsClient);
  await show('git', gitClient);
  await show('food', foodClient);
  await show('jokes', jokesClient);
  await show('wf', wfClient);
  await show ('trainer', trainerClient); 
  console.log('\nMCP conectado (FS + Git + Food + Dad Jokes + Wf + trainer).\n');
}

/**
 * Demonstrates filesystem + git MCP integration by creating a repository with README and initial commit.
 *
 * @param {string} repoName - Repository name
 * @returns {Promise<void>}
 */
async function runGitDemo(repoName) {
  if (!repoName) {
    console.log('Uso: /demo:git <nombre-repo>\n');
    return;
  }
  await ensureMcpConnected();

  const repoPath = resolve(process.cwd(), 'repos', repoName);

  logMessage('mcp', `DEMO: crear repo en ${repoPath}`);

  await fs_createDirectory(fsClient, repoPath);

  const readmePath = resolve(repoPath, 'README.md');
  const readme = `# ${repoName}\n\nRepositorio creado por MCP demo.\n`;
  await fs_writeFile(fsClient, readmePath, readme);

  await git_init(gitClient, repoPath);

  await git_add(gitClient, repoPath, [readmePath]);

  const commitMsg = 'chore: initial commit with README';
  const commitRes = await git_commit(gitClient, repoPath, commitMsg);

  const logRes = await git_log(gitClient, repoPath, 1);
  const logText = toText(logRes);
  const author = extractAuthor(logText);
  const hash = extractHash(logText);

  const status = await git_status(gitClient, repoPath);

  console.log('\n--- REPOSITORIO CREADO  ---');
  console.log(`Repo: ${repoPath}`);
  console.log(`Autor del commit: ${author}`);
  console.log(`Hash del commit:  ${hash}`);
  console.log('git status:\n', status?.content ?? status, '\n');

  logMessage('mcp', `Commit realizado en ${repoPath}: ${JSON.stringify(commitRes)}`);
}

/**
 * Main interactive REPL loop.
 * Handles user input, executes special commands, and manages chat with Anthropic.
 *
 * @returns {Promise<void>}
 */
async function askLoop() {
  while (true) {
    const userPrompt = await rl.question('Escribe tu pregunta: ');

    const trimmed = userPrompt.trim();
    if (!trimmed) continue;

    // Comandos especiales
    if (trimmed === '/salir') break;
    if (trimmed === '/clear') {
      messages.length = 0;
      console.log('(Contexto borrado)\n');
      continue;
    }
    if (trimmed === '/mcp:connect') { await ensureMcpConnected(); console.log('MCP conectado (FS + Git)\n'); continue; }
    if (trimmed.startsWith('/demo:git')) {
      const name = trimmed.split(' ').slice(1).join(' ').trim();
      try { await runGitDemo(name); } catch (e) { console.error('Error en demo:', e?.message || e); }
      continue;
    }
    if (trimmed === '/tools:on') {
      await connectAndAnnounceTools();
      toolsMode = true;
      console.log('(Modo tools ACTIVADO: el LLM puede usar Filesystem/Git/Food/Jokes)\n');
      continue;
    }
    if (trimmed === '/tools:off') {
      toolsMode = false;
      console.log('(Modo tools DESACTIVADO)\n');
      continue;
    }
    // Agregar turno de usuario al historial
    messages.push({ role: 'user', content: trimmed });
    logMessage('user', trimmed);

    try {
      let text;
      if (toolsMode && toolsForAnthropic.length > 0) {
        text = await askAnthropicWithTools(messages, client, model);

        console.log('\nRespuesta del asistente:\n' + text + '\n');
        logMessage('assistant', text);

      } else {
        const response = await client.messages.create({ model, max_tokens: 1024, messages });
        text = extractText(response.content) || '(Sin texto en la respuesta)';

        console.log('\nRespuesta del asistente:\n' + text + '\n');
        messages.push({ role: 'assistant', content: text });
        logMessage('assistant', text);
      }
    } catch (err) {
      console.error('\nOcurrió un error llamando al LLM:', err?.message || err);
      logMessage('system', `Error: ${err?.message || err}`);
      console.log('\n(El chat continúa; puedes intentar de nuevo o usar /salir)\n');
    }
  }
}

askLoop()
  .finally(() => rl.close());