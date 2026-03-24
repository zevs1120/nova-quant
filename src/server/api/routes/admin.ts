import { Router } from 'express';
import { handleAdminSession, handleAdminLogin, handleAdminLogout } from '../authHandlers.js';
import {
  handleAdminOverview,
  handleAdminUsers,
  handleAdminAlphas,
  handleAdminSignals,
  handleAdminSystem,
  handleAdminResearchOps,
} from '../adminHandlers.js';
import { handleModelSignalIngest, handleModelHeartbeat } from '../modelHandlers.js';

const router = Router();

router.get('/api/admin/session', handleAdminSession);
router.post('/api/admin/login', handleAdminLogin);
router.post('/api/admin/logout', handleAdminLogout);
router.get('/api/admin/overview', handleAdminOverview);
router.get('/api/admin/users', handleAdminUsers);
router.get('/api/admin/alphas', handleAdminAlphas);
router.get('/api/admin/signals', handleAdminSignals);
router.get('/api/admin/system', handleAdminSystem);
router.get('/api/admin/research-ops', handleAdminResearchOps);

router.post('/api/model/signals/ingest', handleModelSignalIngest);
router.post('/api/model/heartbeat', handleModelHeartbeat);

export default router;
