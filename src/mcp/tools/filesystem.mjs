import { callTool } from './call.mjs';

/**
 * Creates a new directory at the given path using the MCP filesystem tool.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} path - The path where the directory should be created.
 * @returns {Promise<any>} - The result of the directory creation.
 */
export async function fs_createDirectory(client, path) {
  return callTool(client, 'create_directory', { path });
}

/**
 * Writes content to a file at the given path using the MCP filesystem tool.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} path - The path of the file to write.
 * @param {string} content - The string content to write into the file.
 * @returns {Promise<any>} - The result of the write operation.
 */
export async function fs_writeFile(client, path, content) {
  return callTool(client, 'write_file', { path, content });
}

/**
 * Lists the contents of a directory at the given path using the MCP filesystem tool.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} path - The path of the directory to list.
 * @returns {Promise<any>} - An array or object representing the directory contents.
 */
export async function fs_listDir(client, path) {
  return callTool(client, 'list_directory', { path });
}