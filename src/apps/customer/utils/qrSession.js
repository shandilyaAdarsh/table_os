/**
 * QR scan session keys (set by TableQrLanding, read by menu + cart).
 */

export function setQrSession({
  tenant_id,
  branch_id,
  table_id,
  table_name,
  restaurant_name,
}) {
  if (tenant_id) sessionStorage.setItem('qr_tenant_id', tenant_id);
  if (branch_id) sessionStorage.setItem('qr_branch_id', branch_id);
  if (table_id) sessionStorage.setItem('qr_table_id', table_id);
  if (table_name) sessionStorage.setItem('qr_table_name', table_name);
  if (restaurant_name) sessionStorage.setItem('qr_restaurant_name', restaurant_name);

  localStorage.setItem(
    'orderlli_qr_context',
    JSON.stringify({
      tenant_id,
      branch_id,
      table_id,
      table_name,
      restaurant_name,
    }),
  );
  if (table_name) {
    localStorage.setItem('tableNum', table_name);
    sessionStorage.setItem('tableNum', table_name);
  }
}

export function getQrSession(searchParams) {
  const tenantId =
    searchParams?.get('tenantId') || sessionStorage.getItem('qr_tenant_id');
  const branchId =
    searchParams?.get('branchId') || sessionStorage.getItem('qr_branch_id');
  const tableId =
    searchParams?.get('tableId') || sessionStorage.getItem('qr_table_id');
  const tableName = sessionStorage.getItem('qr_table_name');
  const restaurantName = sessionStorage.getItem('qr_restaurant_name');

  return { tenantId, branchId, tableId, tableName, restaurantName };
}
