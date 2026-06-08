import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERROR: DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    console.log('Connected to database.');
    
    const sql = readFileSync('../supabase/migrations/20260608000001_create_order_items_and_update_orchestrator.sql', 'utf8');
    
    await client.query(sql);
    
    console.log('✅ Migration applied successfully. order_items table created and RPC updated.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
