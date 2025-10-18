const cron = require('node-cron');
const User = require('../models/User');
const MealPlan = require('../models/MealPlan');
const ShoppingList = require('../models/ShoppingList');
const { sendMealReminder } = require('./telegramBot');

class NotificationScheduler {
  constructor() {
    this.scheduledJobs = new Map();
  }

  initialize() {
    console.log('Initializing notification scheduler...');
    
    // Schedule job to check for meal reminders every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.checkMealReminders();
    });

    // Schedule job to refresh active meal plans every hour
    cron.schedule('0 * * * *', async () => {
      await this.refreshActiveMealPlans();
    });

    console.log('Notification scheduler initialized');
  }

  async checkMealReminders() {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Find users with notification settings enabled
      const users = await User.find({
        'preferences.notificationSettings.enabled': true,
        telegramChatId: { $ne: null }
      });

      for (const user of users) {
        // Get user's active meal plans
        const activeMealPlans = await MealPlan.find({
          userId: user._id,
          status: 'active',
          startDate: { $lte: now },
          endDate: { $gte: now }
        });

        for (const mealPlan of activeMealPlans) {
          // Find today's meals
          const todayMeals = mealPlan.days.find(day => 
            day.date.toISOString().split('T')[0] === currentDate
          );

          if (todayMeals) {
            for (const meal of todayMeals.meals) {
              const reminderTime = this.calculateReminderTime(
                meal.scheduledTime, 
                user.preferences.notificationSettings.timeBeforeMeal
              );

              // Check if it's time to send reminder
              if (this.shouldSendReminder(currentTime, reminderTime, user._id, meal._id)) {
                await this.sendMealReminderWithShoppingList(user, mealPlan, meal);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking meal reminders:', error);
    }
  }

  calculateReminderTime(mealTime, minutesBefore) {
    const [hours, minutes] = mealTime.split(':').map(Number);
    const mealDateTime = new Date();
    mealDateTime.setHours(hours, minutes, 0, 0);
    
    const reminderDateTime = new Date(mealDateTime.getTime() - (minutesBefore * 60 * 1000));
    
    return reminderDateTime.toTimeString().slice(0, 5); // HH:MM format
  }

  shouldSendReminder(currentTime, reminderTime, userId, mealId) {
    const reminderKey = `${userId}-${mealId}-${reminderTime}`;
    
    // Check if we've already sent this reminder
    if (this.scheduledJobs.has(reminderKey)) {
      return false;
    }

    // Check if current time matches reminder time (within 5-minute window)
    const currentMinutes = this.timeToMinutes(currentTime);
    const reminderMinutes = this.timeToMinutes(reminderTime);
    
    return Math.abs(currentMinutes - reminderMinutes) <= 5;
  }

  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  async sendMealReminderWithShoppingList(user, mealPlan, meal) {
    try {
      // Get or create shopping list for this meal
      let shoppingList = await ShoppingList.findOne({
        userId: user._id,
        mealPlanId: mealPlan._id
      });

      if (!shoppingList) {
        // Generate shopping list for the meal plan
        const geminiService = require('./geminiService');
        const shoppingListData = await geminiService.generateShoppingList(mealPlan);
        
        shoppingList = new ShoppingList({
          userId: user._id,
          mealPlanId: mealPlan._id,
          title: shoppingListData.title,
          description: shoppingListData.description,
          items: shoppingListData.items,
          status: 'draft',
          totalEstimatedCost: shoppingListData.totalEstimatedCost,
          store: shoppingListData.store
        });
        
        await shoppingList.save();
      }

      // Send the reminder
      await sendMealReminder(user._id, meal, shoppingList);

      // Mark this reminder as sent
      const reminderKey = `${user._id}-${meal._id}-${this.calculateReminderTime(meal.scheduledTime, user.preferences.notificationSettings.timeBeforeMeal)}`;
      this.scheduledJobs.set(reminderKey, true);

      // Clean up old reminders (keep only last 24 hours)
      this.cleanupOldReminders();
      
    } catch (error) {
      console.error('Error sending meal reminder with shopping list:', error);
    }
  }

  cleanupOldReminders() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [key, timestamp] of this.scheduledJobs.entries()) {
      if (timestamp < oneDayAgo) {
        this.scheduledJobs.delete(key);
      }
    }
  }

  async refreshActiveMealPlans() {
    try {
      const now = new Date();
      
      // Update meal plans that have ended
      await MealPlan.updateMany(
        {
          status: 'active',
          endDate: { $lt: now }
        },
        {
          status: 'completed'
        }
      );

      console.log('Active meal plans refreshed');
    } catch (error) {
      console.error('Error refreshing meal plans:', error);
    }
  }

  // Manual method to schedule a specific meal reminder
  async scheduleMealReminder(userId, mealId, mealTime, minutesBefore = 120) {
    const reminderTime = this.calculateReminderTime(mealTime, minutesBefore);
    const reminderKey = `${userId}-${mealId}-${reminderTime}`;
    
    this.scheduledJobs.set(reminderKey, Date.now());
  }

  // Method to cancel a scheduled reminder
  cancelMealReminder(userId, mealId, mealTime, minutesBefore = 120) {
    const reminderTime = this.calculateReminderTime(mealTime, minutesBefore);
    const reminderKey = `${userId}-${mealId}-${reminderTime}`;
    
    this.scheduledJobs.delete(reminderKey);
  }
}

const notificationScheduler = new NotificationScheduler();

const initializeNotificationScheduler = () => {
  notificationScheduler.initialize();
};

module.exports = {
  initializeNotificationScheduler,
  notificationScheduler
};






