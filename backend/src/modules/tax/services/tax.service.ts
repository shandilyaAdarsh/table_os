import type { TaxRepository } from '../repositories/tax.repository';
import type {
  TaxProfile,
  TaxRate,
  MenuItemTaxProfile,
  ResolvedTaxRPC,
  ResolvedTaxBatchRPC
} from '../tax.types';
import type {
  CreateTaxProfileDTO,
  UpdateTaxProfileDTO,
  CreateTaxRateDTO,
  AssignMenuItemTaxProfileDTO
} from '../tax.dtos';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';

export class TaxService {
  constructor(private readonly taxRepository: TaxRepository) {}

  // ─── Profiles ─────────────────────────────────────────────────

  async createProfile(tenantId: string, userId: string, payload: CreateTaxProfileDTO): Promise<TaxProfile> {
    return this.taxRepository.createProfile(tenantId, userId, payload);
  }

  async listProfiles(tenantId: string, includeDeleted: boolean = false): Promise<TaxProfile[]> {
    return this.taxRepository.getProfiles(tenantId, includeDeleted);
  }

  async getProfile(tenantId: string, id: string): Promise<TaxProfile> {
    return this.taxRepository.getProfileById(tenantId, id);
  }

  async updateProfile(tenantId: string, id: string, userId: string, payload: UpdateTaxProfileDTO): Promise<TaxProfile> {
    return this.taxRepository.updateProfile(tenantId, id, userId, payload);
  }

  async deleteProfile(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    await this.taxRepository.softDeleteProfile(tenantId, id, userId, versionNum);
  }

  // ─── Rates (Append-Only History) ──────────────────────────────

  /**
   * Modifying an existing tax rate involves appending a new one and ending the old one.
   * Direct updates are restricted by DB triggers except for is_active.
   */
  async appendRate(
    tenantId: string,
    userId: string,
    oldRateId: string | null,
    payload: CreateTaxRateDTO,
    oldVersionNum?: number,
  ): Promise<TaxRate> {
    // Append-only replace flow:
    //   1. Deactivate the existing rate (OCC protected by oldVersionNum)
    //   2. Insert the new rate as a fresh record
    // Direct mutation of immutable fields is blocked at the DB trigger level.
    if (oldRateId) {
      if (oldVersionNum === undefined) {
        throw new AppError(
          'oldVersionNum is required when replacing an existing tax rate.',
          400,
          ErrorCode.BAD_REQUEST,
        );
      }
      await this.taxRepository.deactivateRate(tenantId, oldRateId, userId, oldVersionNum);
    }
    return this.taxRepository.createRate(tenantId, userId, payload);
  }

  async getRate(tenantId: string, id: string): Promise<TaxRate> {
    return this.taxRepository.getRateById(tenantId, id);
  }

  async deactivateRate(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    await this.taxRepository.deactivateRate(tenantId, id, userId, versionNum);
  }

  // ─── Menu Item Mapping ────────────────────────────────────────

  async assignProfileToMenuItem(tenantId: string, userId: string, payload: AssignMenuItemTaxProfileDTO): Promise<MenuItemTaxProfile> {
    return this.taxRepository.assignMenuItemProfile(tenantId, userId, payload);
  }

  // ─── Resolution & Math ────────────────────────────────────────

  async resolveTax(tenantId: string, menuItemId: string, effectiveAt: string = new Date().toISOString()): Promise<ResolvedTaxRPC | null> {
    return this.taxRepository.resolveTax(tenantId, menuItemId, effectiveAt);
  }

  async resolveBatchTax(tenantId: string, menuItemIds: string[], effectiveAt: string = new Date().toISOString()): Promise<ResolvedTaxBatchRPC[]> {
    return this.taxRepository.resolveBatchTax(tenantId, menuItemIds, effectiveAt);
  }

  /**
   * Calculate inclusive base price and tax amount using integer math
   * Base Price = (Total * 10000) / (10000 + RateBP)
   * Tax Amount = Total - Base Price
   * @param totalMinor Total price in minor units (e.g. cents)
   * @param rateBasisPoints Rate in basis points (e.g. 500 = 5%)
   */
  calculateInclusiveTax(totalMinor: number, rateBasisPoints: number): { baseAmount: number, taxAmount: number } {
    if (rateBasisPoints === 0) return { baseAmount: totalMinor, taxAmount: 0 };
    // We use Math.round for nearest integer matching typical financial rounding
    const baseAmount = Math.round((totalMinor * 10000) / (10000 + rateBasisPoints));
    const taxAmount = totalMinor - baseAmount;
    return { baseAmount, taxAmount };
  }

  /**
   * Calculate exclusive tax amount using integer math
   * Tax Amount = (Base * RateBP) / 10000
   * Total = Base + Tax Amount
   * @param baseAmount Base price in minor units (e.g. cents)
   * @param rateBasisPoints Rate in basis points (e.g. 500 = 5%)
   */
  calculateExclusiveTax(baseAmount: number, rateBasisPoints: number): { totalAmount: number, taxAmount: number } {
    if (rateBasisPoints === 0) return { totalAmount: baseAmount, taxAmount: 0 };
    const taxAmount = Math.round((baseAmount * rateBasisPoints) / 10000);
    const totalAmount = baseAmount + taxAmount;
    return { totalAmount, taxAmount };
  }
}
