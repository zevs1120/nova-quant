import { Router } from 'express';
import {
  claimManualReferral,
  getManualDashboard,
  redeemManualVipDay,
  submitManualPredictionEntry,
} from '../../manual/service.js';

const router = Router();

router.get('/api/manual/state', (req, res) => {
  const userId = (req.query.userId as string | undefined) || '';
  res.json(getManualDashboard(userId));
});

router.post('/api/manual/rewards/redeem', (req, res) => {
  const body = req.body as { userId?: string; days?: number };
  const result = redeemManualVipDay({
    userId: String(body.userId || ''),
    days: body.days,
  });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/referrals/claim', (req, res) => {
  const body = req.body as { userId?: string; inviteCode?: string };
  const result = claimManualReferral({
    userId: String(body.userId || ''),
    inviteCode: String(body.inviteCode || ''),
  });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/predictions/entry', (req, res) => {
  const body = req.body as {
    userId?: string;
    marketId?: string;
    selectedOption?: string;
    pointsStaked?: number;
  };
  const result = submitManualPredictionEntry({
    userId: String(body.userId || ''),
    marketId: String(body.marketId || ''),
    selectedOption: String(body.selectedOption || ''),
    pointsStaked: body.pointsStaked,
  });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

export default router;
