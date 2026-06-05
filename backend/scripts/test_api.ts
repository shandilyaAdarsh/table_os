import { CreateStaffSchema, UpdateStaffSchema } from '../src/modules/staff/validators/staff.validators';

function test() {
  const payload = {
    'id': 'abc',
    'tenant_id': 'tenant',
    'name': 'test',
    'role': 'kitchen',
    'pin': '1234',
    'is_active': true,
    'employee_id': 'E123',
    'branch_id': null,
    'email': null
  };
  console.log('Create:', CreateStaffSchema.parse(payload));
  console.log('Update:', UpdateStaffSchema.parse(payload));
}
test();
