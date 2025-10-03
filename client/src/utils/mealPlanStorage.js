const generateLocalId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `meal-${Date.now().toString(36)}-${randomSuffix}`;
};

const normalizeRecipes = (recipes) => {
  if (!Array.isArray(recipes)) {
    return [];
  }

  return recipes.map((recipe) => ({
    ...recipe,
    nutrition: recipe?.nutrition || {},
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe?.instructions) ? recipe.instructions : [],
  }));
};

const normalizeMeal = (meal, planId, dayIndex, mealIndex) => {
  const fallbackId = `${planId || 'plan'}-${dayIndex}-${mealIndex}-${meal?.type || 'meal'}`;

  return {
    ...meal,
    mealId: meal?.mealId || meal?.id || meal?._id || generateLocalId() || fallbackId,
    isCompleted: typeof meal?.isCompleted === 'boolean' ? meal.isCompleted : false,
    recipes: normalizeRecipes(meal?.recipes),
  };
};

const normalizeDay = (day, planId, dayIndex) => ({
  ...day,
  meals: Array.isArray(day?.meals)
    ? day.meals.map((meal, mealIndex) => normalizeMeal(meal, planId, dayIndex, mealIndex))
    : [],
});

export const ensureMealPlanMetadata = (plan) => {
  if (!plan || typeof plan !== 'object') {
    return plan;
  }

  return {
    ...plan,
    days: Array.isArray(plan.days)
      ? plan.days.map((day, dayIndex) => normalizeDay(day, plan.id, dayIndex))
      : [],
  };
};

export const ensureMealPlansMetadata = (plans) => {
  if (!Array.isArray(plans)) {
    return [];
  }

  return plans.map((plan) => ensureMealPlanMetadata(plan));
};

export const saveMealPlans = (plans) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem('mealPlans', JSON.stringify(plans));
};

export const loadMealPlans = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem('mealPlans');
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return ensureMealPlansMetadata(parsed);
  } catch (error) {
    console.error('Failed to load meal plans from localStorage:', error);
    return [];
  }
};

export const replaceMealPlan = (plans, updatedPlan) => {
  return plans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan));
};

export const persistUpdatedMealPlan = (updatedPlan) => {
  const plans = loadMealPlans();
  const updatedPlans = replaceMealPlan(plans, ensureMealPlanMetadata(updatedPlan));
  saveMealPlans(updatedPlans);
  return updatedPlans;
};

