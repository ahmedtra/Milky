import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Sparkles, 
  Clock, 
  Target,
  Loader
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ensureMealPlanMetadata,
  ensureMealPlansMetadata,
  loadMealPlans,
  saveMealPlans
} from '../../utils/mealPlanStorage';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const GenerateButton = styled(motion.button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  border: none;
  border-radius: ${props => props.theme.borderRadius.lg};
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.primary[700]};
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.lg};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const FormCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 2rem;
`;

const MealPlansCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 2rem;
`;

const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0 0 1.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 500;
  color: ${props => props.theme.colors.gray[700]};
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary[100]};
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary[100]};
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  resize: vertical;
  min-height: 100px;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary[100]};
  }
`;

const DurationSelector = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 0.5rem;
`;

const DurationButton = styled.button`
  padding: 0.75rem 1rem;
  border: 2px solid ${props => props.$selected ? props.theme.colors.primary[500] : props.theme.colors.gray[200]};
  background: ${props => props.$selected ? props.theme.colors.primary[50] : 'white'};
  color: ${props => props.$selected ? props.theme.colors.primary[700] : props.theme.colors.gray[700]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.primary[500]};
    background: ${props => props.theme.colors.primary[50]};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: ${props => props.theme.colors.gray[500]};
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  background: ${props => props.theme.colors.gray[100]};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.colors.gray[400]};
`;

const EmptyTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin: 0 0 0.5rem 0;
`;

const EmptyDescription = styled.p`
  margin: 0;
  line-height: 1.6;
`;

const MealPlanList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MealPlanItem = styled(motion.div)`
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.primary[300]};
    box-shadow: ${props => props.theme.shadows.sm};
    transform: translateY(-2px);
  }
`;

const MealPlanHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
`;

const MealPlanTitle = styled.h4`
  font-size: 1.1rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
`;

const MealPlanDate = styled.div`
  font-size: 0.9rem;
  color: ${props => props.theme.colors.gray[500]};
`;

const ActiveBadge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${props => props.theme.colors.primary[100]};
  color: ${props => props.theme.colors.primary[700]};
`;

const MealPlanDescription = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  margin: 0 0 1rem 0;
  line-height: 1.5;
`;

const MealPlanStats = styled.div`
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  color: ${props => props.theme.colors.gray[500]};
`;

const Stat = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const LoadingOverlay = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: ${props => props.theme.borderRadius.lg};
  z-index: 10;

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.div`
  margin-top: 1rem;
  font-weight: 500;
  color: ${props => props.theme.colors.gray[700]};
`;

const MealPlans = () => {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState({
    dietType: 'balanced',
    allergies: '',
    dislikedFoods: '',
    goals: 'maintain_weight',
    activityLevel: 'moderate',
    mealTimes: {
      breakfast: '08:00',
      lunch: '13:00',
      dinner: '19:00'
    },
    duration: 5,
    additionalNotes: ''
  });

  const [mealPlans, setMealPlans] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load meal plans from localStorage on component mount
  React.useEffect(() => {
    const savedMealPlans = loadMealPlans();
    const activeMealPlanId = localStorage.getItem('activeMealPlanId');

    const normalizedPlans = savedMealPlans.map(plan => ({
      ...plan,
      isActive: activeMealPlanId
        ? plan.id?.toString() === activeMealPlanId
        : Boolean(plan.isActive)
    }));

    setMealPlans(normalizedPlans);

    // Persist normalized data so other parts of the app get the updated structure
    saveMealPlans(savedMealPlans);
  }, []);

  const handleInputChange = (field, value) => {
    setPreferences(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleMealTimeChange = (meal, time) => {
    setPreferences(prev => ({
      ...prev,
      mealTimes: {
        ...prev.mealTimes,
        [meal]: time
      }
    }));
  };

  const handleGenerateMealPlan = async () => {
    setIsGenerating(true);
    
    try {
      // Convert comma-separated strings to arrays for backend compatibility
      const processedPreferences = {
        ...preferences,
        allergies: preferences.allergies ? preferences.allergies.split(',').map(item => item.trim()).filter(item => item) : [],
        dislikedFoods: preferences.dislikedFoods ? preferences.dislikedFoods.split(',').map(item => item.trim()).filter(item => item) : []
      };

      const response = await axios.post('/api/gemini/generate-meal-plan', {
        preferences: processedPreferences,
        duration: preferences.duration
      });

      const newMealPlan = ensureMealPlanMetadata({
        id: Date.now(),
        ...response.data.mealPlan,
        createdAt: new Date().toISOString(),
        preferences: { ...preferences },
        isActive: false
      });

      setMealPlans(prev => [newMealPlan, ...prev]);
      
      // Save to localStorage for persistence
      const existingPlans = ensureMealPlansMetadata(mealPlans).map(plan => ({
        ...plan,
        isActive: plan.isActive || false
      }));
      const updatedMealPlans = [newMealPlan, ...existingPlans];
      saveMealPlans(updatedMealPlans);
      
      // Debug: Log the meal plan data
      console.log('Generated meal plan:', newMealPlan);
      console.log('Days count:', newMealPlan.days?.length);
      console.log('First day meals:', newMealPlan.days?.[0]?.meals?.length);
      
      toast.success('Meal plan generated successfully!');
    } catch (error) {
      console.error('Error generating meal plan:', error);
      toast.error('Failed to generate meal plan. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const durationOptions = [1, 2, 3, 5];

  return (
    <Container>
      <Header>
        <Title>
          <Calendar size={32} />
          Meal Plans
        </Title>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <GenerateButton
            onClick={handleGenerateMealPlan}
            disabled={isGenerating}
            whileHover={{ scale: isGenerating ? 1 : 1.02 }}
            whileTap={{ scale: isGenerating ? 1 : 0.98 }}
          >
            {isGenerating ? (
              <>
                <Loader size={20} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Generate Meal Plan
              </>
            )}
          </GenerateButton>
          <GenerateButton
            onClick={() => {
              localStorage.removeItem('mealPlans');
              localStorage.removeItem('activeMealPlanId');
              setMealPlans([]);
              toast.success('Meal plans cleared');
            }}
            style={{ background: '#ef4444' }}
          >
            Clear All Plans
          </GenerateButton>
        </div>
      </Header>

      <ContentGrid>
        <FormCard
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <CardTitle>
            <Target size={20} />
            Your Preferences
          </CardTitle>

          <FormGroup>
            <Label>Diet Type</Label>
            <Select
              value={preferences.dietType}
              onChange={(e) => handleInputChange('dietType', e.target.value)}
            >
              <option value="balanced">Balanced</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="keto">Keto</option>
              <option value="paleo">Paleo</option>
              <option value="low_carb">Low Carb</option>
              <option value="high_protein">High Protein</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Goals</Label>
            <Select
              value={preferences.goals}
              onChange={(e) => handleInputChange('goals', e.target.value)}
            >
              <option value="lose_weight">Lose Weight</option>
              <option value="gain_weight">Gain Weight</option>
              <option value="maintain_weight">Maintain Weight</option>
              <option value="build_muscle">Build Muscle</option>
              <option value="improve_health">Improve Health</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Activity Level</Label>
            <Select
              value={preferences.activityLevel}
              onChange={(e) => handleInputChange('activityLevel', e.target.value)}
            >
              <option value="sedentary">Sedentary</option>
              <option value="light">Light Activity</option>
              <option value="moderate">Moderate Activity</option>
              <option value="active">Active</option>
              <option value="very_active">Very Active</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Duration (Days)</Label>
            <DurationSelector>
              {durationOptions.map(duration => (
                <DurationButton
                  key={duration}
                  $selected={preferences.duration === duration}
                  onClick={() => handleInputChange('duration', duration)}
                >
                  {duration}
                </DurationButton>
              ))}
            </DurationSelector>
          </FormGroup>

          <FormGroup>
            <Label>Allergies</Label>
            <Input
              type="text"
              placeholder="e.g., nuts, shellfish, dairy"
              value={preferences.allergies}
              onChange={(e) => handleInputChange('allergies', e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label>Disliked Foods</Label>
            <Input
              type="text"
              placeholder="e.g., mushrooms, spicy food"
              value={preferences.dislikedFoods}
              onChange={(e) => handleInputChange('dislikedFoods', e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label>Meal Times</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <Label style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Breakfast</Label>
                <Input
                  type="time"
                  value={preferences.mealTimes.breakfast}
                  onChange={(e) => handleMealTimeChange('breakfast', e.target.value)}
                />
              </div>
              <div>
                <Label style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Lunch</Label>
                <Input
                  type="time"
                  value={preferences.mealTimes.lunch}
                  onChange={(e) => handleMealTimeChange('lunch', e.target.value)}
                />
              </div>
              <div>
                <Label style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Dinner</Label>
                <Input
                  type="time"
                  value={preferences.mealTimes.dinner}
                  onChange={(e) => handleMealTimeChange('dinner', e.target.value)}
                />
              </div>
            </div>
          </FormGroup>

          <FormGroup>
            <Label>Additional Notes</Label>
            <Textarea
              placeholder="Any specific requirements, preferences, or notes..."
              value={preferences.additionalNotes}
              onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
            />
          </FormGroup>
        </FormCard>

        <MealPlansCard
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          style={{ position: 'relative' }}
        >
          <CardTitle>
            <Calendar size={20} />
            Generated Meal Plans
          </CardTitle>

          {isGenerating && (
            <LoadingOverlay
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader size={48} className="animate-spin" color="#3b82f6" />
              <LoadingText>Generating your personalized meal plan...</LoadingText>
            </LoadingOverlay>
          )}

          <AnimatePresence>
            {mealPlans.length === 0 ? (
              <EmptyState>
                <EmptyIcon>
                  <Calendar size={32} />
                </EmptyIcon>
                <EmptyTitle>No Meal Plans Yet</EmptyTitle>
                <EmptyDescription>
                  Fill out your preferences and click "Generate Meal Plan" to create your first personalized meal plan.
                </EmptyDescription>
              </EmptyState>
            ) : (
              <MealPlanList>
                {mealPlans.map((mealPlan) => (
                  <MealPlanItem
                    key={mealPlan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => navigate(`/meal-plans/${mealPlan.id}`)}
                  >
                    <MealPlanHeader>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <MealPlanTitle>{mealPlan.title}</MealPlanTitle>
                        {mealPlan.isActive && <ActiveBadge>Active</ActiveBadge>}
                      </div>
                      <MealPlanDate>
                        {new Date(mealPlan.createdAt).toLocaleDateString()}
                      </MealPlanDate>
                    </MealPlanHeader>
                    
                    <MealPlanDescription>{mealPlan.description}</MealPlanDescription>
                    
                    <MealPlanStats>
                      <Stat>
                        <Calendar size={16} />
                        {mealPlan.days?.length || 0} days
                      </Stat>
                      <Stat>
                        <Clock size={16} />
                        {preferences.mealTimes.breakfast} - {preferences.mealTimes.dinner}
                      </Stat>
                      <Stat>
                        <Target size={16} />
                        {preferences.dietType}
                      </Stat>
                    </MealPlanStats>
                  </MealPlanItem>
                ))}
              </MealPlanList>
            )}
          </AnimatePresence>
        </MealPlansCard>
      </ContentGrid>
    </Container>
  );
};

export default MealPlans;
