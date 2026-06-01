import { Router } from 'express';
import { AdminDashboardController } from './dashboard.admin.controller';

const router = Router();

router.patch('/dismiss-qr-banner', AdminDashboardController.dismissQrBanner);

export const adminDashboardRouter: Router = router;
