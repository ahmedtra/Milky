const Log = require('../models/Log');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', async () => {
    try {
      const duration = Date.now() - start;
      const entry = new Log({
        level: res.statusCode >= 500 ? 'error' : 'info',
        message: `${req.method} ${req.originalUrl}`,
        userId: req.user?._id || null,
        meta: {
          userEmail: req.user?.email,
          userName: req.user?.username,
          status: res.statusCode,
          durationMs: duration,
          method: req.method,
          path: req.originalUrl
        }
      });
      await entry.save();
    } catch (err) {
      // Avoid crashing on log failure
      console.warn('Request logger failed to persist log:', err.message);
    }
  });
  next();
};

module.exports = requestLogger;
