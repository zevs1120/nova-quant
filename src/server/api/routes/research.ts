import { Router } from 'express';
import researchFactorsRouter from './research/researchFactorsRoute.js';
import researchReportsRouter from './research/researchReportsRoute.js';

const router = Router();
router.use(researchFactorsRouter);
router.use(researchReportsRouter);

export default router;
