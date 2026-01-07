import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMealPlans, generateMealPlan, activateMealPlan, toggleMealCompletion, updateMealPlanDays, updateMealPlanStatus, deleteMealPlan } from '@/lib/api';
import type { MealPlan, GenerateMealPlanRequest } from '@/lib/types';

export function useMealPlans() {
  return useQuery({
    queryKey: ['meal-plans'],
    queryFn: getMealPlans,
    initialData: [],
  });
}

export function useActiveMealPlan() {
  const { data: plans, ...rest } = useMealPlans();
  
  const list = Array.isArray(plans) ? plans : [];
  const sorted = [...list].sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });
  const activePlan = sorted.find(plan => plan.status === 'active') 
    || (sorted.length ? sorted[0] : undefined);
  
  return { data: activePlan, plans: sorted, ...rest };
}

export function useGenerateMealPlan() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: GenerateMealPlanRequest) => generateMealPlan(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    },
  });
}

export function useActivateMealPlan() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (planId: string) => activateMealPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    },
  });
}

export function useToggleMealCompletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: toggleMealCompletion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    },
  });
}

export function useUpdateMealPlanDays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, days, startDate }: { planId: string; days: any[]; startDate?: string }) =>
      updateMealPlanDays(planId, days, startDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    },
  });
}

export function useUpdateMealPlanStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, status }: { planId: string; status: string }) => updateMealPlanStatus(planId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    },
  });
}

export function useDeleteMealPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => deleteMealPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] });
    },
  });
}

export function getMealCountFromPlan(plan: MealPlan | undefined): number {
  if (!plan?.days) return 0;
  return plan.days.reduce((count, day) => count + (day.meals?.length || 0), 0);
}
