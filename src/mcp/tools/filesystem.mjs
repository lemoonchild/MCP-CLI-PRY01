import { callTool } from './call.mjs';

export async function fs_createDirectory(client, path) {
  return callTool(client, 'create_directory', { path });
}

export async function fs_writeFile(client, path, content) {
  return callTool(client, 'write_file', { path, content });
}

export async function fs_listDir(client, path) {
  return callTool(client, 'list_directory', { path });
}