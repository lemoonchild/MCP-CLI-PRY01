import { callTool } from './call.mjs';

export async function git_init(client, repo_path) {
  return callTool(client, 'git_init', { repo_path });
}

export async function git_add(client, repo_path, files) {
  return callTool(client, 'git_add', { repo_path, files });
}

export async function git_commit(client, repo_path, message) {
  return callTool(client, 'git_commit', { repo_path, message });
}

export async function git_status(client, repo_path) {
  return callTool(client, 'git_status', { repo_path });
}