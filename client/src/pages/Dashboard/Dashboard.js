import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Calendar,
  CheckCircle,
  Circle,
  Clock,
  MessageCircle,
  ShoppingCart,
  Target,
  Trash2,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
// Removed localStorage utilities - now using database API

const DashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const WelcomeSection = styled.div`
  background: linear-gradient(135deg, ${props => props.theme.colors.primary[600]} 0%, ${props => props.theme.colors.primary[800]} 100%);
  color: white;
  padding: 2rem;
  border-radius: ${props => props.theme.borderRadius.xl};
  box-shadow: ${props => props.theme.shadows.lg};
`;

const WelcomeTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

const WelcomeSubtitle = styled.p`
  font-size: 1.1rem;
  opacity: 0.9;
  margin-bottom: 1.5rem;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled(motion.div)`
  background: white;
  padding: 1.5rem;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
`;

const StatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const StatIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: ${props => props.theme.borderRadius.lg};
  background: ${props => props.$bgColor || props.theme.colors.primary[100]};
  color: ${props => props.$iconColor || props.theme.colors.primary[600]};
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
`;

const StatLabel = styled.div`
  font-size: 0.9rem;
  color: ${props => props.theme.colors.gray[600]};
  margin-top: 0.25rem;
`;

const StatChange = styled.div`
  font-size: 0.8rem;
  color: ${props => props.$positive ? props.theme.colors.success[600] : props.theme.colors.error[600]};
  margin-top: 0.25rem;
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const ContentCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  overflow: hidden;
`;

const CardHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
`;

const CardContent = styled.div`
  padding: 1.5rem;
`;

const MealsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MealRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: ${props => props.$completed ? props.theme.colors.success[50] : props.theme.colors.gray[50]};
  border: 1px solid
    ${props => props.$completed ? props.theme.colors.success[200] : props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  flex-wrap: wrap;
  transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  opacity: ${props => props.$completed ? 0.9 : 1};
`;

const MealTime = styled.span`
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  min-width: 80px;
`;

const MealInfo = styled.div`
  flex: 1 1 200px;
  min-width: 0;
`;

const MealTitle = styled.div`
  font-weight: 600;
  color: ${props => props.$completed ? props.theme.colors.success[800] : props.theme.colors.gray[800]};
  text-decoration: ${props => props.$completed ? 'line-through' : 'none'};
  margin-bottom: 0.25rem;
`;

const MealDescription = styled.div`
  font-size: 0.9rem;
  color: ${props => props.$completed ? props.theme.colors.success[700] : props.theme.colors.gray[600]};
`;

const MealStatusBadge = styled.span`
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.success[700]};
  background: ${props => props.theme.colors.success[100]};
  border: 1px solid ${props => props.theme.colors.success[200]};
  border-radius: ${props => props.theme.borderRadius.sm};
  padding: 0.25rem 0.5rem;
  margin-top: 0.5rem;
  display: inline-flex;
`;

const MealActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
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

const EmptyListState = styled.div`
  text-align: center;
  padding: 2rem 1rem;
  color: ${props => props.theme.colors.gray[500]};
`;

const TelegramStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: ${props => props.$connected ? props.theme.colors.success[50] : props.theme.colors.warning[50]};
  border: 1px solid ${props => props.$connected ? props.theme.colors.success[200] : props.theme.colors.warning[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  margin-bottom: 1rem;
`;

const StatusIndicator = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$connected ? props.theme.colors.success[500] : props.theme.colors.warning[500]};
`;

const StatusText = styled.div`
  font-size: 0.9rem;
  color: ${props => props.$connected ? props.theme.colors.success[700] : props.theme.colors.warning[700]};
`;

const LinkButton = styled.button`
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  padding: 0.5rem 1rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.primary[700]};
  }
`;

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [shoppingLists, setShoppingLists] = React.useState([]);
  const [activeMealPlan, setActiveMealPlan] = React.useState(null);
  const [loadingMealPlan, setLoadingMealPlan] = React.useState(true);

  const loadActiveMealPlan = React.useCallback(async () => {
    if (typeof window === 'undefined') {
      setActiveMealPlan(null);
      setLoadingMealPlan(false);
      return;
    }

    setLoadingMealPlan(true);

    try {
      // Fetch active meal plan from database
      const response = await axios.get('/api/meal-plans');
      const plans = response.data || [];
      
      // Find the active plan (status: 'active') or use the most recent one
      let activePlan = plans.find(plan => plan.status === 'active');
      
      if (!activePlan && plans.length > 0) {
        // Sort by createdAt and get the most recent
        activePlan = plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      }

      setActiveMealPlan(activePlan ? {
        ...activePlan,
        id: activePlan._id || activePlan.id,
        isActive: activePlan.status === 'active'
      } : null);
    } catch (error) {
      console.error('Error loading active meal plan:', error);
      setActiveMealPlan(null);
    } finally {
      setLoadingMealPlan(false);
    }
  }, []);

  const applyActiveMealPlanUpdate = React.useCallback((updateFn) => {
    setActiveMealPlan(prevPlan => {
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

  React.useEffect(() => {
    const fetchShoppingLists = async () => {
      try {
        const response = await axios.get('/api/shopping-lists');
        setShoppingLists(response.data.shoppingLists || []);
      } catch (error) {
        console.error('Error loading shopping lists:', error);
      }
    };

    fetchShoppingLists();
  }, []);

  const handleToggleMealCompletion = React.useCallback(async (dayIndex, mealId) => {
    // Get current status before updating
    const currentMeal = activeMealPlan?.days?.[dayIndex]?.meals?.find(m => m.mealId === mealId);
    const currentStatus = currentMeal?.isCompleted || false;
    const newIsCompleted = !currentStatus;

    console.log(`🔄 Toggling meal: Current status = ${currentStatus}, New status = ${newIsCompleted}`);

    // Update locally for instant UI feedback
    applyActiveMealPlanUpdate(prev => {
      const targetDay = prev.days?.[dayIndex];
      if (!targetDay) {
        return prev;
      }

      const hasMeal = targetDay.meals?.some(meal => meal.mealId === mealId);
      if (!hasMeal) {
        return prev;
      }

      const updatedPlan = {
        ...prev,
        days: prev.days.map((day, idx) => {
          if (idx !== dayIndex) return day;
          return {
            ...day,
            meals: day.meals.map(meal =>
              meal.mealId === mealId
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
    if (activeMealPlan?._id) {
      try {
        const mealIndexInDay = activeMealPlan.days[dayIndex].meals.findIndex(m => m.mealId === mealId || m._id === mealId);
        if (mealIndexInDay !== -1) {
          console.log(`🔄 Syncing meal completion to backend: Plan ${activeMealPlan._id}, Day ${dayIndex}, Meal ${mealIndexInDay}, Completed: ${newIsCompleted}`);
          await axios.post(`/api/meal-plans/${activeMealPlan._id}/days/${dayIndex}/meals/${mealIndexInDay}/toggle`, {
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
      console.warn('⚠️ No MongoDB _id found for active meal plan, skipping backend sync. Generate a new meal plan to enable backend syncing.');
    }
  }, [applyActiveMealPlanUpdate, activeMealPlan]);

  const handleDeleteMeal = React.useCallback((dayIndex, mealId) => {
    if (typeof window !== 'undefined') {
      const shouldRemove = window.confirm('Remove this meal from your plan?');
      if (!shouldRemove) {
        return;
      }
    }

    applyActiveMealPlanUpdate(prev => {
      const targetDay = prev.days?.[dayIndex];
      if (!targetDay) {
        return prev;
      }

      const hasMeal = targetDay.meals?.some(meal => meal.mealId === mealId);
      if (!hasMeal) {
        return prev;
      }

      const updatedDays = prev.days.map((day, idx) => {
        if (idx !== dayIndex) return day;
        return {
          ...day,
          meals: day.meals.filter(meal => meal.mealId !== mealId)
        };
      });

      toast.success('Meal removed from plan');

      return {
        ...prev,
        days: updatedDays
      };
    });
  }, [applyActiveMealPlanUpdate]);

  React.useEffect(() => {
    loadActiveMealPlan();
  }, [loadActiveMealPlan]);

  // Removed localStorage storage event listener - now using database API
  // Meal plan updates are synced through API calls

  const completedCount = React.useMemo(
    () => shoppingLists.filter(list => list.status === 'completed').length,
    [shoppingLists]
  );
  const activeCount = React.useMemo(
    () => shoppingLists.filter(list => list.status === 'active').length,
    [shoppingLists]
  );

  const todayContext = React.useMemo(() => {
    if (!activeMealPlan || !Array.isArray(activeMealPlan.days) || !activeMealPlan.days.length) {
      return null;
    }

    const todayIso = new Date().toISOString().split('T')[0];
    let dayIndex = activeMealPlan.days.findIndex(day => day.date === todayIso);

    if (dayIndex === -1) {
      dayIndex = 0;
    }

    const day = activeMealPlan.days[dayIndex];
    if (!day || !Array.isArray(day.meals)) {
      return null;
    }

    return { day, index: dayIndex };
  }, [activeMealPlan]);

  const todaysMeals = React.useMemo(() => {
    if (!todayContext) {
      return [];
    }

    const { day, index: dayIndex } = todayContext;

    return day.meals.map((meal, index) => {
      const primaryRecipe = meal.recipes?.[0] || {};

      return {
        id: meal.mealId || meal._id || `${meal.type || 'meal'}-${index}`,
        mealId: meal.mealId,
        dayIndex,
        type: meal.type,
        isCompleted: Boolean(meal.isCompleted),
        time: meal.scheduledTime || '--:--',
        title: primaryRecipe.name || (meal.type ? `${meal.type.charAt(0).toUpperCase()}${meal.type.slice(1)}` : 'Meal'),
        description: primaryRecipe.description || '',
      };
    });
  }, [todayContext]);

  const todaysDateLabel = React.useMemo(() => {
    if (!todayContext || !todayContext.day?.date) {
      return null;
    }

    return new Date(todayContext.day.date).toLocaleDateString();
  }, [todayContext]);

  const stats = [
    {
      icon: ShoppingCart,
      label: 'Shopping Lists',
      value: shoppingLists.length.toString(),
      change: activeCount ? `${activeCount} active` : 'No active lists',
      positive: Boolean(activeCount),
      bgColor: '#dcfce7',
      iconColor: '#16a34a'
    },
    {
      icon: Calendar,
      label: 'Active Meal Plan',
      value: activeMealPlan ? (todaysMeals.length ? `${todaysMeals.length} meals` : 'Active') : 'None',
      change: activeMealPlan ? (todaysDateLabel ? `Today: ${todaysDateLabel}` : 'Meals scheduled') : 'Set a plan active',
      positive: Boolean(activeMealPlan),
      bgColor: '#dbeafe',
      iconColor: '#2563eb'
    },
    {
      icon: MessageCircle,
      label: 'AI Conversations',
      value: '—',
      change: 'Start a chat',
      positive: true,
      bgColor: '#fef3c7',
      iconColor: '#d97706'
    },
    {
      icon: TrendingUp,
      label: 'Completed Lists',
      value: completedCount.toString(),
      change: completedCount ? 'Great progress!' : 'Finish a list to track progress',
      positive: Boolean(completedCount),
      bgColor: '#f3e8ff',
      iconColor: '#9333ea'
    }
  ];

  const isTelegramConnected = !!user?.telegramChatId;
  const handleTelegramButton = () => {
    navigate('/settings');
  };

  return (
    <DashboardContainer>
      <WelcomeSection>
        <WelcomeTitle>Welcome back, {user?.username}! 👋</WelcomeTitle>
        <WelcomeSubtitle>
          Ready to continue your healthy eating journey? Let's check what's planned for today.
        </WelcomeSubtitle>
        <QuickActions>
          <ActionButton onClick={() => navigate('/meal-plans')}>
            <Calendar size={16} />
            View Meal Plans
          </ActionButton>
          <ActionButton onClick={() => navigate('/chat')}>
            <MessageCircle size={16} />
            Chat with AI
          </ActionButton>
          <ActionButton onClick={() => navigate('/shopping-lists')}>
            <ShoppingCart size={16} />
            Shopping Lists
          </ActionButton>
        </QuickActions>
      </WelcomeSection>

      <StatsGrid>
        {stats.map((stat, index) => (
          <StatCard
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <StatHeader>
              <StatIcon $bgColor={stat.bgColor} $iconColor={stat.iconColor}>
                <stat.icon size={24} />
              </StatIcon>
            </StatHeader>
            <StatValue>{stat.value}</StatValue>
            <StatLabel>{stat.label}</StatLabel>
            <StatChange $positive={stat.positive}>{stat.change}</StatChange>
          </StatCard>
        ))}
      </StatsGrid>

      <ContentGrid>
        <ContentCard
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <CardHeader>
            <CardTitle>Today's Meals</CardTitle>
            <Clock size={20} color="#64748b" />
          </CardHeader>
          <CardContent>
            {loadingMealPlan ? (
              <EmptyListState>Loading meal plan...</EmptyListState>
            ) : !activeMealPlan ? (
              <EmptyListState>
                No active meal plan found. Set a meal plan as active to view today's meals.
              </EmptyListState>
            ) : todaysMeals.length === 0 ? (
              <EmptyListState>
                No meals scheduled for today in the active plan.
              </EmptyListState>
            ) : (
              <MealsContainer>
                {todaysDateLabel && (
                  <span style={{ color: '#64748b', fontWeight: 500 }}>
                    Meals for {todaysDateLabel}
                  </span>
                )}
                {todaysMeals.map(meal => (
                  <MealRow key={meal.id} $completed={meal.isCompleted}>
                    <MealTime>{meal.time}</MealTime>
                    <MealInfo>
                      <MealTitle $completed={meal.isCompleted}>{meal.title}</MealTitle>
                      {meal.description && (
                        <MealDescription $completed={meal.isCompleted}>
                          {meal.description}
                        </MealDescription>
                      )}
                      {meal.type && (
                        <MealDescription
                          $completed={meal.isCompleted}
                          style={{ fontStyle: 'italic', marginTop: '0.25rem' }}
                        >
                          {meal.type.charAt(0).toUpperCase() + meal.type.slice(1)}
                        </MealDescription>
                      )}
                      {meal.isCompleted && (
                        <MealStatusBadge>
                          <CheckCircle size={12} />
                          Completed
                        </MealStatusBadge>
                      )}
                    </MealInfo>
                    <MealActions>
                      <MealActionButton
                        type="button"
                        onClick={() => handleToggleMealCompletion(meal.dayIndex, meal.mealId)}
                        aria-label={meal.isCompleted ? 'Mark meal as pending' : 'Mark meal as completed'}
                        title={meal.isCompleted ? 'Mark meal as pending' : 'Mark meal as completed'}
                        $completed={meal.isCompleted}
                      >
                        {meal.isCompleted ? <CheckCircle size={16} /> : <Circle size={16} />}
                      </MealActionButton>
                      <MealActionButton
                        type="button"
                        onClick={() => handleDeleteMeal(meal.dayIndex, meal.mealId)}
                        aria-label="Remove meal"
                        title="Remove meal"
                        $danger
                      >
                        <Trash2 size={16} />
                      </MealActionButton>
                    </MealActions>
                  </MealRow>
                ))}
                <button
                  onClick={() => navigate(`/meal-plans/${activeMealPlan.id}`)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  View full meal plan
                </button>
              </MealsContainer>
            )}
          </CardContent>
        </ContentCard>

        <ContentCard
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <Target size={20} color="#64748b" />
          </CardHeader>
          <CardContent>
            <TelegramStatus $connected={isTelegramConnected}>
              <Bell size={16} />
              <StatusIndicator $connected={isTelegramConnected} />
              <StatusText $connected={isTelegramConnected}>
                {isTelegramConnected 
                  ? 'Telegram notifications enabled' 
                  : 'Connect Telegram for meal reminders'
                }
              </StatusText>
            </TelegramStatus>
            
            <LinkButton onClick={handleTelegramButton}>
              {isTelegramConnected ? 'Manage Telegram Notifications' : 'Connect Telegram'}
            </LinkButton>
          </CardContent>
        </ContentCard>
      </ContentGrid>
    </DashboardContainer>
  );
};

export default Dashboard;
