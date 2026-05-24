import { Router } from 'express';
import { getPublicMenuAvailability } from './public-availability.controller';

export const publicAvailabilityRouter: Router = Router();

publicAvailabilityRouter.get('/:branchId/menu-availability', getPublicMenuAvailability);
