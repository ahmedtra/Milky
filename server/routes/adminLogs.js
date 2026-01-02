const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

// GET /api/admin/logs?limit=100
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logs = await Log.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ logs });
  } catch (err) {
    console.error('Admin logs error:', err);
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

module.exports = router;
