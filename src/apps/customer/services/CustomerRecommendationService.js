import { CustomerRecommendationRepository } from '../repositories/CustomerRecommendationRepository';

/**
 * Analytics event types for recommendation tracking (Point 6).
 * These fire-and-forget calls allow future wiring to any analytics backend
 * (Mixpanel, PostHog, internal event stream) without changing calling code.
 */
const RecommendationAnalytics = {
  /** Fired when recommendations are rendered in the cart drawer */
  trackImpression(recommendations) {
    try {
      if (!recommendations || recommendations.length === 0) return;
      console.debug('[RecommendationAnalytics] impression', {
        count: recommendations.length,
        itemIds: recommendations.map(r => r.id),
        types: recommendations.map(r => r.recommendation_type),
        timestamp: Date.now(),
      });
      // TODO: Wire to analytics backend
      // analyticsClient.track('recommendation_impression', { ... });
    } catch (_) { /* fire-and-forget */ }
  },

  /** Fired when a user taps + on a recommended item */
  trackClick(recommendation) {
    try {
      console.debug('[RecommendationAnalytics] click', {
        itemId: recommendation.id,
        itemName: recommendation.name,
        type: recommendation.recommendation_type,
        price: recommendation.effective_price,
        timestamp: Date.now(),
      });
      // TODO: Wire to analytics backend
      // analyticsClient.track('recommendation_click', { ... });
    } catch (_) { /* fire-and-forget */ }
  },

  /** Fired when a recommended item is confirmed as part of a placed order */
  trackConversionToCart(recommendation) {
    try {
      console.debug('[RecommendationAnalytics] conversion_to_cart', {
        itemId: recommendation.id,
        type: recommendation.recommendation_type,
        timestamp: Date.now(),
      });
      // TODO: Wire to analytics backend
    } catch (_) { /* fire-and-forget */ }
  },

  /** Fired post-order if the order contains recommended items */
  trackConversionToOrder(recommendedItemIds, orderId) {
    try {
      console.debug('[RecommendationAnalytics] conversion_to_order', {
        recommendedItemIds,
        orderId,
        timestamp: Date.now(),
      });
      // TODO: Wire to analytics backend
    } catch (_) { /* fire-and-forget */ }
  },
};

export const CustomerRecommendationService = {
  /**
   * Resolves recommendations for a given list of cart items.
   * @param {Array<{id: string}>} cartItems 
   * @param {number} limit 
   * @returns {Promise<any[]>}
   */
  async getRecommendations(cartItems, limit = 5) {
    if (!cartItems || cartItems.length === 0) return [];
    
    // Extract unique item IDs from the cart
    const cartItemIds = [...new Set(cartItems.map(item => item.id))];
    
    // Fetch deterministic recommendations from the backend
    const recommendations = await CustomerRecommendationRepository.fetchCartRecommendations(cartItemIds, limit);

    // Point 6: Track impressions (fire-and-forget)
    RecommendationAnalytics.trackImpression(recommendations);

    return recommendations;
  },

  /** Expose analytics for use in CartDrawer when user taps + */
  trackRecommendationClick(recommendation) {
    RecommendationAnalytics.trackClick(recommendation);
    RecommendationAnalytics.trackConversionToCart(recommendation);
  },

  /** Call after order placement with recommended item IDs */
  trackOrderConversion(recommendedItemIds, orderId) {
    RecommendationAnalytics.trackConversionToOrder(recommendedItemIds, orderId);
  },
};
