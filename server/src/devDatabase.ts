import fs from 'node:fs';
import { switchDatabase } from './landscape.js';

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,62}$/;

function urlForDatabase(serverUrl: string, name: string) {
  const pattern = /^((?:postgres(?:ql)?:\/\/)[^/]*\/)[^/?]*/;
  if (!pattern.test(serverUrl)) throw new Error('DATABASE_URL is not a PostgreSQL server URL.');
  return serverUrl.replace(pattern, `$1${name}`);
}

// Follow server/.active-database so npm run db can change the database without restarting.
export function watchDevDatabase() {
  const file = process.env.OPENEA_DATABASE_FILE;
  const serverUrl = process.env.DATABASE_URL || '';
  if (!file || !serverUrl.startsWith('postgres')) return;

  let current = '';
  try {
    current = fs.readFileSync(file, 'utf8').trim();
  } catch {
    current = '';
  }

  const apply = async () => {
    let name = '';
    try {
      name = fs.readFileSync(file, 'utf8').trim();
    } catch {
      return;
    }
    if (!name || name === current) return;
    if (!SAFE_NAME.test(name)) {
      console.error(`Cannot switch to "${name}". Use a database name on this PostgreSQL server.`);
      return;
    }
    const previous = current;
    current = name;
    try {
      const url = urlForDatabase(serverUrl, name);
      await switchDatabase(url);
      process.env.DATABASE_URL = url;
      console.log(`Database is now ${name}`);
    } catch (error) {
      current = previous;
      console.error(error instanceof Error ? error.message : 'Database switch failed.');
    }
  };

  const watcher = fs.watch(file, () => {
    void apply();
  });
  watcher.unref();
}
