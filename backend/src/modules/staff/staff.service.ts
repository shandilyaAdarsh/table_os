import type { StaffRepository } from './staff.repository';
import type { StaffResponse } from './staff.types';
import type { CreateStaffDTO, UpdateStaffDTO } from './staff.dtos';

export class StaffService {
  constructor(private readonly staffRepository: StaffRepository) {}

  async list(tenantId: string): Promise<StaffResponse[]> {
    return this.staffRepository.getStaff(tenantId);
  }

  async getById(tenantId: string, id: string): Promise<StaffResponse | null> {
    return this.staffRepository.getStaffById(tenantId, id);
  }

  async create(tenantId: string, payload: CreateStaffDTO): Promise<StaffResponse> {
    return this.staffRepository.createStaff(tenantId, payload);
  }

  async update(tenantId: string, id: string, payload: UpdateStaffDTO): Promise<StaffResponse> {
    return this.staffRepository.updateStaff(tenantId, id, payload);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    return this.staffRepository.deleteStaff(tenantId, id);
  }
}
