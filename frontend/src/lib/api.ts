import type { MealPlan, ShoppingList, GenerateMealPlanRequest, ChatRequest, ChatResponse } from './types';

// Use relative API base to allow Vite dev proxy; override with VITE_API_BASE if needed
const API_BASE = import.meta.env.VITE_API_BASE || '';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = `${API_BASE}${url}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API error', {
      url: fullUrl,
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Meal Plans API
export async function getMealPlans(): Promise<MealPlan[]> {
  const data = await fetchJson<any>('/api/meal-plans');
  if (Array.isArray(data)) return data as MealPlan[];
  if (Array.isArray(data?.mealPlans)) return data.mealPlans as MealPlan[];
  return [];
}

export async function generateMealPlan(request: GenerateMealPlanRequest): Promise<MealPlan> {
  // Map front-end fields to the legacy backend contract
  const preferences = {
    dietType: request.preferences?.dietType || 'balanced',
    goals: request.preferences?.goals || 'maintain_weight',
    activityLevel: request.preferences?.activityLevel || 'moderate',
    quick: request.preferences?.quickMeal ?? false,
    additionalNotes: request.preferences?.additionalNotes || '',
  };

  return fetchJson<MealPlan>('/api/gemini/generate-meal-plan', {
    method: 'POST',
    body: JSON.stringify({
      preferences,
      duration: request.duration || 5,
      startDate: request.startDate,
    }),
  });
}

export async function activateMealPlan(planId: string): Promise<MealPlan> {
  // Legacy app used a dedicated activate endpoint
  try {
    return await fetchJson<MealPlan>(`/api/meal-plans/${planId}/activate`, {
      method: 'POST',
    });
  } catch (err) {
    // Fallback to PUT status if activate endpoint is missing
    return fetchJson<MealPlan>(`/api/meal-plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'active' }),
    });
  }
}

// Shopping Lists API
export async function getShoppingLists(): Promise<ShoppingList[]> {
  const data = await fetchJson<any>('/api/shopping-lists');
  if (Array.isArray(data)) return data as ShoppingList[];
  if (Array.isArray(data?.shoppingLists)) return data.shoppingLists as ShoppingList[];
  return [];
}

export async function toggleMealCompletion(params: {
  planId: string;
  dayIndex: number;
  mealIndex: number;
  isCompleted: boolean;
}): Promise<void> {
  const { planId, dayIndex, mealIndex, isCompleted } = params;
  await fetchJson(`/api/meal-plans/${planId}/days/${dayIndex}/meals/${mealIndex}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ isCompleted }),
  });
}

export async function updateMealPlanDays(planId: string, days: any[], startDate?: string): Promise<MealPlan> {
  console.log("updateMealPlanDays payload", { planId, startDate, daysCount: Array.isArray(days) ? days.length : 0 });
  return fetchJson<MealPlan>(`/api/meal-plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify({
      days,
      ...(startDate ? { startDate } : {}),
    }),
  });
}

export async function updateMealPlanStatus(planId: string, status: string): Promise<MealPlan> {
  return fetchJson<MealPlan>(`/api/meal-plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function getMealAlternatives(params: {
  planId: string;
  dayIndex: number;
  mealIndex: number;
  limit?: number;
}): Promise<{ alternatives: any[]; favorites?: any[] }> {
  const { planId, dayIndex, mealIndex, limit = 3 } = params;
  const data = await fetchJson<any>(`/api/meal-plans/${planId}/days/${dayIndex}/meals/${mealIndex}/alternatives?limit=${limit}`);
  return {
    alternatives: data?.alternatives || [],
    favorites: data?.favorites || [],
  };
}

export async function applyMealAlternative(params: {
  planId: string;
  dayIndex: number;
  mealIndex: number;
  recipeId?: string;
  recipe?: any;
}): Promise<any> {
  const { planId, dayIndex, mealIndex, recipeId, recipe } = params;
  return fetchJson<any>(`/api/meal-plans/${planId}/days/${dayIndex}/meals/${mealIndex}`, {
    method: 'PATCH',
    body: JSON.stringify({ recipeId, recipe }),
  });
}

export async function saveFavoriteRecipe(payload: { title?: string; recipeId?: string; recipe?: any }) {
  return fetchJson<any>('/api/favorites', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getFavoriteRecipes(): Promise<any[]> {
  const data = await fetchJson<any>('/api/favorites');
  return data?.favorites || [];
}

export async function deleteFavoriteRecipe(id: string): Promise<void> {
  await fetchJson<void>(`/api/favorites/${id}`, {
    method: 'DELETE',
  });
}

export async function ensureFavoriteImage(id: string): Promise<any> {
  return fetchJson<any>(`/api/favorites/${id}/image`, {
    method: 'POST',
  });
}

export async function ensureMealImage(params: {
  planId: string;
  dayIndex: number;
  mealIndex: number;
}): Promise<any> {
  const { planId, dayIndex, mealIndex } = params;
  return fetchJson<any>(`/api/meal-plans/${planId}/days/${dayIndex}/meals/${mealIndex}/image`, {
    method: 'POST',
  });
}

export async function deleteMealPlan(planId: string): Promise<void> {
  await fetchJson<void>(`/api/meal-plans/${planId}`, {
    method: 'DELETE',
  });
}

export async function createShoppingList(data: {
  title: string;
  description?: string;
  items?: { name: string; quantity: string; category: string; purchased: boolean; price: number }[];
  status?: 'draft' | 'active' | 'completed';
}): Promise<ShoppingList> {
  return fetchJson<ShoppingList>('/api/shopping-lists', {
    method: 'POST',
    body: JSON.stringify({
      title: data.title,
      description: data.description || '',
      items: data.items || [],
      status: data.status || 'draft',
    }),
  });
}

export async function updateShoppingList(listId: string, data: Partial<ShoppingList>): Promise<ShoppingList> {
  return fetchJson<ShoppingList>(`/api/shopping-lists/${listId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function generateShoppingListFromPlan(plan: any): Promise<ShoppingList> {
  // Ask backend to generate items from a meal plan, then persist as a shopping list
  const generated = await fetchJson<any>('/api/gemini/generate-shopping-list', {
    method: 'POST',
    body: JSON.stringify({ mealPlan: plan }),
  });

  const shoppingList = generated?.shoppingList || {};
  return fetchJson<ShoppingList>('/api/shopping-lists', {
    method: 'POST',
    body: JSON.stringify({
      mealPlanId: plan._id || plan.id,
      title: shoppingList.title || `Shopping List for ${plan.title || 'Meal Plan'}`,
      description: shoppingList.description || '',
      items: shoppingList.items || [],
      store: shoppingList.store,
      totalEstimatedCost: shoppingList.totalEstimatedCost,
      status: 'active',
    }),
  });
}

export async function updateShoppingListItem(params: {
  listId: string;
  itemId: string;
  purchased?: boolean;
  priority?: string;
  notes?: string;
}): Promise<void> {
  const { listId, itemId, ...rest } = params;
  await fetchJson(`/api/shopping-lists/${listId}/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(rest),
  });
}

export async function deleteShoppingList(listId: string): Promise<void> {
  await fetchJson(`/api/shopping-lists/${listId}`, {
    method: 'DELETE',
  });
}

// Chat API
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  return fetchJson<ChatResponse>('/api/gemini/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
