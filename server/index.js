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
const telegramRoutes = require('./routes/telegram');
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

// Connect to database
connectDB();

// Initialize Telegram bot
initializeTelegramBot();

// Initialize notification scheduler
initializeNotificationScheduler();

// Routes
app.use('/api/gemini', geminiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meal-plans', mealPlanRoutes);
app.use('/api/shopping-lists', shoppingListRoutes);
app.use('/api/telegram', telegramRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve React build
const path = require('path');
const buildPath = path.resolve(__dirname, '../client/build');

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
