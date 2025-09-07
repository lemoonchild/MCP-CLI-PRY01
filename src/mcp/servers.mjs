import 'dotenv/config';

function parseArgs(str) {
  if (!str) return [];
  const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const out = [];
  let m;
  while ((m = re.exec(str)) !== null) {
    out.push(m[1] ?? m[2] ?? m[0]);
  }
  return out;
}

export function getFilesystemServerConfig() {
  const command = process.env.MCP_FS_COMMAND;
  const args = parseArgs(process.env.MCP_FS_ARGS || '');
  if (!command) throw new Error('MCP_FS_COMMAND no está definido en .env');
  return { name: 'filesystem', command, args, env: { ...process.env } };
}

export function getGitServerConfig() {
  const command = process.env.MCP_GIT_COMMAND;
  const args = parseArgs(process.env.MCP_GIT_ARGS || '');
  if (!command) throw new Error('MCP_GIT_COMMAND no está definido en .env');

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'Nicolas',
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'nicolas@gmail.com',
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'Nicolas',
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'nicolas@gmail.com'
  };

  return { name: 'git', command, args, env };
}

export function getFoodServerConfig() {
  const command = process.env.MCP_FOOD_COMMAND;
  const args = parseArgs(process.env.MCP_FOOD_ARGS || '');
  if (!command) throw new Error('MCP_FOOD_COMMAND no está definido en .env');
  const env = { ...process.env };
  return { name: 'food', command, args, env };
}

export function getJokesServerConfig() {
  const url = process.env.MCP_JOKES_URL;
  if (!url) throw new Error('MCP_JOKES_URL no está definido en .env');

  return {
    name: 'jokes',
    transport: 'http',
    url,                         
    rpcPath: '/rpc',             
    listPath: null,             
    headers: { 'Content-Type': 'application/json' },
  };
}

export function getWfServerConfig() {
  const command = process.env.MCP_WARFRAME_COMMAND;
  const args = parseArgs(process.env.MCP_WARFRAME_ARGS || '');
  if (!command) throw new Error('MCP_WARFRAME_ARGS no está definido en .env');
  const env = { ...process.env };
  return { name: 'wf', command, args, env };
}

export function getTrainerServerConfig() {
  const command = process.env.MCP_TRAINER_COMMAND;
  const args = parseArgs(process.env.MCP_TRAINER_ARGS || '');
  const cwd = process.env.MCP_TRAINER_CWD;

  if (!command) throw new Error('MCP_TRAINER_COMMAND no está definido en .env');
  if (!cwd) throw new Error('MCP_TRAINER_CWD no está definido en .env');

  const env = { ...process.env };

  return { name: 'trainer', command, args, env, cwd };
}