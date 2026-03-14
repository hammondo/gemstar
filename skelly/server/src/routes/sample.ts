import { Router } from 'express';

const sampleRouter = Router();

sampleRouter.get('/', (_req, res) => {
  res.json({
    items: [
      { id: 'spine-001', label: 'Spine Segment' },
      { id: 'pelvis-002', label: 'Pelvis Anchor' },
      { id: 'femur-003', label: 'Femur Joint' }
    ],
    generatedAt: new Date().toISOString(),
  });
});

export default sampleRouter;
