const Log = require('../models/Log');

const logEvent = async ({ level = 'info', message, user = null, meta = {} }) => {
  try {
    const entry = new Log({
      level,
      message,
      userId: user?._id || null,
      meta: {
        userEmail: user?.email,
        userName: user?.username,
        ...meta
      }
    });
    await entry.save();
  } catch (err) {
    // Fail silently to avoid breaking flow
    console.warn('Log persist error:', err.message);
  }
};

module.exports = { logEvent };
