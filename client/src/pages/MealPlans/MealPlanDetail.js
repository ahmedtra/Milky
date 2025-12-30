import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  Share2,
  ShoppingCart,
  ChefHat,
  Target,
  Trash2,
  Users,
  Utensils,
  Zap
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
// Removed localStorage utilities - now using database API

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 0.75rem;
  }
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid ${props => props.theme.colors.gray[200]};
  background: white;
  border-radius: ${props => props.theme.borderRadius.md};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.primary[300]};
    background: ${props => props.theme.colors.primary[50]};
  }
`;

const HeaderContent = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0 0 0.5rem 0;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const Subtitle = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  margin: 0;
  font-size: 1.1rem;
  word-break: break-word;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$primary ? 'transparent' : props.theme.colors.gray[200]};
  background: ${props => props.$primary ? props.theme.colors.primary[600] : 'white'};
  color: ${props => props.$primary ? 'white' : props.theme.colors.gray[700]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$primary ? props.theme.colors.primary[700] : props.theme.colors.gray[50]};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 768px) {
    flex: 1 1 calc(50% - 0.75rem);
    justify-content: center;
    font-size: 0.9rem;
  }

  @media (max-width: 480px) {
    flex: 1 1 100%;
  }
`;

const OverviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const OverviewCard = styled.div`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 1.5rem;
`;

const OverviewIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: ${props => props.theme.borderRadius.lg};
  background: ${props => props.$bgColor || props.theme.colors.primary[100]};
  color: ${props => props.$iconColor || props.theme.colors.primary[600]};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
`;

const OverviewValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin-bottom: 0.25rem;
`;

const OverviewLabel = styled.div`
  font-size: 0.9rem;
  color: ${props => props.theme.colors.gray[600]};
`;

const DaysGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
`;

const DayCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  overflow: hidden;
`;

const DayHeader = styled.div`
  background: ${props => props.theme.colors.primary[50]};
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
`;

const DayTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0 0 0.25rem 0;
`;

const DayDate = styled.div`
  color: ${props => props.theme.colors.gray[600]};
  font-size: 0.9rem;
`;

const MealsList = styled.div`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const MealItem = styled.div`
  border: 1px solid
    ${props => {
      if (props.$completed) return props.theme.colors.success[200];
      if (props.$expanded) return props.theme.colors.primary[200];
      return props.theme.colors.gray[200];
    }};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1.25rem;
  background:
    ${props => {
      if (props.$completed) return props.theme.colors.success[50];
      if (props.$expanded) return props.theme.colors.primary[50];
      return 'white';
    }};
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: ${props => (props.$expanded ? props.theme.shadows.sm : 'none')};
`;

const MealHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 1rem;
`;

const MealType = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: ${props => props.$completed ? props.theme.colors.success[700] : props.theme.colors.gray[800]};
  text-decoration: ${props => props.$completed ? 'line-through' : 'none'};
`;

const MealTime = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: ${props => props.theme.colors.gray[500]};
  font-size: 0.9rem;
`;

const MealHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  flex: 1;
`;

const MealStatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.success[700]};
  background: ${props => props.theme.colors.success[100]};
  border: 1px solid ${props => props.theme.colors.success[200]};
  border-radius: ${props => props.theme.borderRadius.sm};
  padding: 0.25rem 0.5rem;
`;

const MealActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MealToggleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  flex: 1;
  justify-content: flex-start;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: inherit;
  text-align: left;

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary[300]};
    outline-offset: 2px;
  }
`;

const MealExpandIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: ${props => (props.$expanded ? props.theme.colors.primary[200] : props.theme.colors.gray[200])};
  color: ${props => (props.$expanded ? props.theme.colors.primary[700] : props.theme.colors.gray[600])};
  transition: background 0.2s ease, color 0.2s ease;
  flex-shrink: 0;
`;

const MealActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid
    ${props => {
      if (props.$danger) return props.theme.colors.error[200];
      if (props.$completed) return props.theme.colors.success[200];
      return props.theme.colors.gray[200];
    }};
  background:
    ${props => {
      if (props.$danger) return props.theme.colors.error[50];
      if (props.$completed) return props.theme.colors.success[100];
      return 'white';
    }};
  color:
    ${props => {
      if (props.$danger) return props.theme.colors.error[600];
      if (props.$completed) return props.theme.colors.success[600];
      return props.theme.colors.gray[600];
    }};
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.sm};
  }
`;

const SwapPanel = styled.div`
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px dashed ${props => props.theme.colors.gray[300]};
  background: ${props => props.theme.colors.gray[50]};
`;

const SwapHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  color: ${props => props.theme.colors.gray[700]};
  font-weight: 600;
`;

const SwapActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SwapCloseButton = styled.button`
  border: 1px solid ${props => props.theme.colors.gray[300]};
  background: white;
  border-radius: ${props => props.theme.borderRadius.sm};
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: ${props => props.theme.colors.gray[700]};
`;

const AlternativeList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.5rem;
`;

const AlternativeCard = styled.button`
  text-align: left;
  width: 100%;
  border: 1px solid ${props => props.theme.colors.gray[200]};
  background: white;
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 0.75rem;
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  &:hover {
    box-shadow: ${props => props.theme.shadows.sm};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
  }
`;

const AlternativeTitle = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

const AlternativeMeta = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: ${props => props.theme.colors.gray[600]};
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: ${props => props.theme.borderRadius.sm};
  background: ${props => props.$tone === 'info' ? props.theme.colors.primary[50] : props.theme.colors.gray[100]};
  color: ${props => props.$tone === 'info' ? props.theme.colors.primary[700] : props.theme.colors.gray[700]};
  border: 1px solid ${props => props.$tone === 'info' ? props.theme.colors.primary[200] : props.theme.colors.gray[200]};
`;

const SpinnerIcon = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;

const RecipesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const RecipeItem = styled.div`
  border: 1px solid ${props => props.theme.colors.gray[100]};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem;
  background: ${props => props.theme.colors.gray[50]};
`;

const RecipeSection = styled.div`
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
`;

const SectionTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin-bottom: 0.75rem;
`;

const InstructionList = styled.ol`
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const InstructionItem = styled.li`
  color: ${props => props.theme.colors.gray[700]};
  line-height: 1.6;
  white-space: pre-wrap;
`;

const ShoppingList = styled.ul`
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ShoppingListItem = styled.li`
  color: ${props => props.theme.colors.gray[700]};
  line-height: 1.6;
`;

const RecipeName = styled.h4`
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0 0 0.5rem 0;
`;

const RecipeDescription = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  line-height: 1.5;
`;

const RecipeMeta = styled.div`
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: ${props => props.theme.colors.gray[500]};
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const NutritionInfo = styled.div`
  background: ${props => props.theme.colors.success[50]};
  border: 1px solid ${props => props.theme.colors.success[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem;
  margin-top: 1rem;
`;

const NutritionTitle = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.success[800]};
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const NutritionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 0.5rem;
`;

const NutritionItem = styled.div`
  text-align: center;
`;

const NutritionValue = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.success[700]};
`;

const NutritionLabel = styled.div`
  font-size: 0.8rem;
  color: ${props => props.theme.colors.success[600]};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: ${props => props.theme.colors.gray[500]};
`;

const EmptyTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin: 0 0 1rem 0;
`;

const EmptyDescription = styled.p`
  margin: 0;
  line-height: 1.6;
`;

const MealPlanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mealPlan, setMealPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState(() => new Set());
  const [swapState, setSwapState] = useState({
    key: null,
    options: [],
    loading: false,
    applying: false
  });

  // Fetch the actual meal plan data from database
  React.useEffect(() => {
    const fetchMealPlan = async () => {
      try {
        setLoading(true);
        console.log('Fetching meal plan with ID:', id);
        const response = await axios.get(`/api/meal-plans/${id}`);
        const plan = response.data;
        
        console.log('Received meal plan:', plan);
        console.log('Days:', plan?.days?.length || 0);
        console.log('First day meals:', plan?.days?.[0]?.meals?.length || 0);
        
        if (plan) {
          const normalizedPlan = {
            ...plan,
            id: plan._id || plan.id,
            isActive: plan.status === 'active'
          };
          setMealPlan(normalizedPlan);
          setIsActive(normalizedPlan.isActive);
          console.log('Meal plan loaded successfully:', normalizedPlan.title);
        } else {
          console.log('Meal plan not found with ID:', id);
          setIsActive(false);
        }
      } catch (error) {
        console.error('Error fetching meal plan:', error);
        toast.error('Failed to load meal plan');
        setIsActive(false);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMealPlan();
  }, [id]);

  React.useEffect(() => {
    setExpandedMeals(new Set());
  }, [id]);

  const toggleMealExpansion = React.useCallback((dayIndex, mealId) => {
    const key = `${dayIndex}-${mealId}`;
    setExpandedMeals(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const applyMealPlanUpdate = React.useCallback((updateFn) => {
    setMealPlan(prevPlan => {
      if (!prevPlan) {
        return prevPlan;
      }

      const updated = updateFn(prevPlan);
      if (!updated || updated === prevPlan) {
        return prevPlan;
      }

      // Updates are now persisted to the database via API calls
      return updated;
    });
  }, []);

  const handleToggleActive = async () => {
    try {
      if (isActive) {
        // Deactivate: update status to 'draft' using PUT
        await axios.put(`/api/meal-plans/${id}`, { status: 'draft' });
        setMealPlan(prev => (prev ? { ...prev, isActive: false, status: 'draft' } : prev));
        setIsActive(false);
        toast.success('Meal plan deactivated');
      } else {
        // Activate: use the dedicated activation endpoint
        const response = await axios.post(`/api/meal-plans/${id}/activate`);
        setMealPlan(prev => (prev ? { ...prev, isActive: true, status: 'active' } : prev));
        setIsActive(true);
        toast.success('Meal plan set as active');
      }
    } catch (error) {
      console.error('Error toggling meal plan active status:', error);
      toast.error('Failed to update meal plan status');
    }
  };

  const handleToggleMealCompletion = React.useCallback(async (dayIndex, mealId) => {
    // Get current status before updating
    const currentMeal = mealPlan?.days?.[dayIndex]?.meals?.find(m => 
      m.mealId === mealId || m._id?.toString() === mealId || mealId === mealPlan?.days?.[dayIndex]?.meals?.indexOf(m)
    );
    const currentStatus = currentMeal?.isCompleted || false;
    const newIsCompleted = !currentStatus;

    console.log(`🔄 Toggling meal: Current status = ${currentStatus}, New status = ${newIsCompleted}`);

    // Update locally for instant UI feedback
    applyMealPlanUpdate(prev => {
      const targetDay = prev.days?.[dayIndex];
      if (!targetDay) {
        return prev;
      }

      const meals = targetDay.meals || [];
      const mealIndex = typeof mealId === 'number' 
        ? mealId 
        : meals.findIndex(m => m.mealId === mealId || m._id?.toString() === mealId?.toString());
      
      if (mealIndex === -1 || !meals[mealIndex]) {
        console.warn('Meal not found for toggle');
        return prev;
      }

      const updatedPlan = {
        ...prev,
        days: prev.days.map((day, idx) => {
          if (idx !== dayIndex) return day;
          return {
            ...day,
            meals: day.meals.map((meal, idx) =>
              idx === mealIndex
                ? { ...meal, isCompleted: newIsCompleted }
                : meal
            )
          };
        })
      };

      toast.success(newIsCompleted ? 'Meal marked as completed' : 'Meal marked as pending');

      return updatedPlan;
    });

    // Sync with backend if the meal plan is stored in MongoDB
    if (mealPlan?._id) {
      try {
        const meals = mealPlan.days[dayIndex].meals;
        const mealIndexInDay = typeof mealId === 'number' 
          ? mealId 
          : meals.findIndex(m => 
              m.mealId === mealId || 
              m._id?.toString() === mealId?.toString() ||
              m._id === mealId
            );
            
        if (mealIndexInDay !== -1) {
          console.log(`🔄 Syncing meal completion to backend: Plan ${mealPlan._id}, Day ${dayIndex}, Meal ${mealIndexInDay}, Completed: ${newIsCompleted}`);
          await axios.post(`/api/meal-plans/${mealPlan._id}/days/${dayIndex}/meals/${mealIndexInDay}/toggle`, {
            isCompleted: newIsCompleted
          });
          console.log('✅ Successfully synced to backend');
        } else {
          console.warn('⚠️ Meal not found in day for syncing');
        }
      } catch (error) {
        console.error('❌ Error syncing meal completion with backend:', error);
        // Don't show error to user - local update already happened
      }
    } else {
      console.warn('⚠️ No MongoDB _id found for this meal plan, skipping backend sync. Generate a new meal plan to enable backend syncing.');
    }
  }, [applyMealPlanUpdate, mealPlan]);

  const handleDeleteMeal = React.useCallback(async (dayIndex, mealId) => {
    if (typeof window !== 'undefined') {
      const shouldRemove = window.confirm('Remove this meal from your plan?');
      if (!shouldRemove) {
        return;
      }
    }

    try {
      const targetDay = mealPlan?.days?.[dayIndex];
      if (!targetDay) {
        return;
      }

      const meals = targetDay.meals || [];
      const mealIndex = typeof mealId === 'number' 
        ? mealId 
        : meals.findIndex(m => m.mealId === mealId || m._id?.toString() === mealId?.toString());
      
      if (mealIndex === -1) {
        console.warn('Meal not found for deletion');
        return;
      }

      const updatedDays = mealPlan.days.map((day, idx) => {
        if (idx !== dayIndex) return day;
        return {
          ...day,
          meals: day.meals.filter((meal, idx) => idx !== mealIndex)
        };
      });

      // Update in database
      await axios.put(`/api/meal-plans/${id}`, {
        days: updatedDays
      });

      // Update local state
      setMealPlan(prev => ({
        ...prev,
        days: updatedDays
      }));

      setExpandedMeals(prev => {
        const next = new Set(prev);
        next.delete(`${dayIndex}-${mealId}`);
        return next;
      });

      toast.success('Meal removed from plan');
    } catch (error) {
      console.error('Error deleting meal:', error);
      toast.error('Failed to remove meal');
    }
  }, [mealPlan, id]);

  const swapKeyFor = (dayIndex, mealIndex) => `${dayIndex}-${mealIndex}`;

  const handleFetchAlternatives = React.useCallback(
    async (dayIndex, mealIndex) => {
      if (!mealPlan?._id) {
        toast.error('Swap requires a saved meal plan. Generate or save first.');
        return;
      }

      const key = swapKeyFor(dayIndex, mealIndex);
      setSwapState({ key, options: [], loading: true, applying: false });

      try {
        const { data } = await axios.get(
          `/api/meal-plans/${mealPlan._id}/days/${dayIndex}/meals/${mealIndex}/alternatives`,
          { params: { limit: 3 } }
        );
        setSwapState({
          key,
          options: data?.alternatives || [],
          loading: false,
          applying: false
        });

        if (!data?.alternatives?.length) {
          toast('No alternatives found right now.');
        }
      } catch (error) {
        console.error('Error fetching alternatives:', error);
        toast.error('Failed to load alternatives');
        setSwapState({ key: null, options: [], loading: false, applying: false });
      }
    },
    [mealPlan]
  );

  const handleApplyAlternative = React.useCallback(
    async (dayIndex, mealIndex, recipeId) => {
      if (!mealPlan?._id) {
        toast.error('Swap requires a saved meal plan. Generate or save first.');
        return;
      }

      if (!recipeId) return;
      setSwapState(prev => ({ ...prev, applying: true }));

      try {
        const { data } = await axios.patch(
          `/api/meal-plans/${mealPlan._id}/days/${dayIndex}/meals/${mealIndex}`,
          { recipeId }
        );

        const updatedMeal = data?.meal;
        if (!updatedMeal) {
          throw new Error('No meal returned from update');
        }

        setMealPlan(prev => {
          if (!prev) return prev;
          const days = prev.days.map((day, idx) => {
            if (idx !== dayIndex) return day;
            const meals = day.meals.map((meal, idx) => (idx === mealIndex ? updatedMeal : meal));
            return { ...day, meals };
          });
          return { ...prev, days };
        });

        toast.success('Meal swapped');
        setSwapState({ key: null, options: [], loading: false, applying: false });
      } catch (error) {
        console.error('Error applying alternative:', error);
        toast.error('Failed to swap meal');
        setSwapState(prev => ({ ...prev, applying: false }));
      }
    },
    [mealPlan]
  );

  const handleCloseSwap = React.useCallback(() => {
    setSwapState({ key: null, options: [], loading: false, applying: false });
  }, []);

  if (loading) {
    return (
      <Container>
        <EmptyState>
          <EmptyTitle>Loading...</EmptyTitle>
          <EmptyDescription>
            Loading your meal plan details...
          </EmptyDescription>
        </EmptyState>
      </Container>
    );
  }

  if (!mealPlan) {
    return (
      <Container>
        <EmptyState>
          <EmptyTitle>Meal Plan Not Found</EmptyTitle>
          <EmptyDescription>
            The meal plan you're looking for doesn't exist or has been removed.
          </EmptyDescription>
        </EmptyState>
      </Container>
    );
  }

  const totalDays = mealPlan.days?.length || 0;
  const totalMeals = mealPlan.days?.reduce((acc, day) => acc + day.meals.length, 0) || 0;
  const avgCalories = 420; // Would calculate from actual data

  const getMealIcon = (mealType) => {
    switch (mealType) {
      case 'breakfast': return <Utensils size={16} />;
      case 'lunch': return <ChefHat size={16} />;
      case 'dinner': return <Target size={16} />;
      case 'snack': return <Zap size={16} />;
      default: return <Utensils size={16} />;
    }
  };

  const formatIngredient = (ingredient) => {
    if (!ingredient || typeof ingredient !== 'object') {
      return '';
    }

    const amountParts = [];

    if (ingredient.amount) {
      amountParts.push(ingredient.amount);
    }

    if (ingredient.unit && !amountParts.includes(ingredient.unit)) {
      amountParts.push(ingredient.unit);
    }

    const amountText = amountParts.join(' ');
    const nameText = ingredient.name || '';
    const notesText = ingredient.notes ? ` (${ingredient.notes})` : '';

    return `${amountText ? `${amountText} ` : ''}${nameText}${notesText}`.trim();
  };

  return (
    <Container>
      <Header>
        <BackButton onClick={() => navigate('/meal-plans')}>
          <ArrowLeft size={20} />
        </BackButton>
        <HeaderContent>
          <Title>{mealPlan.title}</Title>
          <Subtitle>{mealPlan.description}</Subtitle>
        </HeaderContent>
        <ActionButtons>
          <ActionButton
            $primary={!isActive}
            onClick={handleToggleActive}
          >
            <Target size={16} />
            {isActive ? 'Deactivate Plan' : 'Set as Active'}
          </ActionButton>
          <ActionButton>
            <Share2 size={16} />
            Share
          </ActionButton>
          <ActionButton>
            <Download size={16} />
            Export
          </ActionButton>
          <ActionButton $primary>
            <ShoppingCart size={16} />
            Shopping List
          </ActionButton>
        </ActionButtons>
      </Header>

      <OverviewGrid>
        <OverviewCard>
          <OverviewIcon $bgColor="#dbeafe" $iconColor="#2563eb">
            <Calendar size={24} />
          </OverviewIcon>
          <OverviewValue>{totalDays}</OverviewValue>
          <OverviewLabel>Days</OverviewLabel>
        </OverviewCard>
        <OverviewCard>
          <OverviewIcon $bgColor="#dcfce7" $iconColor="#16a34a">
            <Utensils size={24} />
          </OverviewIcon>
          <OverviewValue>{totalMeals}</OverviewValue>
          <OverviewLabel>Meals</OverviewLabel>
        </OverviewCard>
        <OverviewCard>
          <OverviewIcon $bgColor="#fef3c7" $iconColor="#d97706">
            <Target size={24} />
          </OverviewIcon>
          <OverviewValue>{avgCalories}</OverviewValue>
          <OverviewLabel>Avg Calories</OverviewLabel>
        </OverviewCard>
        <OverviewCard>
          <OverviewIcon $bgColor="#f3e8ff" $iconColor="#9333ea">
            <Users size={24} />
          </OverviewIcon>
          <OverviewValue>1</OverviewValue>
          <OverviewLabel>Servings</OverviewLabel>
        </OverviewCard>
      </OverviewGrid>

      <DaysGrid>
        {mealPlan.days?.map((day, index) => (
          <DayCard
            key={day.date}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <DayHeader>
              <DayTitle>Day {index + 1}</DayTitle>
              <DayDate>{new Date(day.date).toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
              })}</DayDate>
            </DayHeader>
            <MealsList>
              {day.meals.map((meal, mealIndex) => {
                const mealId = meal.mealId || meal._id?.toString() || mealIndex;
                const mealKey = `${index}-${mealId}`;
                const isExpanded = expandedMeals.has(mealKey);
                const swapKey = swapKeyFor(index, mealIndex);
                const isSwapOpen = swapState.key === swapKey;

                return (
                  <MealItem
                    key={mealId}
                    $completed={meal.isCompleted}
                    $expanded={isExpanded}
                  >
                    <MealHeader>
                      <MealHeaderLeft>
                        <MealToggleButton
                          type="button"
                          onClick={() => toggleMealExpansion(index, mealId)}
                          aria-expanded={isExpanded}
                        >
                          <MealExpandIcon $expanded={isExpanded}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </MealExpandIcon>
                          <MealType $completed={meal.isCompleted}>
                            {getMealIcon(meal.type)}
                            {meal.type.charAt(0).toUpperCase() + meal.type.slice(1)}
                          </MealType>
                          <MealTime>
                            <Clock size={14} />
                            {meal.scheduledTime || '--:--'}
                          </MealTime>
                          {meal.isCompleted && (
                            <MealStatusBadge>
                              <CheckCircle size={12} />
                              Completed
                            </MealStatusBadge>
                          )}
                        </MealToggleButton>
                      </MealHeaderLeft>
                      <MealActions>
                        <MealActionButton
                          type="button"
                          onClick={() => handleToggleMealCompletion(index, mealId)}
                          aria-label={meal.isCompleted ? 'Mark meal as pending' : 'Mark meal as completed'}
                          title={meal.isCompleted ? 'Mark meal as pending' : 'Mark meal as completed'}
                          $completed={meal.isCompleted}
                        >
                          {meal.isCompleted ? <CheckCircle size={16} /> : <Circle size={16} />}
                        </MealActionButton>
                        <MealActionButton
                          type="button"
                          onClick={() => (isSwapOpen ? handleCloseSwap() : handleFetchAlternatives(index, mealIndex))}
                          aria-label="Swap meal"
                          title="Swap meal"
                          disabled={swapState.loading && isSwapOpen}
                        >
                          {isSwapOpen && (swapState.loading || swapState.applying) ? (
                            <SpinnerIcon size={16} />
                          ) : (
                            <RefreshCw size={16} />
                          )}
                        </MealActionButton>
                        <MealActionButton
                          type="button"
                          onClick={() => handleDeleteMeal(index, mealId)}
                          aria-label="Remove meal"
                          title="Remove meal"
                          $danger
                        >
                          <Trash2 size={16} />
                        </MealActionButton>
                      </MealActions>
                    </MealHeader>
                    <RecipesList>
                      {meal.recipes.map((recipe, recipeIndex) => {
                        const totalTime = (Number(recipe.prepTime) || 0) + (Number(recipe.cookTime) || 0);

                        return (
                          <RecipeItem key={recipeIndex}>
                            <RecipeName>{recipe.name}</RecipeName>
                            <RecipeDescription>{recipe.description}</RecipeDescription>
                            <RecipeMeta>
                              <MetaItem>
                                <Clock size={12} />
                                {totalTime} min
                              </MetaItem>
                              <MetaItem>
                                <Users size={12} />
                                {recipe.servings} serving{recipe.servings > 1 ? 's' : ''}
                              </MetaItem>
                              <MetaItem>
                                <Target size={12} />
                                {recipe.nutrition.calories} cal
                              </MetaItem>
                            </RecipeMeta>
                            {recipe.nutrition && (
                              <NutritionInfo>
                                <NutritionTitle>
                                  <Target size={14} />
                                  Nutrition (per serving)
                                </NutritionTitle>
                                <NutritionGrid>
                                  <NutritionItem>
                                    <NutritionValue>{recipe.nutrition.calories}</NutritionValue>
                                    <NutritionLabel>Calories</NutritionLabel>
                                  </NutritionItem>
                                  <NutritionItem>
                                    <NutritionValue>{recipe.nutrition.protein}g</NutritionValue>
                                    <NutritionLabel>Protein</NutritionLabel>
                                  </NutritionItem>
                                  <NutritionItem>
                                    <NutritionValue>{recipe.nutrition.carbs}g</NutritionValue>
                                    <NutritionLabel>Carbs</NutritionLabel>
                                  </NutritionItem>
                                  <NutritionItem>
                                    <NutritionValue>{recipe.nutrition.fat}g</NutritionValue>
                                    <NutritionLabel>Fat</NutritionLabel>
                                  </NutritionItem>
                                </NutritionGrid>
                              </NutritionInfo>
                            )}
                            {isExpanded && recipe.ingredients?.length > 0 && (
                              <RecipeSection>
                                <SectionTitle>
                                  <ShoppingCart size={14} />
                                  Shopping List
                                </SectionTitle>
                                <ShoppingList>
                                  {recipe.ingredients.map((ingredient, ingredientIndex) => {
                                    const ingredientLabel = formatIngredient(ingredient);
                                    if (!ingredientLabel) {
                                      return null;
                                    }

                                    return (
                                      <ShoppingListItem key={`${ingredient?.name || 'ingredient'}-${ingredientIndex}`}>
                                        {ingredientLabel}
                                      </ShoppingListItem>
                                    );
                                  })}
                                </ShoppingList>
                              </RecipeSection>
                            )}
                            {isExpanded && recipe.instructions?.length > 0 && (
                              <RecipeSection>
                                <SectionTitle>
                                  <ChefHat size={14} />
                                  Instructions
                                </SectionTitle>
                                <InstructionList>
                                  {recipe.instructions.map((step, stepIndex) => {
                                    const stepText = typeof step === 'string' ? step.trim() : '';
                                    if (!stepText) {
                                      return null;
                                    }

                                    return (
                                      <InstructionItem key={stepIndex}>{stepText}</InstructionItem>
                                    );
                                  })}
                                </InstructionList>
                              </RecipeSection>
                            )}
                          </RecipeItem>
                        );
                      })}
                    </RecipesList>
                    {isSwapOpen && (
                      <SwapPanel>
                        <SwapHeader>
                          Meal alternatives
                          <SwapActions>
                            {swapState.loading && <SpinnerIcon size={16} />}
                            <SwapCloseButton type="button" onClick={handleCloseSwap}>
                              Close
                            </SwapCloseButton>
                          </SwapActions>
                        </SwapHeader>
                        {swapState.loading ? (
                          <div>Loading alternatives...</div>
                        ) : (
                          <>
                            <AlternativeList>
                              {swapState.options.map(option => (
                                <AlternativeCard
                                  key={option.id}
                                  type="button"
                                  onClick={() => handleApplyAlternative(index, mealIndex, option.id)}
                                  disabled={swapState.applying}
                                >
                                  <AlternativeTitle>
                                    {option.title || 'Untitled recipe'}
                                  </AlternativeTitle>
                                  <AlternativeMeta>
                                    {option.cuisine && <Badge>{option.cuisine}</Badge>}
                                    {option.calories ? <Badge>{option.calories} cal</Badge> : null}
                                    {option.protein_grams ? <Badge>{option.protein_grams}g protein</Badge> : null}
                                    {option.prep_time_minutes ? (
                                      <Badge>{option.prep_time_minutes} min</Badge>
                                    ) : null}
                                  </AlternativeMeta>
                                </AlternativeCard>
                              ))}
                            </AlternativeList>
                            {!swapState.options.length && (
                              <div>No alternatives found for this meal type.</div>
                            )}
                          </>
                        )}
                      </SwapPanel>
                    )}
                  </MealItem>
                );
              })}
            </MealsList>
          </DayCard>
        ))}
      </DaysGrid>
    </Container>
  );
};

export default MealPlanDetail;
