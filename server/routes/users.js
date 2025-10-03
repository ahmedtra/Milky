const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, preferences = {} } = req.body;

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedUsername = username?.trim();

    if (!normalizedEmail || !normalizedUsername || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === normalizedEmail ? 'Email already registered' : 'Username already taken'
      });
    }

    // Create new user
    const user = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      preferences: {
        dietType: preferences.dietType || 'balanced',
        allergies: preferences.allergies || [],
        dislikedFoods: preferences.dislikedFoods || [],
        mealTimes: preferences.mealTimes || {
          breakfast: '08:00',
          lunch: '13:00',
          dinner: '19:00'
        },
        notificationSettings: preferences.notificationSettings || {
          enabled: true,
          timeBeforeMeal: 120
        }
      },
      profile: preferences.profile || {}
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferences: user.preferences,
        profile: user.profile,
        telegramChatId: user.telegramChatId
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      const message = duplicateField === 'email'
        ? 'Email already registered'
        : duplicateField === 'username'
          ? 'Username already taken'
          : 'Duplicate value provided';
      return res.status(400).json({ message });
    }

    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferences: user.preferences,
        profile: user.profile,
        telegramChatId: user.telegramChatId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        preferences: req.user.preferences,
        profile: req.user.profile,
        telegramChatId: req.user.telegramChatId
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user preferences
router.put('/preferences', auth, async (req, res) => {
  try {
    const { preferences } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update preferences
    if (preferences.dietType) user.preferences.dietType = preferences.dietType;
    if (preferences.allergies) user.preferences.allergies = preferences.allergies;
    if (preferences.dislikedFoods) user.preferences.dislikedFoods = preferences.dislikedFoods;
    if (preferences.mealTimes) user.preferences.mealTimes = preferences.mealTimes;
    if (preferences.notificationSettings) user.preferences.notificationSettings = preferences.notificationSettings;

    await user.save();

    res.json({
      message: 'Preferences updated successfully',
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ message: 'Server error updating preferences' });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { profile } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update profile
    if (profile.age) user.profile.age = profile.age;
    if (profile.weight) user.profile.weight = profile.weight;
    if (profile.height) user.profile.height = profile.height;
    if (profile.activityLevel) user.profile.activityLevel = profile.activityLevel;
    if (profile.goals) user.profile.goals = profile.goals;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      profile: user.profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Link Telegram account
router.post('/link-telegram', auth, async (req, res) => {
  try {
    const { telegramChatId, telegramUsername } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.telegramChatId = telegramChatId;
    user.telegramUsername = telegramUsername;

    await user.save();

    res.json({
      message: 'Telegram account linked successfully',
      telegramChatId: user.telegramChatId,
      telegramUsername: user.telegramUsername
    });
  } catch (error) {
    console.error('Link Telegram error:', error);
    res.status(500).json({ message: 'Server error linking Telegram account' });
  }
});

// Unlink Telegram account
router.delete('/unlink-telegram', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.telegramChatId = null;
    user.telegramUsername = null;

    await user.save();

    res.json({
      message: 'Telegram account unlinked successfully'
    });
  } catch (error) {
    console.error('Unlink Telegram error:', error);
    res.status(500).json({ message: 'Server error unlinking Telegram account' });
  }
});

module.exports = router;



