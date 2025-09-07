import { logMessage } from '../../logger.mjs';

export async function callTool(client, name, args = {}) {
  if (typeof client.callTool === 'function') {

    if (client.info?.transport === 'http') {
      return await client.callTool(name, args);
    }

    return await client.callTool({ name, arguments: args });
  }

  if (client.tools && typeof client.tools.call === 'function') {
    return await client.tools.call({ name, arguments: args });
  }

  if (typeof client.request === 'function') {
    return await client.request('tools/call', { name, arguments: args });
  }

  throw new Error('No encontré una forma compatible de invocar tools en el cliente MCP.');
}

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