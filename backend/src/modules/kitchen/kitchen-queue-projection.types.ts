// ============================================================
// src/modules/kitchen/kitchen-queue-projection.types.ts
// Domain interfaces for active kitchen queue read-model projections.
// ============================================================

export interface ActiveItemPrepProjection {
  preparationId: string;
  itemId: string;
  name: string;
  quantity: number;
  completedQuantity: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  notes: string | null;
  modifiers: string | null;
  stationId: string | null;
  stationName: string | null;
  preparedAt: string | null;
  completedAt: string | null;
}

export interface ActiveKitchenOrderProjection {
  ticketId: string;
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivered';
  priority: number;
  estimatedPrepSeconds: number;
  elapsedSeconds: number;
  isOverdue: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: ActiveItemPrepProjection[];
  metrics: {
    totalItems: number;
    completedItems: number;
    prepProgressPercentage: number;
  };
}
