import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, 
  Plus, 
  List, 
  Sparkles,
  Loader,
  Calendar,
  DollarSign,
  MapPin
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

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
  flex-wrap: wrap;
  gap: 1rem;
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

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const CreateButton = styled(motion.button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: ${props => props.$variant === 'secondary' 
    ? props.theme.colors.gray[100] 
    : props.theme.colors.primary[600]};
  color: ${props => props.$variant === 'secondary' 
    ? props.theme.colors.gray[700] 
    : 'white'};
  border: none;
  border-radius: ${props => props.theme.borderRadius.lg};
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$variant === 'secondary' 
      ? props.theme.colors.gray[200] 
      : props.theme.colors.primary[700]};
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.lg};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 768px) {
    flex: 1 1 calc(50% - 0.5rem);
    justify-content: center;
    font-size: 0.95rem;
    padding: 0.75rem 1rem;
  }

  @media (max-width: 480px) {
    flex: 1 1 100%;
  }
`;

const ShoppingListsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
  width: 100%;
`;

const ShoppingListCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.primary[300]};
    box-shadow: ${props => props.theme.shadows.lg};
    transform: translateY(-2px);
  }
`;

const ShoppingListHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const ShoppingListTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
  flex: 1;
`;

const StatusBadge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${props => {
    switch (props.$status) {
      case 'completed': return props.theme.colors.success[100];
      case 'active': return props.theme.colors.primary[100];
      default: return props.theme.colors.gray[100];
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'completed': return props.theme.colors.success[700];
      case 'active': return props.theme.colors.primary[700];
      default: return props.theme.colors.gray[600];
    }
  }};
`;

const ShoppingListMeta = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.gray[600]};
  flex-wrap: wrap;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const ShoppingListDescription = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  line-height: 1.5;
`;

const ShoppingListStats = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid ${props => props.theme.colors.gray[100]};
`;

const ItemCount = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.gray[600]};
`;

const ProgressBar = styled.div`
  width: 100px;
  height: 4px;
  background: ${props => props.theme.colors.gray[200]};
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${props => props.theme.colors.primary[500]};
  width: ${props => props.$progress}%;
  transition: width 0.3s ease;
`;

const ContentCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 2rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
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
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin: 0 0 1rem 0;
`;

const EmptyDescription = styled.p`
  margin: 0;
  line-height: 1.6;
`;

const Modal = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  color: ${props => props.theme.colors.gray[500]};
  cursor: pointer;
  padding: 0.5rem;
  border-radius: ${props => props.theme.borderRadius.md};

  &:hover {
    background: ${props => props.theme.colors.gray[100]};
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;

  ${props => props.$variant === 'primary' && `
    background: ${props.theme.colors.primary[600]};
    color: white;

    &:hover {
      background: ${props.theme.colors.primary[700]};
    }
  `}

  ${props => props.$variant === 'secondary' && `
    background: ${props.theme.colors.gray[100]};
    color: ${props.theme.colors.gray[700]};

    &:hover {
      background: ${props.theme.colors.gray[200]};
    }
  `}
`;

const ShoppingLists = () => {
  const navigate = useNavigate();
  const [shoppingLists, setShoppingLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newList, setNewList] = useState({
    title: '',
    description: '',
    store: ''
  });

  // Load shopping lists
  useEffect(() => {
    fetchShoppingLists();
  }, []);

  const fetchShoppingLists = async () => {
    try {
      const response = await axios.get('/api/shopping-lists');
      setShoppingLists(response.data.shoppingLists);
    } catch (error) {
      console.error('Error fetching shopping lists:', error);
      toast.error('Failed to load shopping lists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async () => {
    try {
      await axios.post('/api/shopping-lists', {
        ...newList,
        items: []
      });
      toast.success('Shopping list created successfully!');
      setShowCreateModal(false);
      setNewList({ title: '', description: '', store: '' });
      fetchShoppingLists();
    } catch (error) {
      console.error('Error creating shopping list:', error);
      toast.error('Failed to create shopping list');
    }
  };

  const handleGenerateFromMealPlan = async () => {
    setIsGenerating(true);
    try {
      // Get the most recent meal plan from localStorage
      const savedMealPlans = JSON.parse(localStorage.getItem('mealPlans') || '[]');
      if (savedMealPlans.length === 0) {
        toast.error('No meal plans found. Please create a meal plan first.');
        return;
      }

      const latestMealPlan = savedMealPlans[0];
      
      const response = await axios.post('/api/gemini/generate-shopping-list', {
        mealPlan: latestMealPlan
      });

      // Create shopping list with generated data
      await axios.post('/api/shopping-lists', {
        mealPlanId: latestMealPlan.id, // Include meal plan ID
        title: response.data.shoppingList.title,
        description: response.data.shoppingList.description,
        items: response.data.shoppingList.items,
        store: response.data.shoppingList.store,
        totalEstimatedCost: response.data.shoppingList.totalEstimatedCost
      });

      toast.success('Shopping list generated successfully!');
      setShowGenerateModal(false);
      fetchShoppingLists();
    } catch (error) {
      console.error('Error generating shopping list:', error);
      toast.error('Failed to generate shopping list');
    } finally {
      setIsGenerating(false);
    }
  };

  const getProgress = (items) => {
    if (!items || items.length === 0) return 0;
    const purchased = items.filter(item => item.purchased).length;
    return Math.round((purchased / items.length) * 100);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Container>
        <Header>
          <Title>
            <ShoppingCart size={32} />
            Shopping Lists
          </Title>
        </Header>
        <ContentCard>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader size={32} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
            <p>Loading shopping lists...</p>
          </div>
        </ContentCard>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>
          <ShoppingCart size={32} />
          Shopping Lists
        </Title>
        <ButtonGroup>
          <CreateButton
            $variant="secondary"
            onClick={() => setShowGenerateModal(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Sparkles size={20} />
            Generate from Meal Plan
          </CreateButton>
          <CreateButton
            onClick={() => setShowCreateModal(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={20} />
            Create List
          </CreateButton>
        </ButtonGroup>
      </Header>

      {shoppingLists.length === 0 ? (
        <ContentCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <EmptyState>
            <EmptyIcon>
              <List size={32} />
            </EmptyIcon>
            <EmptyTitle>No Shopping Lists Yet</EmptyTitle>
            <EmptyDescription>
              Create your first shopping list from a meal plan or start building one manually.
              Shopping lists help you stay organized and never forget ingredients!
            </EmptyDescription>
          </EmptyState>
        </ContentCard>
      ) : (
        <ShoppingListsGrid>
          <AnimatePresence>
            {shoppingLists.map((list, index) => (
              <ShoppingListCard
                key={list._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => navigate(`/shopping-lists/${list._id}`)}
              >
                <ShoppingListHeader>
                  <ShoppingListTitle>{list.title}</ShoppingListTitle>
                  <StatusBadge $status={list.status}>
                    {list.status}
                  </StatusBadge>
                </ShoppingListHeader>

                {list.description && (
                  <ShoppingListDescription>
                    {list.description}
                  </ShoppingListDescription>
                )}

                <ShoppingListMeta>
                  <MetaItem>
                    <Calendar size={14} />
                    {formatDate(list.createdAt)}
                  </MetaItem>
                  {list.store && (
                    <MetaItem>
                      <MapPin size={14} />
                      {list.store}
                    </MetaItem>
                  )}
                  {list.totalEstimatedCost && (
                    <MetaItem>
                      <DollarSign size={14} />
                      ${list.totalEstimatedCost}
                    </MetaItem>
                  )}
                </ShoppingListMeta>

                <ShoppingListStats>
                  <ItemCount>
                    {list.items?.length || 0} items
                  </ItemCount>
                  <ProgressBar>
                    <ProgressFill $progress={getProgress(list.items)} />
                  </ProgressBar>
                </ShoppingListStats>
              </ShoppingListCard>
            ))}
          </AnimatePresence>
        </ShoppingListsGrid>
      )}

      {/* Create List Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <Modal
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
          >
            <ModalContent
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <ModalHeader>
                <ModalTitle>Create Shopping List</ModalTitle>
                <CloseButton onClick={() => setShowCreateModal(false)}>
                  ×
                </CloseButton>
              </ModalHeader>

              <FormGroup>
                <Label>Title</Label>
                <Input
                  type="text"
                  value={newList.title}
                  onChange={(e) => setNewList({ ...newList, title: e.target.value })}
                  placeholder="Enter shopping list title"
                />
              </FormGroup>

              <FormGroup>
                <Label>Description (Optional)</Label>
                <TextArea
                  value={newList.description}
                  onChange={(e) => setNewList({ ...newList, description: e.target.value })}
                  placeholder="Enter description"
                />
              </FormGroup>

              <FormGroup>
                <Label>Store (Optional)</Label>
                <Input
                  type="text"
                  value={newList.store}
                  onChange={(e) => setNewList({ ...newList, store: e.target.value })}
                  placeholder="e.g., Whole Foods, Target"
                />
              </FormGroup>

              <ModalActions>
                <Button
                  $variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  $variant="primary"
                  onClick={handleCreateList}
                  disabled={!newList.title.trim()}
                >
                  Create List
                </Button>
              </ModalActions>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>

      {/* Generate from Meal Plan Modal */}
      <AnimatePresence>
        {showGenerateModal && (
          <Modal
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGenerateModal(false)}
          >
            <ModalContent
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <ModalHeader>
                <ModalTitle>Generate from Meal Plan</ModalTitle>
                <CloseButton onClick={() => setShowGenerateModal(false)}>
                  ×
                </CloseButton>
              </ModalHeader>

              <p style={{ marginBottom: '1.5rem', color: '#64748b' }}>
                Generate a shopping list from your most recent meal plan using AI.
                This will create a comprehensive list with all ingredients organized by store sections.
              </p>

              <ModalActions>
                <Button
                  $variant="secondary"
                  onClick={() => setShowGenerateModal(false)}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  $variant="primary"
                  onClick={handleGenerateFromMealPlan}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader size={16} className="animate-spin" style={{ marginRight: '0.5rem' }} />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} style={{ marginRight: '0.5rem' }} />
                      Generate List
                    </>
                  )}
                </Button>
              </ModalActions>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>
    </Container>
  );
};

export default ShoppingLists;
