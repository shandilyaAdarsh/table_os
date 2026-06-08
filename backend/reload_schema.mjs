import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Reloaded PGRST schema cache');
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%kds%' OR table_name LIKE '%terminal%' OR table_name LIKE '%device%';");
    console.log('KDS Tables:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
