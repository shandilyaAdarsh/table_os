import { Router } from 'express';
import { getDailySummary } from './analytics.controller';
import { authenticate } from '../../middleware/auth.middleware';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

analyticsRouter.get('/daily', getDailySummary);
