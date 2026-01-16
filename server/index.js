const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/database');
const geminiRoutes = require('./routes/gemini');
const userRoutes = require('./routes/users');
const mealPlanRoutes = require('./routes/mealPlans');
const shoppingListRoutes = require('./routes/shoppingLists');
const favoriteRoutes = require('./routes/favorites');
const telegramRoutes = require('./routes/telegram');
const recipeRoutes = require('./routes/recipes');
const adminLogRoutes = require('./routes/adminLogs');
const requestLogger = require('./middleware/requestLogger');
const { initializeTelegramBot } = require('./services/telegramBot');
const { initializeNotificationScheduler } = require('./services/notificationScheduler');

const app = express();
const PORT = process.env.PORT || 5002;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  // Use request IP directly so we can run behind proxies without enabling trust proxy globally
  keyGenerator: (req) => req.ip
});
app.use(limiter);

// Relaxed CSP to allow external images (e.g., Leonardo CDN) and APIs
app.use((req, res, next) => {
  const csp = [
    "default-src 'self'",
    // Allow Leonardo CDN, Drive public URLs, and SiliconFlow/S3 image URLs
    "img-src 'self' data: https: https://cdn.leonardo.ai https://*.leonardo.ai https://*.amazonaws.com https://*.r2.cloudflarestorage.com https://*.r2.dev",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "connect-src 'self' https: http:",
    "font-src 'self' data: https:",
    "frame-ancestors 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  next();
});

// CORS configuration
const allowAllOrigins = process.env.CORS_ALLOW_ALL === 'true';
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const normalizeOrigin = (origin) => origin?.replace(/\/$/, '');
const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowAllOrigins || !origin || normalizedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (persists to Mongo)
app.use(requestLogger);

// Connect to database
connectDB();

// Initialize Telegram bot (can be disabled via DISABLE_TELEGRAM_BOT=true)
if (process.env.DISABLE_TELEGRAM_BOT !== 'true') {
  initializeTelegramBot();
}

// Initialize notification scheduler
initializeNotificationScheduler();

// Routes
app.use('/api/gemini', geminiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meal-plans', mealPlanRoutes);
app.use('/api/shopping-lists', shoppingListRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/admin/logs', adminLogRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve React build
const path = require('path');
const buildPath = path.resolve(__dirname, '../frontend/dist');

// Serve locally cached meal images
const imagesPath = path.resolve(__dirname, '../public');
app.use(express.static(imagesPath));

app.use(express.static(buildPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
