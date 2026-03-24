import { Router } from 'express';
import {
  handleAuthSession,
  handleAuthSignup,
  handleAuthLogin,
  handleAuthLogout,
  handleForgotPassword,
  handleResetPassword,
  handleGetAuthProfile,
  handlePostAuthProfile,
} from '../authHandlers.js';

const router = Router();

router.get('/api/auth/session', handleAuthSession);
router.post('/api/auth/signup', handleAuthSignup);
router.post('/api/auth/login', handleAuthLogin);
router.post('/api/auth/logout', handleAuthLogout);
router.post('/api/auth/forgot-password', handleForgotPassword);
router.post('/api/auth/reset-password', handleResetPassword);
router.get('/api/auth/profile', handleGetAuthProfile);
router.post('/api/auth/profile', handlePostAuthProfile);

export default router;
