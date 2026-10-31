import { createInterface } from 'node:readline/promises';
import {
  databaseName,
  listPostgresDatabases,
  readDatabaseUrl,
  switchActiveDatabase,
} from './databases.mjs';

const requested = process.argv.slice(2).filter((arg) => arg !== '--')[0];
if (requested) {
  try {
    switchActiveDatabase(requested);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.exit(0);
}

const currentUrl = readDatabaseUrl();
const host = new URL(currentUrl).host;
const current = databaseName(currentUrl);
const names = listPostgresDatabases(currentUrl);
console.log(`PostgreSQL server ${host}`);
console.log('');
names.forEach((name, index) => {
  console.log(`  ${index + 1}) ${name}${name === current ? '    current' : ''}`);
});
console.log('');
console.log('Type a number or a database name. The server stays the same.');

const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const answer = (await rl.question('Database: ')).trim();
  if (!answer) process.exit(0);
  const picked = /^\d+$/.test(answer) ? names[Number(answer) - 1] : answer;
  if (!picked) {
    console.error(`There is no database number ${answer}.`);
    process.exit(1);
  }
  switchActiveDatabase(picked);
} catch (error) {
  console.error(error.message);
  process.exit(1);
} finally {
  rl.close();
}
