import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRISMA_DIR = path.join(__dirname, '../prisma');
const BASE_SCHEMA = path.join(PRISMA_DIR, 'schema.base.prisma');
const OUTPUT_SCHEMA = path.join(PRISMA_DIR, 'schema.prisma');

const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

console.log(`Setting up database for: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);

const provider = isPostgres ? 'postgresql' : 'sqlite';

const header = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${provider}"
  url      = "${databaseUrl}"
}

`;

try {
  const baseContent = fs.readFileSync(BASE_SCHEMA, 'utf-8');
  fs.writeFileSync(OUTPUT_SCHEMA, header + baseContent);
  console.log('Successfully generated schema.prisma');

  console.log('Generating Prisma Client...');
  execSync('npx prisma generate', { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  console.log('Pushing database schema...');
  try {
    execSync('npx prisma db push', { 
      cwd: path.join(__dirname, '..'), 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl }
    });
  } catch (err) {
    if (err.message && err.message.includes('permission denied to create database')) {
      console.error('\n❌ ERROR: Prisma tried to create the database but failed due to missing permissions.');
      console.error('This usually means the database specified in your DATABASE_URL does not exist yet, or there is a typo in the name.');
      console.error('\nAction required:');
      console.error('1. Double-check your .env file for typos in the DATABASE_URL.');
      console.error('2. Ensure the database actually exists in your PostgreSQL instance.');
      console.error('3. If the database exists, ensure your user has full privileges on it.\n');
    } else if (err.message && err.message.includes('permission denied for schema public')) {
      console.error('\n❌ ERROR: Permission denied for schema "public".');
      console.error('Your PostgreSQL user does not have permission to create tables in the public schema.');
      console.error('\nAction required:');
      console.error('Run the following SQL command as a superuser (e.g., using psql or pgAdmin) on your "openea" database:');
      console.error('GRANT ALL ON SCHEMA public TO <your_user>;');
      console.error('\nNote: Replace <your_user> with the username defined in your DATABASE_URL.\n');
    }
    throw err;
  }

  console.log('Initializing standard metamodel (picklists and scores)...');
  execSync('npx tsx src/seed.ts', { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  console.log('Database setup complete!');
} catch (err) {
  console.error('Database setup failed:', err);
  process.exit(1);
}
