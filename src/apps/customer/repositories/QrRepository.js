import { fetchPublicApi } from '../../../lib/apiClient';

export class QrRepository {
  /**
   * Fetches the QR token resolution payload from the backend.
   * Exposes raw fetch errors and HTTP status codes to be handled by the service layer.
   */
  static async resolvePublicToken(token) {
    const endpoint = `/api/v1/public/table/${encodeURIComponent(token)}`;
    
    // fetchPublicApi automatically resolves API_BASE_URL and enforces headers
    const response = await fetchPublicApi(endpoint, {
      method: 'GET'
    });

    return response;
  }
}
