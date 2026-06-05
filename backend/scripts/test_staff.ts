import { StaffService } from '../src/modules/staff/services/staff.service';
import { supabaseAdmin } from '../src/config/supabase';

async function main() {
  try {
    const tenantId = '0644b7ff-c5a5-4c1d-9a95-de22915e37f9';
    const result = await StaffService.listStaff(supabaseAdmin, tenantId);
    console.log('Staff list:', result);
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}
main();
