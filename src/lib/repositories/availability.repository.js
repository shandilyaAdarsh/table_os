import { resolveApiBaseUrl } from '../apiClient';

const API_BASE_URL = resolveApiBaseUrl();

export class AvailabilityRepository {
  /**
   * Fetches the runtime availability overlay for a branch menu.
   * @param {Object} params - The parameters
   * @param {string} params.tenantSlug - The tenant slug
   * @param {string} params.tenantId - The tenant ID
   * @param {string} params.branchId - The branch ID
   * @returns {Promise<Object>} - The overlay data
   */
  static async fetchAvailabilityOverlay({ tenantSlug, tenantId, branchId }) {
    try {
      const url = new URL(`${API_BASE_URL}/api/v1/public/branches/${branchId}/menu-availability`);
      if (tenantSlug) url.searchParams.append('tenant_slug', tenantSlug);
      if (tenantId) url.searchParams.append('tenant_id', tenantId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch availability overlay: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'API returned failure payload');
      }

      return json.data;
    } catch (error) {
      console.error('[AvailabilityRepository] Error fetching overlay:', error);
      throw error;
    }
  }
}
