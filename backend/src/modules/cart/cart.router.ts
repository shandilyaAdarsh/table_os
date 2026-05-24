// ============================================================
// src/modules/cart/cart.router.ts
// Router for public customer Cart operations.
// ============================================================

import { Router } from 'express';
import { requireQrSession } from '../qr/qr.middleware';
import { getCart, addItem, updateItem, removeItem, updateNotes } from './cart.controller';
import { requireMutationEnvelope } from '../../middleware/mutation.middleware';

const router: Router = Router({ mergeParams: true });

// All cart routes require a valid active QR session token
router.use(requireQrSession);
// Mutating cart routes require a strict MutationEnvelope
router.use(requireMutationEnvelope());

router.get('/', getCart);
router.post('/items', addItem);
router.patch('/items/:itemId', updateItem);
router.delete('/items/:itemId', removeItem);
router.patch('/notes', updateNotes);

export { router as cartRouter };
