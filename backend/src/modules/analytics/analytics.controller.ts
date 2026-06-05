import { Response, NextFunction } from 'express';
import { getDailyAnalytics } from './analytics.repository';

export async function getDailySummary(req: any, res: Response, next: NextFunction) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || req.context?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ success: false, error: { message: 'Missing tenant context.' } });
      return;
    }
    const { date, branchId } = req.query;

    if (!date || typeof date !== 'string') {
      res.status(400).json({ success: false, error: { message: 'Missing or invalid date parameter' } });
      return;
    }

    const data = await getDailyAnalytics(tenantId, date, branchId as string | undefined);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}
