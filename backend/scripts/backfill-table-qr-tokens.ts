/**
 * Backfill qr_token + qr_url for tables missing them.
 * Run: npx tsx scripts/backfill-table-qr-tokens.ts
 */

import 'dotenv/config';
import { supabaseAdmin } from '../src/config/supabase';
import {
  buildTableQrUrl,
  generateTableToken,
} from '../src/modules/tables/qr/table-qr-token.util';

async function main() {
  const { data: tables, error } = await supabaseAdmin
    .from('tables')
    .select('id, tenant_id, branch_id, qr_token')
    .is('deleted_at', null);

  if (error) {
    console.error('Failed to list tables:', error.message);
    process.exit(1);
  }

  let updated = 0;
  for (const table of tables ?? []) {
    const token = generateTableToken(table.id, table.tenant_id, table.branch_id);
    const qr_url = buildTableQrUrl(token);
    const { error: updateError } = await supabaseAdmin
      .from('tables')
      .update({ qr_token: token, qr_url })
      .eq('id', table.id);

    if (updateError) {
      console.error(`Table ${table.id}:`, updateError.message);
      continue;
    }
    updated++;
  }

  console.log(`Backfilled QR credentials for ${updated} table(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
