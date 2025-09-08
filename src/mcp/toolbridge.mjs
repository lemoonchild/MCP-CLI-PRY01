import path from 'node:path';
import { listTools, callTool } from './tools/call.mjs';
import { logMessage } from '../logger.mjs';

const BASE_REPOS = path.resolve(process.cwd(), process.env.MCP_BASE_REPOS || 'repos');
const BASE_DEMO  = path.resolve(process.cwd(), process.env.MCP_BASE_DEMO  || 'demo');

/**
 * Normalizes a tool list response, handling different response shapes.
 * 
 * @param {any} res - The raw response from listTools.
 * @returns {Array<object>} A normalized array of tool objects.
 */
function normalizeToolsList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.tools)) return res.tools;
  return [];
}

/**
 * Converts a list of MCP tools to the Anthropic-compatible format.
 * 
 * @param {Array<object>} mcpTools - Tools from the MCP server.
 * @param {string} label - Label used for fallback descriptions.
 * @returns {Array<object>} Tools formatted for Anthropic LLM.
 */
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

/**
 * Builds the complete tool catalog for Anthropic and routing.
 * 
 * @param {Array<{ label: string, client: any, sanitizer?: string }>} servers - List of connected MCP servers.
 * @returns {Promise<{ toolsForAnthropic: Array<object>, routeMap: Map<string, { client: any, sanitizer?: string }> }>}
 */
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

/**
 * Ensures a path is safely inside the base directory.
 *
 * @param {string} base - The base directory.
 * @param {string} inputPath - The input path to validate.
 * @returns {string} The resolved, safe absolute path.
 */
function forceUnderBase(base, inputPath) {
  let p = path.isAbsolute(inputPath) ? inputPath : path.join(base, inputPath);
  p = path.resolve(p);

  if (!p.startsWith(base + path.sep) && p !== base) {
    p = path.join(base, path.basename(inputPath));
  }
  return p;
}

/**
 * Sanitizes arguments for Git-related tools (e.g., resolving paths).
 * 
 * @param {string} name - Tool name.
 * @param {object} args - Raw arguments.
 * @param {object} state - Mutable session state (for tracking paths).
 * @returns {object} Sanitized arguments.
 */
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

/**
 * Sanitizes arguments for Filesystem-related tools.
 * 
 * @param {string} name - Tool name.
 * @param {object} args - Raw arguments.
 * @param {object} state - Mutable session state (for tracking paths).
 * @returns {object} Sanitized arguments.
 */
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

/**
 * Dispatches argument sanitization based on tool type.
 * 
 * @param {string} name - Tool name.
 * @param {object} rawArgs - Raw arguments from LLM.
 * @param {object} state - Session state.
 * @param {string} sanitizer - Type of sanitizer ('git', 'fs', etc.).
 * @returns {object} Sanitized arguments.
 */
function sanitizeArgsByTool(name, rawArgs, state, sanitizer) {
  if (sanitizer === 'git') return sanitizeGitArgs(name, rawArgs, state);
  if (sanitizer === 'fs')  return sanitizeFsArgs(name, rawArgs, state);
  return rawArgs; 
}

/**
 * Fulfills tool_use blocks from the LLM using the appropriate MCP client/tool.
 * 
 * @param {Map<string, { client: any, sanitizer?: string }>} routeMap - Map of tool names to clients.
 * @param {Array<object>} contentBlocks - Blocks returned by the LLM (e.g., Claude).
 * @param {object} sessionState - Mutable session state for path resolution.
 * @returns {Promise<Array<object>>} List of tool_result blocks to send back to the LLM.
 */
export async function fulfillToolUses(routeMap, contentBlocks, sessionState) {
  const results = [];

  for (const block of (contentBlocks || [])) {
    if (block.type !== 'tool_use') continue;

    const { id: tool_use_id, name, input } = block;

    // routeMap saves: name -> { client, sanitizer }
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