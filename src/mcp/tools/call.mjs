import { logMessage } from '../../logger.mjs';

/**
 * Calls a tool exposed by an MCP server, using a flexible interface to support different client implementations.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} name - The name of the tool to invoke.
 * @param {object} [args={}] - Optional arguments to pass to the tool.
 * @returns {Promise<any>} - The result returned by the tool.
 * @throws {Error} If no compatible method to call the tool is found.
 */
export async function callTool(client, name, args = {}) {
  if (typeof client.callTool === 'function') {

    if (client.info?.transport === 'http') {
      // HTTP-based clients use a flat callTool(name, args) signature
      return await client.callTool(name, args);
    }
    // stdio-based or MCP SDK clients use an object format
    return await client.callTool({ name, arguments: args });
  }

  if (client.tools && typeof client.tools.call === 'function') {
    // Fallback to tools.call format
    return await client.tools.call({ name, arguments: args });
  }

  if (typeof client.request === 'function') {
    // Fallback to raw JSON-RPC
    return await client.request('tools/call', { name, arguments: args });
  }

  throw new Error('No encontré una forma compatible de invocar tools en el cliente MCP.');
}

/**
 * Lists the available tools exposed by an MCP server, trying multiple formats for compatibility.
 *
 * @param {object} client - The MCP client instance.
 * @returns {Promise<Array<object>>} - An array of tool definitions.
 * @throws {Error} If no compatible method to list tools is found.
 */
export async function listTools(client) {
  try {
    if (typeof client.listTools === 'function') {
      return await client.listTools();
    }
    if (client.tools && typeof client.tools.list === 'function') {
      return await client.tools.list();
    }
    if (typeof client.request === 'function') {
      const res = await client.request('tools/list', {});
      return res?.tools || res;
    }
  } catch (e) {
    logMessage('mcp', `Error listando tools: ${e?.message || e}`);
    throw e;
  }
  throw new Error('No encontré una forma compatible de listar tools en el cliente MCP.');
}