import { supabase } from '../../../lib/supabase.js';

export function useKitchenMutations() {
  return {
    markPreparing: async (order) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cooking' })
        .eq('id', order.id);
      if (error) throw error;
    },
    
    markReady: async (order) => {
      // Mark parent order as ready
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'ready' })
        .eq('id', order.id);
      if (orderError) throw orderError;

      // Also tick all items done
      const { error: itemsError } = await supabase
        .from('order_items')
        .update({ done: true, status: 'accepted' })
        .eq('order_id', order.id);
      if (itemsError) throw itemsError;
    },
    
    bumpOrder: async (order) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'served' })
        .eq('id', order.id);
      if (error) throw error;
    },

    recallTicket: async (order) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cooking' })
        .eq('id', order.id);
      if (error) throw error;
    },
  };
}
