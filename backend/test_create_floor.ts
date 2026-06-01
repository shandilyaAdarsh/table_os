import { createFloor } from './src/modules/tables/repositories/table-floor.repository';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config();

async function run() {
  try {
    console.log('Testing createFloor...');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
    const res = await createFloor(
      '6e05968f-9bb5-4af9-a670-40f3580f5ba7', // Royal Tandoor tenant
      {
        branch_id: '6e6361ed-4c4c-403d-a91f-f076342791b4', // Royal Tandoor branch
        name: 'Test Floor 1',
        sort_order: 0,
      },
      'system'
    );
    console.log('Success!', res);
  } catch (err) {
    console.error('Error!', err);
  }
}

run();
