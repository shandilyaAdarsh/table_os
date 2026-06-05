import { Router, Request, Response } from 'express';

export const adminDashboardRouter = Router({ mergeParams: true });

// Mock endpoint to dismiss QR banner to satisfy frontend dashboard load requirements
adminDashboardRouter.patch('/dismiss-qr-banner', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'QR banner dismissed successfully'
  });
});
