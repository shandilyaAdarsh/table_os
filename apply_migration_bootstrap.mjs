import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

// We try DATABASE_URL first, or construct it if we have other env vars (though Supabase usually requires the connection string directly)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERROR: DATABASE_URL environment variable is missing.");
  console.error("Please export DATABASE_URL='postgres://postgres.[project]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres' before running this script.");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    console.log('Connected to database.');
    
    const sql = readFileSync('./supabase/migrations/20260608000000_bootstrap_optimization.sql', 'utf8');
    
    // We can't run CONCURRENTLY inside a transaction, so we just run the raw SQL
    await client.query(sql);
    
    console.log('✅ Migration applied successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
