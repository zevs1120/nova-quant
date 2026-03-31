import { Router } from 'express';
import { getMembershipState } from '../../membership/service.js';
import { getRequestScope } from '../helpers.js';

const router = Router();

router.get('/api/membership/state', (req, res) => {
  const scope = getRequestScope(req);
  res.json(
    getMembershipState({
      userId: scope.userId,
    }),
  );
});

export default router;
