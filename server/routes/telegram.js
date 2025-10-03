const express = require('express');
const router = express.Router();
const { bot } = require('../services/telegramBot');
const User = require('../models/User');

// Webhook endpoint for Telegram updates (if using webhooks instead of polling)
router.post('/webhook', async (req, res) => {
  try {
    if (bot) {
      await bot.processUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// Get bot info
router.get('/bot-info', async (req, res) => {
  try {
    if (!bot) {
      return res.status(503).json({ message: 'Telegram bot not initialized' });
    }

    const botInfo = await bot.getMe();
    res.json({
      bot: botInfo,
      status: 'active'
    });
  } catch (error) {
    console.error('Get bot info error:', error);
    res.status(500).json({ message: 'Failed to get bot info' });
  }
});

// Send test message to user
router.post('/send-test', async (req, res) => {
  try {
    const { userId, message = 'Test message from Milky Diet Assistant!' } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const user = await User.findById(userId);
    if (!user || !user.telegramChatId) {
      return res.status(404).json({ message: 'User not found or Telegram not linked' });
    }

    if (!bot) {
      return res.status(503).json({ message: 'Telegram bot not initialized' });
    }

    await bot.sendMessage(user.telegramChatId, message);

    res.json({
      message: 'Test message sent successfully',
      sentTo: user.telegramChatId
    });
  } catch (error) {
    console.error('Send test message error:', error);
    res.status(500).json({ message: 'Failed to send test message' });
  }
});

// Get webhook info
router.get('/webhook-info', async (req, res) => {
  try {
    if (!bot) {
      return res.status(503).json({ message: 'Telegram bot not initialized' });
    }

    const webhookInfo = await bot.getWebHookInfo();
    res.json({ webhookInfo });
  } catch (error) {
    console.error('Get webhook info error:', error);
    res.status(500).json({ message: 'Failed to get webhook info' });
  }
});

// Set webhook URL
router.post('/set-webhook', async (req, res) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ message: 'Webhook URL is required' });
    }

    if (!bot) {
      return res.status(503).json({ message: 'Telegram bot not initialized' });
    }

    const result = await bot.setWebHook(webhookUrl);
    
    res.json({
      message: 'Webhook set successfully',
      result
    });
  } catch (error) {
    console.error('Set webhook error:', error);
    res.status(500).json({ message: 'Failed to set webhook' });
  }
});

// Delete webhook (disable webhooks)
router.delete('/webhook', async (req, res) => {
  try {
    if (!bot) {
      return res.status(503).json({ message: 'Telegram bot not initialized' });
    }

    const result = await bot.deleteWebHook();
    
    res.json({
      message: 'Webhook deleted successfully',
      result
    });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({ message: 'Failed to delete webhook' });
  }
});

module.exports = router;




