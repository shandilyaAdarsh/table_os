import { Router, type Router as ExpressRouter } from 'express';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffRepository } from './staff.repository';
import { supabaseAdmin } from '../../config/supabase';
import {
  authenticate,
  requireTenantAccess,
  requireMinRole,
} from '../../middleware/auth.middleware';
import { ROLES } from '../../types/rbac.types';

const router: ExpressRouter = Router({ mergeParams: true });

const staffRepository = new StaffRepository(supabaseAdmin);
const staffService = new StaffService(staffRepository);
const staffController = new StaffController(staffService);

// ─── Auth applied to all routes ───────────────────────────────
router.use(authenticate);
router.use(requireTenantAccess('tenantId'));

router.get('/', 
  requireMinRole(ROLES.MANAGER),
  staffController.list
);

router.get('/:id', 
  requireMinRole(ROLES.MANAGER),
  staffController.getById
);

router.post('/', 
  requireMinRole(ROLES.MANAGER),
  staffController.create
);

router.patch('/:id', 
  requireMinRole(ROLES.MANAGER),
  staffController.update
);

router.delete('/:id', 
  requireMinRole(ROLES.MANAGER),
  staffController.delete
);

export { router as staffRouter };
