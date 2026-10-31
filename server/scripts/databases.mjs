import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.join(__dirname, '..');
const envPath = path.join(serverRoot, '.env');
const aliasPath = path.join(serverRoot, 'databases.json');
export const activeDatabaseFile = path.join(serverRoot, '.active-database');

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,62}$/;
const RESERVED_NAMES = new Set(['postgres', 'template0', 'template1']);

export function isPostgres(url) {
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

export function databaseName(url) {
  if (!url || url.startsWith('file:')) return null;
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return name || null;
}

export function databaseLabel(url) {
  if (!url) return 'unset';
  if (url.startsWith('file:')) return url;
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '(none)';
    return `${name} on ${parsed.host}`;
  } catch {
    return 'unrecognized database url';
  }
}

export function databaseIdentity(url) {
  if (url.startsWith('file:')) return `file:${url}`;
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port}/${name}`;
}

export function sameDatabase(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    return databaseIdentity(left) === databaseIdentity(right);
  } catch {
    return false;
  }
}

// Keep the user, password, host, and query string exactly as written in .env.
export function replaceDatabaseName(databaseUrl, name) {
  const pattern = /^((?:postgres(?:ql)?:\/\/)[^/]*\/)[^/?]*/;
  if (!pattern.test(databaseUrl)) {
    throw new Error('DATABASE_URL has no PostgreSQL database name to replace.');
  }
  return databaseUrl.replace(pattern, `$1${name}`);
}

export function readDatabaseUrl() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  if (!fs.existsSync(envPath)) return 'file:./dev.db';
  dotenv.config({ path: envPath });
  return process.env.DATABASE_URL?.trim() || 'file:./dev.db';
}

export function replaceDatabaseUrlLine(current, url) {
  const line = `DATABASE_URL="${url.replaceAll('"', '\\"')}"`;
  if (/^DATABASE_URL=/m.test(current)) return current.replace(/^DATABASE_URL=.*$/m, line);
  const separator = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  return `${current}${separator}${line}\n`;
}

export function writeDatabaseUrl(url) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const next = replaceDatabaseUrlLine(current, url);
  if (next === current) return;
  const mode = fs.existsSync(envPath) ? fs.statSync(envPath).mode & 0o777 : 0o600;
  const tmp = `${envPath}.tmp`;
  fs.writeFileSync(tmp, next, { mode });
  fs.renameSync(tmp, envPath);
  process.env.DATABASE_URL = url;
}

export function loadAliases() {
  if (!fs.existsSync(aliasPath)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
  } catch (error) {
    throw new Error(`server/databases.json is not valid JSON (${error.message}).`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('server/databases.json must be an object of name to database.');
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`server/databases.json entry "${key}" must be a database name or URL.`);
    }
  }
  return parsed;
}

function resolveAlias(baseUrl, key, value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('file:') || /^postgres(?:ql)?:\/\//i.test(trimmed)) return trimmed;
  if (!SAFE_NAME.test(trimmed)) {
    throw new Error(`server/databases.json entry "${key}" is not a database name or URL.`);
  }
  if (!isPostgres(baseUrl)) {
    throw new Error(`server/databases.json entry "${key}" needs a PostgreSQL DATABASE_URL to name another database.`);
  }
  return replaceDatabaseName(baseUrl, trimmed);
}

function detailFor(key, url) {
  if (url.startsWith('file:')) return url === key ? '' : url;
  try {
    const name = databaseName(url);
    return name && name !== key ? name : '';
  } catch {
    return '';
  }
}

export function buildChoices(baseUrl, liveNames, aliases) {
  const byIdentity = new Map();
  const add = (key, url) => {
    let identity;
    try {
      identity = databaseIdentity(url);
    } catch {
      throw new Error(`Cannot use database "${key}" because its URL is invalid.`);
    }
    byIdentity.set(identity, {
      key,
      url,
      databaseName: isPostgres(url) ? databaseName(url) : null,
      detail: detailFor(key, url),
    });
  };

  if (isPostgres(baseUrl)) {
    for (const name of liveNames) add(name, replaceDatabaseName(baseUrl, name));
  }
  const currentKey = databaseName(baseUrl) || baseUrl;
  add(currentKey, baseUrl);
  for (const [key, value] of Object.entries(aliases)) {
    add(key, resolveAlias(baseUrl, key, value));
  }

  const choices = [...byIdentity.values()];
  const seen = new Set();
  for (const choice of choices) {
    if (!seen.has(choice.key)) {
      seen.add(choice.key);
      continue;
    }
    const suffix = choice.databaseName || choice.url;
    choice.key = `${choice.key} (${suffix})`;
    seen.add(choice.key);
  }
  choices.sort((left, right) => {
    const leftCurrent = sameDatabase(left.url, baseUrl) ? 0 : 1;
    const rightCurrent = sameDatabase(right.url, baseUrl) ? 0 : 1;
    if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;
    return left.key.localeCompare(right.key);
  });
  return choices;
}

export function resolveAnswer(answer, choices, baseUrl) {
  const trimmed = answer.trim();
  if (!trimmed) return { type: 'keep' };
  if (/^\d+$/.test(trimmed)) {
    const choice = choices[Number(trimmed) - 1];
    if (!choice) return { type: 'invalid', message: `There is no database number ${trimmed}.` };
    return { type: 'use', url: choice.url };
  }
  const folded = trimmed.toLowerCase();
  const byKey = choices.find((choice) => choice.key.toLowerCase() === folded);
  if (byKey) return { type: 'use', url: byKey.url };
  const byName = choices.find((choice) => choice.databaseName?.toLowerCase() === folded);
  if (byName) return { type: 'use', url: byName.url };
  if (trimmed.startsWith('file:') || /^postgres(?:ql)?:\/\//i.test(trimmed)) {
    return { type: 'invalid', message: 'The PostgreSQL server stays as it is. Type a database name on that server.' };
  }
  if (RESERVED_NAMES.has(folded)) {
    return { type: 'invalid', message: `"${trimmed}" is a PostgreSQL system database.` };
  }
  if (SAFE_NAME.test(trimmed)) {
    if (!isPostgres(baseUrl)) {
      return { type: 'invalid', message: 'Type a number or a full database URL. The current database is not PostgreSQL, so a bare name has no server to attach to.' };
    }
    return { type: 'create', name: trimmed, url: replaceDatabaseName(baseUrl, trimmed) };
  }
  return { type: 'invalid', message: 'Type a number, a listed name, or a new database name made of letters, numbers, hyphens, and underscores.' };
}

// Prisma uses ?schema=public. libpq rejects that parameter, so psql gets the bare URL.
function libpqUrl(databaseUrl) {
  return databaseUrl.replace(/\?.*$/, '');
}

function psql(url, args) {
  try {
    return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error.stderr?.toString?.().trim();
    const message = stderr || 'psql failed';
    const safe = message.split('\n').filter((line) => !line.includes('://')).join('\n').trim();
    throw new Error(safe || 'psql failed');
  }
}

export function listPostgresDatabases(baseUrl) {
  const adminUrl = libpqUrl(replaceDatabaseName(baseUrl, 'postgres'));
  const output = psql(adminUrl, ['-tA', '-c', "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres' ORDER BY datname"]);
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function ensurePostgresDatabase(baseUrl, name) {
  if (!SAFE_NAME.test(name) || RESERVED_NAMES.has(name.toLowerCase())) {
    throw new Error(`Cannot create database "${name}".`);
  }
  const adminUrl = libpqUrl(replaceDatabaseName(baseUrl, 'postgres'));
  const existing = psql(adminUrl, ['-tA', '-c', `SELECT 1 FROM pg_database WHERE datname = '${name}'`]).trim();
  if (existing === '1') return false;
  const owner = new URL(baseUrl).username;
  const ownerSql = owner && SAFE_NAME.test(owner) ? ` OWNER "${owner}"` : '';
  try {
    psql(adminUrl, ['-c', `CREATE DATABASE "${name}"${ownerSql}`]);
  } catch (error) {
    const message = error.message || '';
    if (/already exists/i.test(message)) return false;
    if (/permission denied|must be superuser|createdb/i.test(message)) {
      const ownerHint = owner && SAFE_NAME.test(owner) ? ` OWNER "${owner}"` : '';
      throw new Error(
        `Could not create database "${name}". The database role cannot create databases.\n\n` +
        `Create it as a superuser, then run npm run dev again:\n` +
        `  CREATE DATABASE "${name}"${ownerHint};`
      );
    }
    throw error;
  }
  return true;
}

function bin(name) {
  const candidates = [
    path.join(serverRoot, 'node_modules', '.bin', name),
    path.join(serverRoot, '..', 'node_modules', '.bin', name),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? name;
}

const ENSURE_CURRENT_SQL = `CREATE TABLE IF NOT EXISTS "LandscapeState" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceStateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LandscapeState_pkey" PRIMARY KEY ("id")
);
INSERT INTO "LandscapeState" ("id", "name", "createdAt", "updatedAt")
VALUES ('current', 'Current', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;`;

export function ensureCurrentLandscape(databaseUrl) {
  psql(libpqUrl(databaseUrl), ['-c', ENSURE_CURRENT_SQL]);
}

function assertDatabaseName(name) {
  if (!SAFE_NAME.test(name) || RESERVED_NAMES.has(name.toLowerCase())) {
    throw new Error(`"${name}" is not a database name. Use letters, numbers, hyphens, and underscores.`);
  }
}

export function rememberActiveDatabase(name) {
  fs.writeFileSync(activeDatabaseFile, `${name}\n`);
}

// Point the saved URL at another database on the same server, then tell a running dev server.
export function switchActiveDatabase(name) {
  const currentUrl = readDatabaseUrl();
  if (!isPostgres(currentUrl)) {
    throw new Error('The server in DATABASE_URL is not PostgreSQL, so its database cannot be switched.');
  }
  assertDatabaseName(name);
  const host = new URL(currentUrl).host;
  if (databaseName(currentUrl) === name) {
    rememberActiveDatabase(name);
    console.log(`Database is already ${name} on ${host}.`);
    return currentUrl;
  }
  const names = listPostgresDatabases(currentUrl);
  if (!names.includes(name)) {
    if (ensurePostgresDatabase(currentUrl, name)) console.log(`Created database ${name} on ${host}.`);
  }
  const nextUrl = replaceDatabaseName(currentUrl, name);
  if (new URL(nextUrl).host !== host) {
    throw new Error('Switching database must keep the same PostgreSQL server.');
  }
  console.log(`Preparing database ${name} on ${host}...`);
  ensureCurrentLandscape(nextUrl);
  const push = spawnSync(bin('prisma'), ['db', 'push', '--skip-generate'], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: nextUrl },
  });
  if (push.status !== 0) throw new Error(`Could not prepare database ${name}.`);
  const seed = spawnSync(bin('tsx'), ['src/seed.ts'], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: nextUrl },
  });
  if (seed.status !== 0) throw new Error(`Could not seed database ${name}.`);
  writeDatabaseUrl(nextUrl);
  rememberActiveDatabase(name);
  console.log(`Active database is ${name} on ${host}.`);
  return nextUrl;
}

function printHelp() {
  console.log(`Usage: npm run dev -- [database] [--select] [--no-select]

  npm run dev                 choose a database, then start the API
  npm run dev -- openea       use that database without asking
  npm run dev -- --no-select  keep the database already in server/.env

A number or name chooses a database on the same PostgreSQL server.
A new name creates one when the database role is allowed to.
A file: path or a postgres URL uses that database directly.
Extra names can live in server/databases.json.`);
}

function parseArgs(argv) {
  let requested = process.env.OPENEA_DB?.trim() || '';
  let prompt = Boolean(process.stdin.isTTY && process.stdout.isTTY && !requested);
  const args = argv.filter((arg) => arg !== '--');
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--no-select' || arg === '--yes') {
      prompt = false;
      continue;
    }
    if (arg === '--select') {
      prompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
      continue;
    }
    if (requested && requested !== arg) {
      console.error(`Unexpected extra argument "${arg}".`);
      console.error('Pass one database name. Run npm run dev -- --help for usage.');
      process.exit(1);
    }
    requested = arg;
    prompt = false;
  }
  return { requested, prompt };
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function printMenu(choices, baseUrl) {
  console.log('');
  console.log('Which database should this dev server use?');
  console.log('');
  const width = String(choices.length).length;
  choices.forEach((choice, index) => {
    const number = String(index + 1).padStart(width, ' ');
    const notes = [];
    if (sameDatabase(choice.url, baseUrl)) notes.push('current');
    if (choice.detail) notes.push(choice.detail);
    const suffix = notes.length ? `    ${notes.join('    ')}` : '';
    console.log(`  ${number}) ${choice.key}${suffix}`);
  });
  console.log('');
  const current = choices.find((choice) => sameDatabase(choice.url, baseUrl));
  console.log(`Press Enter to keep ${current?.key || databaseLabel(baseUrl)}, or type a number or a name.`);
  if (isPostgres(baseUrl)) {
    console.log('A new name creates a database on this PostgreSQL server.');
  }
}

// Returns the connection URL npm run dev should use. May create a database.
export async function chooseDatabase(argv) {
  const { requested, prompt } = parseArgs(argv);
  const baseUrl = readDatabaseUrl();
  let aliases;
  try {
    aliases = loadAliases();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  let liveNames = [];
  if (isPostgres(baseUrl)) {
    try {
      liveNames = listPostgresDatabases(baseUrl);
    } catch (error) {
      console.error('Could not list databases on this PostgreSQL server.');
      console.error(error.message);
    }
  }
  const choices = buildChoices(baseUrl, liveNames, aliases);

  const finish = (resolved) => {
    if (resolved.type === 'keep') return baseUrl;
    if (resolved.type === 'invalid') {
      console.error(resolved.message);
      process.exit(1);
    }
    if (resolved.type === 'create') {
      try {
        const created = ensurePostgresDatabase(baseUrl, resolved.name);
        if (created) console.log(`Created database ${resolved.name}.`);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
    return resolved.url;
  };

  if (!prompt) {
    if (!requested) return baseUrl;
    return finish(resolveAnswer(requested, choices, baseUrl));
  }

  printMenu(choices, baseUrl);
  for (;;) {
    const answer = (await ask('> ')).trim();
    const resolved = answer ? resolveAnswer(answer, choices, baseUrl) : { type: 'keep' };
    if (resolved.type === 'invalid') {
      console.log(resolved.message);
      continue;
    }
    return finish(resolved);
  }
}
