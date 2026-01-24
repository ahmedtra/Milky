// Meal Plan Types
export interface Recipe {
  name: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  image_url?: string;
  nutrition?: { calories: number };
  calories?: number;
}

export interface Meal {
  mealId?: string;
  _id?: string;
  type: string;
  scheduledTime?: string;
  isCompleted?: boolean;
  recipes: Recipe[];
  calories?: number;
}

export interface MealDay {
  date?: string;
  day?: string;
  meals: Meal[];
}

export interface MealPlan {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  startDate?: string;
  status: 'active' | 'completed' | 'draft';
  days: MealDay[];
  createdAt: string;
}

// Shopping List Types
export interface ShoppingItem {
  _id?: string;
  id?: string;
  name: string;
  quantity?: string | number;
  purchased: boolean;
  category?: string;
  storeSection?: string;
  price?: number;
  estimatedPrice?: number;
  amount?: string | number;
  unit?: string;
  unitType?: 'weight' | 'volume' | 'count' | 'other';
  unitVariants?: { amount: string | number; unit: string }[];
}

export interface ShoppingList {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'completed';
  items: ShoppingItem[];
  totalEstimatedCost?: number;
  store?: string;
  createdAt: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// API Response Types
export interface GenerateMealPlanRequest {
  preferences?: {
    dietType?: string;
    goals?: string;
    activityLevel?: string;
    quickMeal?: boolean;
    includeFavorites?: boolean;
    includeIngredients?: string | string[];
    allergies?: string | string[];
    dislikedFoods?: string | string[];
    mealsToInclude?: string[];
    includeSnacks?: boolean;
    enabledMeals?: Record<string, boolean>;
    mealTimes?: {
      breakfast?: string;
      lunch?: string;
      dinner?: string;
      snack?: string;
    };
    additionalNotes?: string;
  };
  duration?: number;
  startDate?: string;
}

export interface ChatRequest {
  message: string;
  conversationHistory?: { role: string; content: string }[];
}

export interface ChatResponse {
  message: string;
}

// Helper functions
export function getMealImage(recipe: Recipe): string {
  return recipe.image || recipe.imageUrl || recipe.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop';
}

export function getMealCalories(meal: Meal): number | null {
  if (meal.calories) return meal.calories;
  if (meal.recipes?.[0]?.calories) return meal.recipes[0].calories;
  if (meal.recipes?.[0]?.nutrition?.calories) return meal.recipes[0].nutrition.calories;
  return null;
}

export function getItemId(item: ShoppingItem): string {
  return item._id || item.id || '';
}

export function getPlanId(plan: MealPlan): string {
  return plan._id || plan.id || '';
}

export function getListId(list: ShoppingList): string {
  return list._id || list.id || '';
}

export function getDayLabel(day: MealDay, index: number): string {
  if (day.day) return day.day;
  if (day.date) {
    const date = new Date(day.date);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[index % 7];
}
