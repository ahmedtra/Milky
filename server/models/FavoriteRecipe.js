const mongoose = require('mongoose');

const favoriteRecipeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  externalId: String, // optional id from search index
  source: {
    type: String,
    default: 'user'
  },
  summary: String,
  image: String,
  imageUrl: String,
  calories: Number,
  protein: Number,
  totalTime: Number,
  tags: [String],
  planRecipe: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

favoriteRecipeSchema.index({ userId: 1, externalId: 1 });
favoriteRecipeSchema.index({ userId: 1, title: 1 }, { unique: true });

module.exports = mongoose.model('FavoriteRecipe', favoriteRecipeSchema);
