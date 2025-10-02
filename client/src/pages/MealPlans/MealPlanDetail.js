import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Users, 
  Utensils,
  ShoppingCart,
  Download,
  Share2,
  ChefHat,
  Target,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
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
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1.25rem;
`;

const MealHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const MealType = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
`;

const MealTime = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: ${props => props.theme.colors.gray[500]};
  font-size: 0.9rem;
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

  // Fetch the actual meal plan data from localStorage or state
  React.useEffect(() => {
    // Try to get the meal plan from localStorage first (from the MealPlans page)
    const savedMealPlans = JSON.parse(localStorage.getItem('mealPlans') || '[]');
    const foundMealPlan = savedMealPlans.find(plan => plan.id.toString() === id);
    
    if (foundMealPlan) {
      const activeMealPlanId = localStorage.getItem('activeMealPlanId');
      const planWithActive = {
        ...foundMealPlan,
        isActive: activeMealPlanId
          ? foundMealPlan.id.toString() === activeMealPlanId
          : Boolean(foundMealPlan.isActive)
      };
      setMealPlan(planWithActive);
      setIsActive(planWithActive.isActive);
    } else {
      // If not found in localStorage, try to get from session storage or show not found
      console.log('Meal plan not found with ID:', id);
      console.log('Available meal plans:', savedMealPlans);
      setIsActive(false);
    }
    setLoading(false);
  }, [id]);

  const handleToggleActive = () => {
    const savedMealPlans = JSON.parse(localStorage.getItem('mealPlans') || '[]');

    if (isActive) {
      const updatedPlans = savedMealPlans.map(plan => ({
        ...plan,
        isActive: plan.id.toString() === id ? false : plan.isActive
      }));

      localStorage.setItem('mealPlans', JSON.stringify(updatedPlans));
      localStorage.removeItem('activeMealPlanId');

      setMealPlan(prev => (prev ? { ...prev, isActive: false } : prev));
      setIsActive(false);
      toast.success('Meal plan deactivated');
    } else {
      const updatedPlans = savedMealPlans.map(plan => ({
        ...plan,
        isActive: plan.id.toString() === id
      }));

      localStorage.setItem('mealPlans', JSON.stringify(updatedPlans));
      localStorage.setItem('activeMealPlanId', id);

      setMealPlan(prev => (prev ? { ...prev, isActive: true } : prev));
      setIsActive(true);
      toast.success('Meal plan set as active');
    }
  };

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
              {day.meals.map((meal, mealIndex) => (
                <MealItem key={mealIndex}>
                  <MealHeader>
                    <MealType>
                      {getMealIcon(meal.type)}
                      {meal.type.charAt(0).toUpperCase() + meal.type.slice(1)}
                    </MealType>
                    <MealTime>
                      <Clock size={14} />
                      {meal.scheduledTime}
                    </MealTime>
                  </MealHeader>
                  <RecipesList>
                    {meal.recipes.map((recipe, recipeIndex) => (
                      <RecipeItem key={recipeIndex}>
                        <RecipeName>{recipe.name}</RecipeName>
                        <RecipeDescription>{recipe.description}</RecipeDescription>
                        <RecipeMeta>
                          <MetaItem>
                            <Clock size={12} />
                            {recipe.prepTime + recipe.cookTime} min
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
                      </RecipeItem>
                    ))}
                  </RecipesList>
                </MealItem>
              ))}
            </MealsList>
          </DayCard>
        ))}
      </DaysGrid>
    </Container>
  );
};

export default MealPlanDetail;
