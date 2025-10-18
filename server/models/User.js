const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  telegramChatId: {
    type: String,
    default: null
  },
  telegramUsername: {
    type: String,
    default: null
  },
  preferences: {
    dietType: {
      type: String,
      enum: ['vegetarian', 'vegan', 'keto', 'paleo', 'balanced', 'low-carb', 'high-protein'],
      default: 'balanced'
    },
    allergies: [String],
    dislikedFoods: [String],
    mealTimes: {
      breakfast: { type: String, default: '08:00' },
      lunch: { type: String, default: '13:00' },
      dinner: { type: String, default: '19:00' }
    },
    notificationSettings: {
      enabled: { type: Boolean, default: true },
      timeBeforeMeal: { type: Number, default: 120 } // minutes before meal
    }
  },
  profile: {
    age: Number,
    weight: Number,
    height: Number,
    activityLevel: {
      type: String,
      enum: ['sedentary', 'lightly-active', 'moderately-active', 'very-active', 'extremely-active'],
      default: 'moderately-active'
    },
    goals: {
      type: String,
      enum: ['lose-weight', 'maintain-weight', 'gain-weight', 'build-muscle'],
      default: 'maintain-weight'
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);

