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
  url      = env("DATABASE_URL")
}

`;

try {
  const baseContent = fs.readFileSync(BASE_SCHEMA, 'utf-8');
  fs.writeFileSync(OUTPUT_SCHEMA, header + baseContent);
  console.log('Successfully generated schema.prisma');

  console.log('Generating Prisma Client...');
  execSync('npx prisma generate', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

  console.log('Pushing database schema...');
  execSync('npx prisma db push', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

  console.log('Database setup complete!');
} catch (err) {
  console.error('Database setup failed:', err);
  process.exit(1);
}
