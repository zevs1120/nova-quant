import { Router } from 'express';
import {
  claimManualOnboardingBonus,
  claimManualReferral,
  completeManualReferralStage2,
  getManualDashboard,
  grantManualEngagementSignal,
  manualDailyCheckin,
  redeemManualVipDay,
  submitManualPredictionEntry,
} from '../../manual/service.js';
import { getRequestScope, requireAuthenticatedScope } from '../helpers.js';

const router = Router();

router.get('/api/manual/state', (req, res) => {
  const scope = getRequestScope(req);
  res.json(getManualDashboard(scope.userId));
});

router.post('/api/manual/rewards/redeem', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const body = req.body as { days?: number };
  const result = redeemManualVipDay({
    userId: scope.userId,
    days: body.days,
  });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/referrals/claim', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const body = req.body as { inviteCode?: string };
  const result = claimManualReferral({
    userId: scope.userId,
    inviteCode: String(body.inviteCode || ''),
  });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/predictions/entry', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const body = req.body as {
    marketId?: string;
    selectedOption?: string;
    pointsStaked?: number;
  };
  const result = submitManualPredictionEntry({
    userId: scope.userId,
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

router.post('/api/manual/bonuses/onboarding', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const result = claimManualOnboardingBonus({ userId: scope.userId });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/referrals/complete-stage2', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const result = completeManualReferralStage2({ userId: scope.userId });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/checkin', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const result = manualDailyCheckin({ userId: scope.userId });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/manual/engagement/signal', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  const result = grantManualEngagementSignal({ userId: scope.userId });
  if (!result.ok) {
    res.status(result.error === 'AUTH_REQUIRED' ? 401 : 400).json(result);
    return;
  }
  res.json(result);
});

export default router;
