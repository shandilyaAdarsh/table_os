import { CustomerRepository } from './customer.repository';
import { AppError } from '../../shared/errors/AppError';

export class CustomerService {
  static async getGuestOrderConfirmation(orderId: string, tenantId: string, tableId: string) {
    if (!orderId || !tenantId || !tableId) {
      throw new AppError('Missing required parameters for order lookup', 400, 'BAD_REQUEST');
    }

    const order = await CustomerRepository.getGuestOrder(orderId, tenantId, tableId);

    if (!order) {
      throw new AppError('Order could not be located or is no longer available.', 404, 'ORDER_NOT_FOUND');
    }

    return order;
  }
}
