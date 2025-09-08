import { callTool } from './call.mjs';

/**
 * Initializes a new Git repository at the specified path.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} repo_path - The absolute path where the Git repo should be initialized.
 * @returns {Promise<any>} - Result of the Git initialization.
 */
export async function git_init(client, repo_path) {
  return callTool(client, 'git_init', { repo_path });
}

/**
 * Adds one or more files to the Git staging area.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} repo_path - Path to the Git repository.
 * @param {string[]} files - Array of file paths to add.
 * @returns {Promise<any>} - Result of the `git add` operation.
 */
export async function git_add(client, repo_path, files) {
  return callTool(client, 'git_add', { repo_path, files });
}

/**
 * Commits staged changes in the Git repository.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} repo_path - Path to the Git repository.
 * @param {string} message - Commit message.
 * @returns {Promise<any>} - Result of the `git commit`.
 */
export async function git_commit(client, repo_path, message) {
  return callTool(client, 'git_commit', { repo_path, message });
}

/**
 * Retrieves the status of the Git repository.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} repo_path - Path to the Git repository.
 * @returns {Promise<any>} - Status of the repository (`git status`).
 */
export async function git_status(client, repo_path) {
  return callTool(client, 'git_status', { repo_path });
}

/**
 * Retrieves the commit log from the Git repository.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} repo_path - Path to the Git repository.
 * @param {number} [max_count=1] - Maximum number of commits to retrieve.
 * @returns {Promise<any>} - Git log entries.
 */
export async function git_log(client, repo_path, max_count = 1) {
  return callTool(client, 'git_log', { repo_path, max_count });
}

/**
 * Shows the details of a specific commit or revision in the Git repository.
 *
 * @param {object} client - The MCP client instance.
 * @param {string} repo_path - Path to the Git repository.
 * @param {string} [revision='HEAD'] - Git revision to inspect (e.g., 'HEAD', commit hash).
 * @returns {Promise<any>} - Result of the `git show` command.
 */
export async function git_show(client, repo_path, revision = 'HEAD') {
  return callTool(client, 'git_show', { repo_path, revision });
}