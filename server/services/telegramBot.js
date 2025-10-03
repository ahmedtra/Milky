const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const MealPlan = require('../models/MealPlan');
const ShoppingList = require('../models/ShoppingList');

let bot = null;

const getClientAppUrl = () => {
  const urls = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);

  return process.env.CLIENT_URL || urls[0] || 'http://localhost:3000';
};

const clientAppUrl = getClientAppUrl();

const initializeTelegramBot = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_telegram_bot_token_here') {
    console.log('Telegram bot token not provided or invalid, skipping bot initialization');
    return;
  }

  try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  } catch (error) {
    console.log('Failed to initialize Telegram bot:', error.message);
    return;
  }

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    try {
      // Check if user exists in database
      let user = await User.findOne({ telegramChatId: chatId.toString() });
      
      if (!user) {
        await bot.sendMessage(chatId, `
🤖 Welcome to Milky Diet Assistant!

I'll help you with:
• Personalized meal plans
• Shopping lists
• Meal reminders
• Nutrition advice

To get started, please register on our web app first, then come back here to link your account.

Visit: ${clientAppUrl}

Once registered, use /link to connect your account.
        `);
      } else {
        await bot.sendMessage(chatId, `
👋 Welcome back, ${username}!

Your account is already linked. I'll send you:
• Meal reminders 2 hours before each meal
• Recipe details and shopping lists
• Nutrition tips

Use /help to see available commands.
        `);
      }
    } catch (error) {
      console.error('Error handling /start command:', error);
      await bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
    }
  });

  // Handle /link command
  bot.onText(/\/link (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1];
    
    try {
      const user = await User.findOne({ username });
      
      if (!user) {
        await bot.sendMessage(chatId, 'User not found. Please make sure you have registered on our web app first.');
        return;
      }
      
      if (user.telegramChatId) {
        await bot.sendMessage(chatId, 'This account is already linked to another Telegram chat.');
        return;
      }
      
      user.telegramChatId = chatId.toString();
      user.telegramUsername = msg.from.username || msg.from.first_name;
      await user.save();
      
      await bot.sendMessage(chatId, `
✅ Account linked successfully!

Your Telegram account is now connected to ${username}.
I'll start sending you meal reminders and notifications.
      `);
    } catch (error) {
      console.error('Error linking account:', error);
      await bot.sendMessage(chatId, 'Sorry, something went wrong while linking your account.');
    }
  });

  // Handle /help command
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId, `
📚 Available Commands:

/start - Initialize the bot
/link <username> - Link your web account
/help - Show this help message
/status - Check your notification settings
/unlink - Unlink your account

🔔 I'll automatically send you:
• Meal reminders 2 hours before each meal
• Recipe details and instructions
• Shopping lists for your meal plans
• Nutrition tips and advice
    `);
  });

  // Handle /status command
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await User.findOne({ telegramChatId: chatId.toString() });
      
      if (!user) {
        await bot.sendMessage(chatId, 'Account not linked. Use /link <username> to connect your account.');
        return;
      }
      
      const status = user.preferences.notificationSettings.enabled ? 'enabled' : 'disabled';
      const timeBeforeMeal = user.preferences.notificationSettings.timeBeforeMeal;
      
      await bot.sendMessage(chatId, `
📊 Your Status:

✅ Account: Linked (${user.username})
🔔 Notifications: ${status}
⏰ Reminder time: ${timeBeforeMeal} minutes before meals
🥗 Diet type: ${user.preferences.dietType}
      `);
    } catch (error) {
      console.error('Error checking status:', error);
      await bot.sendMessage(chatId, 'Sorry, couldn\'t retrieve your status.');
    }
  });

  // Handle /unlink command
  bot.onText(/\/unlink/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await User.findOne({ telegramChatId: chatId.toString() });
      
      if (!user) {
        await bot.sendMessage(chatId, 'Account not linked.');
        return;
      }
      
      user.telegramChatId = null;
      user.telegramUsername = null;
      await user.save();
      
      await bot.sendMessage(chatId, 'Account unlinked successfully. You can link it again anytime with /link <username>.');
    } catch (error) {
      console.error('Error unlinking account:', error);
      await bot.sendMessage(chatId, 'Sorry, couldn\'t unlink your account.');
    }
  });

  // Error handling
  bot.on('error', (error) => {
    console.error('Telegram bot error:', error);
  });

  bot.on('polling_error', (error) => {
    if (error?.code === 'ETELEGRAM' && error?.response?.statusCode === 401) {
      console.error('Telegram bot token rejected with 401. Stopping polling to avoid crashes.');
      bot.stopPolling().catch(() => {});
      bot = null;
      return;
    }

    console.error('Telegram polling error:', error);
  });

  console.log('Telegram bot initialized successfully');
};

const sendMealReminder = async (userId, mealData, shoppingList) => {
  if (!bot) return;

  try {
    const user = await User.findById(userId);
    if (!user || !user.telegramChatId) return;

    const mealType = mealData.type.charAt(0).toUpperCase() + mealData.type.slice(1);
    
    let message = `🍽️ ${mealType} Reminder!\n\n`;
    message += `⏰ Time: ${mealData.scheduledTime}\n\n`;
    
    if (mealData.recipes && mealData.recipes.length > 0) {
      message += `📋 Today's ${mealType.toLowerCase()}:\n\n`;
      
      mealData.recipes.forEach((recipe, index) => {
        message += `${index + 1}. ${recipe.name}\n`;
        if (recipe.description) {
          message += `   ${recipe.description}\n`;
        }
        message += `   ⏱️ Prep: ${recipe.prepTime}min, Cook: ${recipe.cookTime}min\n\n`;
      });
    }

    if (shoppingList && shoppingList.items && shoppingList.items.length > 0) {
      message += `🛒 Shopping List for ${mealType.toLowerCase()}:\n\n`;
      
      // Group items by category
      const itemsByCategory = {};
      shoppingList.items.forEach(item => {
        if (!itemsByCategory[item.category]) {
          itemsByCategory[item.category] = [];
        }
        itemsByCategory[item.category].push(item);
      });
      
      Object.keys(itemsByCategory).forEach(category => {
        message += `${category.charAt(0).toUpperCase() + category.slice(1)}:\n`;
        itemsByCategory[category].forEach(item => {
          message += `• ${item.name} - ${item.amount} ${item.unit}\n`;
        });
        message += '\n';
      });
    }

    message += `\n💡 Tip: Start prepping now to enjoy your meal on time!`;
    message += `\n\nVisit our app for full recipe details: ${clientAppUrl}`;

    await bot.sendMessage(user.telegramChatId, message);
  } catch (error) {
    console.error('Error sending meal reminder:', error);
  }
};

const sendNotification = async (userId, message) => {
  if (!bot) return;

  try {
    const user = await User.findById(userId);
    if (!user || !user.telegramChatId) return;

    await bot.sendMessage(user.telegramChatId, message);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

module.exports = {
  initializeTelegramBot,
  sendMealReminder,
  sendNotification,
  bot
};
