import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { logMessage, getLogFile } from './logger.mjs';
import { resolve } from 'node:path';

import { getFilesystemServerConfig, getGitServerConfig } from './mcp/servers.mjs';
import { connectServer } from './mcp/connect.mjs';
import { fs_createDirectory, fs_writeFile } from './mcp/tools/filesystem.mjs';
import { git_init, git_add, git_commit, git_status } from './mcp/tools/git.mjs';
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

console.log('-- Chat LLM con Anthropic (multi-turno) --');
console.log('Comandos:\n  /salir → terminar\n  /clear → limpiar contexto\n  /mcp:connect → conecta FS y Git\n  /demo:git <nombre> → crea repo, README y commit en ./repos/<nombre>\n');
console.log(`(Tus logs se guardarán en: ${getLogFile()})\n`);

async function ensureMcpConnected() {
  if (fsClient && gitClient) return;
  const fsCfg = getFilesystemServerConfig();
  const gitCfg = getGitServerConfig();
  fsClient = await connectServer(fsCfg);
  gitClient = await connectServer(gitCfg);
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

  // Status final (opcional)
  const status = await git_status(gitClient, repoPath);

  console.log('\n--- DEMO COMPLETADA ---');
  console.log(`Repo: ${repoPath}`);
  console.log('Resultado commit:', JSON.stringify(commitRes, null, 2));
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

    // Agregar turno de usuario al historial
    messages.push({ role: 'user', content: trimmed });
    logMessage('user', trimmed);

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 1024, 
        messages
      });

      // Extraer texto de los bloques
      const text = (response.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim() || '(Sin texto en la respuesta)';

      console.log('\nRespuesta del asistente:\n' + text + '\n');

      // Agregar turno del asistente al historial para mantener contexto
      messages.push({ role: 'assistant', content: text });
      logMessage('assistant', text);

    } catch (err) {
      console.error('\nOcurrió un error llamando al LLM:', err?.message || err);
      logMessage('system', `Error: ${err?.message || err}`);
      console.log('\n(El chat continúa; puedes intentar de nuevo o usar /salir)\n');
    }
  }
}

askLoop()
  .finally(() => rl.close());