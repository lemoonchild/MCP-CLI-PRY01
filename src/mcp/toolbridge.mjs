import path from 'node:path';
import { listTools, callTool } from './tools/call.mjs';
import { logMessage } from '../logger.mjs';

const BASE_REPOS = path.resolve(process.cwd(), process.env.MCP_BASE_REPOS || 'repos');
const BASE_DEMO  = path.resolve(process.cwd(), process.env.MCP_BASE_DEMO  || 'demo');

function normalizeToolsList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.tools)) return res.tools;
  return [];
}

function toAnthropicTools(mcpTools, label) {
  return normalizeToolsList(mcpTools).map(t => ({
    name: t.name,
    description: t.description || `${label} tool`,
    input_schema: t.inputSchema || t.input_schema || {
      type: 'object',
      additionalProperties: true
    }
  }));
}

export async function buildToolCatalog(servers) {
  const lists = await Promise.all(servers.map(s => listTools(s.client)));
  const toolsForAnthropic = [];
  const routeMap = new Map(); // name -> { client, sanitizer }

  servers.forEach((s, idx) => {
    const lst = lists[idx];
    toAnthropicTools(lst, s.label).forEach(t => toolsForAnthropic.push(t));
    normalizeToolsList(lst).forEach(t => {
      routeMap.set(t.name, { client: s.client, sanitizer: s.sanitizer });
    });
  });

  return { toolsForAnthropic, routeMap };
}

function forceUnderBase(base, inputPath) {
  let p = path.isAbsolute(inputPath) ? inputPath : path.join(base, inputPath);
  p = path.resolve(p);

  if (!p.startsWith(base + path.sep) && p !== base) {
    p = path.join(base, path.basename(inputPath));
  }
  return p;
}

function sanitizeGitArgs(name, args, state) {
  const a = { ...(args || {}) };

  if (a.repo_path) {
    a.repo_path = forceUnderBase(BASE_REPOS, a.repo_path);
    state.currentRepoPath = a.repo_path;
  } else if (state.currentRepoPath) {
    a.repo_path = state.currentRepoPath;
  } else {
    a.repo_path = path.join(BASE_REPOS, 'repo-mcp');
    state.currentRepoPath = a.repo_path;
  }

  if (name === 'git_add' && Array.isArray(a.files)) {
    a.files = a.files.map(f =>
      path.isAbsolute(f) ? path.relative(a.repo_path, f) || '.' : f
    );
  }

  return a;
}

function sanitizeFsArgs(name, args, state) {
  const a = { ...(args || {}) };
  const pathKeys = ['path', 'source', 'destination']; 

  for (const k of pathKeys) {
    if (!a[k]) continue;
    if (state.currentRepoPath) {
      const asRel = path.isAbsolute(a[k])
        ? path.basename(a[k])
        : a[k];
      a[k] = path.resolve(state.currentRepoPath, asRel);
    } else {
      a[k] = forceUnderBase(BASE_DEMO, a[k]);
    }
  }

  return a;
}

function sanitizeArgsByTool(name, rawArgs, state, sanitizer) {
  if (sanitizer === 'git') return sanitizeGitArgs(name, rawArgs, state);
  if (sanitizer === 'fs')  return sanitizeFsArgs(name, rawArgs, state);
  return rawArgs; 
}

export async function fulfillToolUses(routeMap, contentBlocks, sessionState) {
  const results = [];

  for (const block of (contentBlocks || [])) {
    if (block.type !== 'tool_use') continue;

    const { id: tool_use_id, name, input } = block;

    // routeMap guarda: name -> { client, sanitizer }
    const entry = routeMap.get(name);
    if (!entry) {
      const msg = `Tool no registrada en routeMap: ${name}`;
      logMessage('mcp', msg);
      results.push({ type: 'tool_result', tool_use_id, content: `ERROR: ${msg}` });
      continue;
    }
    const { client, sanitizer } = entry;

    try {
      const safeArgs = sanitizeArgsByTool(name, input || {}, sessionState, sanitizer);
      const res = await callTool(client, name, safeArgs);
      
      let textOut = '';
      if (res?.content && Array.isArray(res.content)) {
        textOut = res.content
          .map(b => (b.type === 'text' ? b.text : JSON.stringify(b)))
          .join('\n');
      } else {
        textOut = typeof res === 'string' ? res : JSON.stringify(res);
      }

      results.push({ type: 'tool_result', tool_use_id, content: [{ type: 'text', text: textOut }] });
      logMessage('mcp', `tool_result ${name}: ${(textOut || '').substring(0, 400)}`);
    } catch (e) {
      const err = e?.message || String(e);
      results.push({
        type: 'tool_result',
        tool_use_id,
        content: [{ type: 'text', text: `ERROR: ${err}` }],
      });
      logMessage('mcp', `ERROR tool ${name}: ${err}`);
    }
  }

  return results;
}