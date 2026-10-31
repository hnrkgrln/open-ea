import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import {
  activeDatabaseFile,
  databaseLabel,
  databaseName,
  ensurePostgresDatabase,
  listPostgresDatabases,
  readDatabaseUrl,
  rememberActiveDatabase,
  replaceDatabaseName,
  serverRoot,
  switchActiveDatabase,
  writeDatabaseUrl,
} from './databases.mjs';

function tsxBin() {
  const candidates = [
    path.join(serverRoot, 'node_modules', '.bin', 'tsx'),
    path.join(serverRoot, '..', 'node_modules', '.bin', 'tsx'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? 'tsx';
}

function requestedName(argv) {
  const args = argv.filter((arg) => arg !== '--');
  let name = '';
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run dev -- [database]

The PostgreSQL server in server/.env stays as it is. This starts the API on one of its databases.
Type a database name in this terminal to switch, or run npm run db -- <name> from another terminal.

  npm run dev
  npm run dev -- openea
`);
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      console.error(`Unknown option "${arg}".`);
      process.exit(1);
    }
    if (name) {
      console.error(`Unexpected extra argument "${arg}".`);
      process.exit(1);
    }
    name = arg;
  }
  return name;
}

const requested = requestedName(process.argv.slice(2));
if (requested) {
  const currentUrl = readDatabaseUrl();
  if (databaseName(currentUrl) !== requested) {
    const names = listPostgresDatabases(currentUrl);
    if (!names.includes(requested)) ensurePostgresDatabase(currentUrl, requested);
    writeDatabaseUrl(replaceDatabaseName(currentUrl, requested));
  }
}

const activeUrl = readDatabaseUrl();
const activeName = databaseName(activeUrl);
console.log(`Using database ${databaseLabel(activeUrl)}`);
console.log('The server stays running. Type a database name to switch.');

const setup = spawnSync(process.execPath, [path.join(serverRoot, 'scripts', 'setup-db.mjs')], {
  cwd: serverRoot,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: activeUrl },
});
if (setup.status !== 0) process.exit(setup.status ?? 1);

if (activeName) rememberActiveDatabase(activeName);

const server = spawn(tsxBin(), ['watch', 'src/index.ts'], {
  cwd: serverRoot,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    DATABASE_URL: activeUrl,
    OPENEA_DATABASE_FILE: activeDatabaseFile,
  },
});

if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  let switching = false;
  const queue = [];
  const drain = () => {
    if (switching) return;
    switching = true;
    while (queue.length) {
      const name = queue.shift();
      try {
        switchActiveDatabase(name);
      } catch (error) {
        console.error(error.message);
      }
    }
    switching = false;
  };
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) queue.push(line);
      newline = buffer.indexOf('\n');
    }
    drain();
  });
}

server.on('exit', (code) => process.exit(code ?? 0));
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
