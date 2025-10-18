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
  console.log('🤖 Initializing Telegram bot...');
  console.log('Token exists:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('Token value:', process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...' : 'Not set');
  
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_telegram_bot_token_here') {
    console.log('❌ Telegram bot token not provided or invalid, skipping bot initialization');
    return;
  }

  try {
    console.log('📡 Creating Telegram bot instance...');
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('✅ Telegram bot instance created successfully');
  } catch (error) {
    console.log('❌ Failed to initialize Telegram bot:', error.message);
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
/test - Send a test meal notification

🔔 I'll automatically send you:
• Meal reminders 2 hours before each meal
• Recipe details and instructions
• Shopping lists for your meal plans
• Nutrition tips and advice
    `);
  });

  // Handle /test command - send test meal reminder
  bot.onText(/\/test/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const user = await User.findOne({ telegramChatId: chatId.toString() });
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Your account is not linked. Use /link <username> to link your account first.');
        return;
      }

      await bot.sendMessage(chatId, '📤 Sending test meal reminder...');

      // Get user's active meal plan
      const activeMealPlan = await MealPlan.findOne({
        userId: user._id,
        status: 'active'
      });

      if (!activeMealPlan || !activeMealPlan.days || activeMealPlan.days.length === 0) {
        await bot.sendMessage(chatId, '❌ No active meal plan found. Please activate a meal plan on the web app first.');
        return;
      }

      // Get the first meal from the first day
      const firstDay = activeMealPlan.days[0];
      const firstMeal = firstDay.meals?.[0];

      if (!firstMeal) {
        await bot.sendMessage(chatId, '❌ No meals found in active meal plan.');
        return;
      }

      // Send the test meal reminder
      await sendMealReminder(user._id, firstMeal);
      
    } catch (error) {
      console.error('Error sending test meal:', error);
      await bot.sendMessage(chatId, '❌ Failed to send test meal: ' + error.message);
    }
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
    const recipe = mealData.recipes?.[0]; // Get primary recipe
    
    // MESSAGE 1: Meal reminder with basic info
    let message1 = `🍽️ ${mealType} Reminder!\n\n`;
    message1 += `⏰ Time: ${mealData.scheduledTime}\n\n`;
    
    if (recipe) {
      message1 += `📋 Today's ${mealType.toLowerCase()}:\n\n`;
      message1 += `🍴 ${recipe.name}\n\n`;
      if (recipe.description) {
        message1 += `${recipe.description}\n\n`;
      }
      message1 += `⏱️ Prep Time: ${recipe.prepTime || 0} min\n`;
      message1 += `🔥 Cook Time: ${recipe.cookTime || 0} min\n`;
      message1 += `👥 Servings: ${recipe.servings || 1}\n`;
      
      if (recipe.nutrition) {
        message1 += `\n📊 Nutrition per serving:\n`;
        message1 += `• Calories: ${recipe.nutrition.calories || 0} kcal\n`;
        message1 += `• Protein: ${recipe.nutrition.protein || 0}g\n`;
        message1 += `• Carbs: ${recipe.nutrition.carbs || 0}g\n`;
        message1 += `• Fat: ${recipe.nutrition.fat || 0}g\n`;
      }
    }
    
    await bot.sendMessage(user.telegramChatId, message1);
    
    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // MESSAGE 2: Ingredients
    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      let message2 = `🛒 INGREDIENTS:\n\n`;
      
      recipe.ingredients.forEach((ingredient, idx) => {
        const amount = ingredient.amount || '';
        const unit = ingredient.unit || '';
        const name = ingredient.name || '';
        message2 += `${idx + 1}. ${amount} ${unit} ${name}\n`.trim() + '\n';
      });
      
      message2 += `\n💡 Tip: Make sure you have all ingredients before starting!`;
      
      await bot.sendMessage(user.telegramChatId, message2);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // MESSAGE 3: Cooking instructions
    if (recipe && recipe.instructions && recipe.instructions.length > 0) {
      let message3 = `👨‍🍳 COOKING INSTRUCTIONS:\n\n`;
      
      recipe.instructions.forEach((instruction, idx) => {
        message3 += `Step ${idx + 1}:\n${instruction}\n\n`;
      });
      
      if (recipe.tags && recipe.tags.length > 0) {
        message3 += `🏷️ Tags: ${recipe.tags.join(', ')}\n\n`;
      }
      
      message3 += `💡 Tip: Start prepping now to enjoy your meal on time!\n\n`;
      
      
      await bot.sendMessage(user.telegramChatId, message3);
    }
    
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

const getBot = () => bot;

module.exports = {
  initializeTelegramBot,
  sendMealReminder,
  sendNotification,
  getBot,
  get bot() {
    return bot;
  }
};
