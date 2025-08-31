import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { logMessage, getLogFile } from './logger.mjs';
import { resolve } from 'node:path';

import { getFilesystemServerConfig, getGitServerConfig, getFoodServerConfig } from './mcp/servers.mjs';
import { connectServer } from './mcp/connect.mjs';
import { fs_createDirectory, fs_writeFile } from './mcp/tools/filesystem.mjs';
import { git_init, git_add, git_commit, git_status, git_log } from './mcp/tools/git.mjs';
import { buildToolCatalog, fulfillToolUses } from './mcp/toolbridge.mjs';
import { listTools } from './mcp/tools/call.mjs';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Falta ANTHROPIC_API_KEY en tu archivo .env');
  process.exit(1);
}

const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
const client = new Anthropic({ apiKey });
const rl = createInterface({ input, output });

// Historial para mantener contexto en la sesión
const messages = [];
let fsClient = null;
let gitClient = null;
let foodClient = null;
let toolsMode  = false;
let toolsForAnthropic = [];
let routeMap = new Map();
let sessionState = { currentRepoPath: null };

console.log('-- Chat LLM con Anthropic (multi-turno) --');
console.log('Comandos:\n  /salir → terminar\n  /clear → limpiar contexto\n  /mcp:connect → conecta FS y Git\n  /tools:on → conecta MCP y activa uso de tools por el LLM\n  /tools:off → desactiva uso de tools\n  /demo:git <nombre> → crea repo, README y commit en ./repos/<nombre>\n');
console.log(`(Tus logs se guardarán en: ${getLogFile()})\n`);

async function ensureMcpConnected() {
  if (fsClient && gitClient && foodClient) return;

  const fsCfg = getFilesystemServerConfig();
  const gitCfg = getGitServerConfig();
  const foodCfg = getFoodServerConfig();

  fsClient = fsClient ?? await connectServer(fsCfg);
  gitClient = gitClient ?? await connectServer(gitCfg);
  foodClient = foodClient ?? await connectServer(foodCfg);
}

// Extrae y concatena texto de bloques "text"
function extractText(blocks) {
  return (blocks || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

// Normaliza la lista de tools desde distintas posibles respuestas MCP
function normalizeToolsList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.tools)) return res.tools;
  return [];
}
function toText(res) {
  if (res?.content && Array.isArray(res.content)) {
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return typeof res === 'string' ? res : JSON.stringify(res);
}
function extractAuthor(text) {
  const m = text.match(/Author:\s*(.+?)\s*<([^>]+)>/i);
  return m ? `${m[1]} <${m[2]}>` : '(autor no detectado)';
}
function extractHash(text) {
  const m = text.match(/commit\s+([0-9a-f]{7,40})/i);
  return m ? m[1] : '(hash no detectado)';
}

// Lógica de interacción con tools 
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

async function connectAndAnnounceTools() {
  await ensureMcpConnected();
  // Construye catálogo con los 3 servers y anuncia
  const catalog = await buildToolCatalog([
    { label: 'filesystem', client: fsClient, sanitizer: 'fs' },
    { label: 'git',        client: gitClient, sanitizer: 'git' },
    { label: 'food',       client: foodClient, sanitizer: 'none' },
  ]);
  toolsForAnthropic = catalog.toolsForAnthropic;
  routeMap = catalog.routeMap;

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
  console.log('\nMCP conectado (FS + Git + Food).\n');
}

async function runGitDemo(repoName) {
  if (!repoName) {
    console.log('Uso: /demo:git <nombre-repo>\n');
    return;
  }
  await ensureMcpConnected();

  const repoPath = resolve(process.cwd(), 'repos', repoName);

  logMessage('mcp', `DEMO: crear repo en ${repoPath}`);

  // Crear carpeta del repo (Filesystem MCP)
  await fs_createDirectory(fsClient, repoPath);

  // Crear README.md
  const readmePath = resolve(repoPath, 'README.md');
  const readme = `# ${repoName}\n\nRepositorio creado por MCP demo.\n`;
  await fs_writeFile(fsClient, readmePath, readme);

  // Inicializar repo (Git MCP)
  await git_init(gitClient, repoPath);

  // git add README.md
  await git_add(gitClient, repoPath, [readmePath]);

  // git commit
  const commitMsg = 'chore: initial commit with README';
  const commitRes = await git_commit(gitClient, repoPath, commitMsg);

  // Lee el último commit para mostrar autor + hash
  const logRes = await git_log(gitClient, repoPath, 1);
  const logText = toText(logRes);
  const author = extractAuthor(logText);
  const hash = extractHash(logText);

  // Status final 
  const status = await git_status(gitClient, repoPath);

  console.log('\n--- REPOSITORIO CREADO  ---');
  console.log(`Repo: ${repoPath}`);
  console.log(`Autor del commit: ${author}`);
  console.log(`Hash del commit:  ${hash}`);
  console.log('git status:\n', status?.content ?? status, '\n');

  logMessage('mcp', `Commit realizado en ${repoPath}: ${JSON.stringify(commitRes)}`);
}

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
      console.log('(Modo tools ACTIVADO: el LLM puede usar Filesystem/Git/Food)\n');
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
      if (toolsMode && fsClient && gitClient && toolsForAnthropic.length > 0) {
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