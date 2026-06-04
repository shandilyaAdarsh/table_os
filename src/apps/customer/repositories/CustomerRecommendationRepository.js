import { getQrSession } from '../utils/qrSession';
import { resolveApiBaseUrl } from '../../../lib/apiClient';

const API_BASE_URL = resolveApiBaseUrl();

export const CustomerRecommendationRepository = {
  /**
   * Fetches deterministic cart recommendations from the backend.
   * @param {string[]} cartItemIds 
   * @param {number} limit 
   * @returns {Promise<any[]>}
   */
  async fetchCartRecommendations(cartItemIds, limit = 5) {
    if (!cartItemIds || cartItemIds.length === 0) return [];

    const { tenantId, branchId } = getQrSession();
    if (!tenantId) {
      console.warn('[CustomerRecommendationRepository] Missing tenantId in QR session');
      return [];
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/customer/cart/recommendations?tenantId=${tenantId}${branchId ? `&branchId=${branchId}` : ''}`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart_item_ids: cartItemIds, limit })
        }
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data?.data?.recommendations || [];
    } catch (error) {
      console.error('[CustomerRecommendationRepository] Error fetching recommendations:', error);
      return [];
    }
  }
};
