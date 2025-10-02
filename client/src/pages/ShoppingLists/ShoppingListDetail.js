import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  CheckCircle,
  Circle,
  Trash2,
  DollarSign,
  MapPin,
  Calendar,
  Loader,
  Save,
  X
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
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const BackButton = styled(motion.button)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: ${props => props.theme.colors.gray[100]};
  border: none;
  border-radius: ${props => props.theme.borderRadius.md};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
  }
`;

const HeaderContent = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  word-break: break-word;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const MetaInfo = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.gray[600]};
  flex-wrap: wrap;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const StatusBadge = styled.span`
  padding: 0.5rem 1rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.875rem;
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

const ActionButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const ActionButton = styled(motion.button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: ${props => props.$variant === 'primary' 
    ? props.theme.colors.primary[600] 
    : props.theme.colors.gray[100]};
  color: ${props => props.$variant === 'primary' 
    ? 'white' 
    : props.theme.colors.gray[700]};
  border: none;
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.$variant === 'primary' 
      ? props.theme.colors.primary[700] 
      : props.theme.colors.gray[200]};
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
  }

  @media (max-width: 480px) {
    flex: 1 1 100%;
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ItemsCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 1.5rem;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const CardTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
`;

const ItemsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
`;

const ItemCard = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: ${props => props.$purchased 
    ? props.theme.colors.success[50] 
    : props.theme.colors.gray[50]};
  border: 1px solid ${props => props.$purchased 
    ? props.theme.colors.success[200] 
    : props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  transition: all 0.2s ease;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 0.75rem;
  }
`;

const ItemCheckbox = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${props => props.$purchased 
    ? props.theme.colors.success[600] 
    : props.theme.colors.gray[400]};
`;

const ItemInfo = styled.div`
  flex: 1 1 200px;
  min-width: 0;

  @media (max-width: 768px) {
    flex: 1 1 100%;
  }
`;

const ItemName = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.$purchased 
    ? props.theme.colors.gray[500] 
    : props.theme.colors.gray[800]};
  margin: 0 0 0.25rem 0;
  text-decoration: ${props => props.$purchased ? 'line-through' : 'none'};
`;

const ItemDetails = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.gray[600]};
  flex-wrap: wrap;
`;

const ItemActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ItemButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: ${props => props.theme.borderRadius.sm};
  cursor: pointer;
  color: ${props => props.theme.colors.gray[500]};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[100]};
    color: ${props => props.theme.colors.gray[700]};
  }

  &.delete:hover {
    background: ${props => props.theme.colors.error[100]};
    color: ${props => props.theme.colors.error[600]};
  }
`;

const SummaryCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 1.5rem;
  height: fit-content;
`;

const SummaryItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid ${props => props.theme.colors.gray[100]};

  &:last-child {
    border-bottom: none;
    font-weight: 600;
    font-size: 1.1rem;
  }
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: ${props => props.theme.colors.gray[200]};
  border-radius: 4px;
  overflow: hidden;
  margin: 1rem 0;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: ${props => props.theme.colors.primary[500]};
  width: ${props => props.$progress}%;
  transition: width 0.3s ease;
`;

const AddItemForm = styled(motion.div)`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: ${props => props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  flex-wrap: wrap;
`;

const FormInput = styled.input`
  flex: 1;
  padding: 0.75rem;
  border: 1px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius.sm};
  font-size: 0.875rem;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
  }
`;

const FormButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  border: none;
  border-radius: ${props => props.theme.borderRadius.sm};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.primary[700]};
  }

  &.cancel {
    background: ${props => props.theme.colors.gray[500]};

    &:hover {
      background: ${props => props.theme.colors.gray[600]};
    }
  }

  @media (max-width: 768px) {
    width: 100%;
    height: 48px;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: ${props => props.theme.colors.gray[500]};
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

const ShoppingListDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shoppingList, setShoppingList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    amount: '',
    unit: ''
  });

  const fetchShoppingList = useCallback(async () => {
    try {
      const response = await axios.get(`/api/shopping-lists/${id}`);
      setShoppingList(response.data.shoppingList);
    } catch (error) {
      console.error('Error fetching shopping list:', error);
      toast.error('Failed to load shopping list');
      navigate('/shopping-lists');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchShoppingList();
  }, [fetchShoppingList]);

  const handleToggleItem = async (itemId, purchased) => {
    try {
      await axios.put(`/api/shopping-lists/${id}/items/${itemId}`, {
        purchased: !purchased
      });
      setShoppingList(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item._id === itemId ? { ...item, purchased: !purchased } : item
        )
      }));
      toast.success(`Item ${!purchased ? 'marked as purchased' : 'marked as unpurchased'}`);
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Failed to update item');
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim() || !newItem.amount.trim() || !newItem.unit.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      const response = await axios.post(`/api/shopping-lists/${id}/items`, newItem);
      setShoppingList(prev => ({
        ...prev,
        items: [...prev.items, response.data.item]
      }));
      setNewItem({ name: '', amount: '', unit: '' });
      setShowAddForm(false);
      toast.success('Item added successfully');
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Failed to add item');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;

    try {
      await axios.delete(`/api/shopping-lists/${id}/items/${itemId}`);
      setShoppingList(prev => ({
        ...prev,
        items: prev.items.filter(item => item._id !== itemId)
      }));
      toast.success('Item deleted successfully');
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  };

  const handleToggleAll = async (purchased) => {
    try {
      await axios.put(`/api/shopping-lists/${id}/toggle-all`, { purchased });
      setShoppingList(prev => ({
        ...prev,
        items: prev.items.map(item => ({ ...item, purchased }))
      }));
      toast.success(`All items marked as ${purchased ? 'purchased' : 'unpurchased'}`);
    } catch (error) {
      console.error('Error updating items:', error);
      toast.error('Failed to update items');
    }
  };

  const handleUpdateStatus = async (status) => {
    try {
      await axios.put(`/api/shopping-lists/${id}`, { status });
      setShoppingList(prev => ({ ...prev, status }));
      toast.success(`Status updated to ${status}`);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const getProgress = () => {
    if (!shoppingList?.items || shoppingList.items.length === 0) return 0;
    const purchased = shoppingList.items.filter(item => item.purchased).length;
    return Math.round((purchased / shoppingList.items.length) * 100);
  };


  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Container>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader size={32} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
          <p>Loading shopping list...</p>
        </div>
      </Container>
    );
  }

  if (!shoppingList) {
    return (
      <Container>
        <EmptyState>
          <EmptyTitle>Shopping List Not Found</EmptyTitle>
          <EmptyDescription>
            The shopping list you're looking for doesn't exist or has been removed.
          </EmptyDescription>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton
          onClick={() => navigate('/shopping-lists')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft size={20} />
        </BackButton>
        <HeaderContent>
          <Title>
            <ShoppingCart size={32} />
            {shoppingList.title}
          </Title>
          <MetaInfo>
            <MetaItem>
              <Calendar size={16} />
              Created {formatDate(shoppingList.createdAt)}
            </MetaItem>
            {shoppingList.store && (
              <MetaItem>
                <MapPin size={16} />
                {shoppingList.store}
              </MetaItem>
            )}
            {shoppingList.totalEstimatedCost && (
              <MetaItem>
                <DollarSign size={16} />
                ${shoppingList.totalEstimatedCost}
              </MetaItem>
            )}
          </MetaInfo>
        </HeaderContent>
        <StatusBadge $status={shoppingList.status}>
          {shoppingList.status}
        </StatusBadge>
        <ActionButtons>
          <ActionButton
            $variant="secondary"
            onClick={() => handleToggleAll(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <CheckCircle size={16} />
            Mark All Done
          </ActionButton>
          <ActionButton
            $variant="primary"
            onClick={() => setShowAddForm(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={16} />
            Add Item
          </ActionButton>
        </ActionButtons>
      </Header>

      <ContentGrid>
        <ItemsCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <CardHeader>
            <CardTitle>Items ({shoppingList.items?.length || 0})</CardTitle>
            {shoppingList.items && shoppingList.items.length > 0 && (
              <ActionButton
                $variant="secondary"
                onClick={() => handleToggleAll(false)}
                style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
              >
                Reset All
              </ActionButton>
            )}
          </CardHeader>

          {showAddForm && (
            <AddItemForm
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <FormInput
                type="text"
                placeholder="Item name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
              <FormInput
                type="text"
                placeholder="Amount"
                value={newItem.amount}
                onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })}
              />
              <FormInput
                type="text"
                placeholder="Unit"
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              />
              <FormButton onClick={handleAddItem}>
                <Save size={16} />
              </FormButton>
              <FormButton
                className="cancel"
                onClick={() => {
                  setShowAddForm(false);
                  setNewItem({ name: '', amount: '', unit: '' });
                }}
              >
                <X size={16} />
              </FormButton>
            </AddItemForm>
          )}

          {shoppingList.items && shoppingList.items.length > 0 ? (
            <ItemsList>
              <AnimatePresence>
                {shoppingList.items.map((item, index) => (
                  <ItemCard
                    key={item._id}
                    $purchased={item.purchased}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <ItemCheckbox
                      $purchased={item.purchased}
                      onClick={() => handleToggleItem(item._id, item.purchased)}
                    >
                      {item.purchased ? <CheckCircle size={20} /> : <Circle size={20} />}
                    </ItemCheckbox>
                    <ItemInfo>
                      <ItemName $purchased={item.purchased}>
                        {item.name}
                      </ItemName>
                      <ItemDetails>
                        <span>{item.amount} {item.unit}</span>
                        {item.category && <span>• {item.category}</span>}
                        {item.estimatedPrice && <span>• ${item.estimatedPrice}</span>}
                      </ItemDetails>
                    </ItemInfo>
                    <ItemActions>
                      <ItemButton onClick={() => handleDeleteItem(item._id)}>
                        <Trash2 size={16} />
                      </ItemButton>
                    </ItemActions>
                  </ItemCard>
                ))}
              </AnimatePresence>
            </ItemsList>
          ) : (
            <EmptyState>
              <EmptyTitle>No Items Yet</EmptyTitle>
              <EmptyDescription>
                Add items to your shopping list to get started.
              </EmptyDescription>
            </EmptyState>
          )}
        </ItemsCard>

        <SummaryCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <CardTitle>Summary</CardTitle>
          
          <SummaryItem>
            <span>Total Items</span>
            <span>{shoppingList.items?.length || 0}</span>
          </SummaryItem>
          
          <SummaryItem>
            <span>Completed</span>
            <span>{shoppingList.items?.filter(item => item.purchased).length || 0}</span>
          </SummaryItem>
          
          <ProgressBar>
            <ProgressFill $progress={getProgress()} />
          </ProgressBar>
          
          <SummaryItem>
            <span>Progress</span>
            <span>{getProgress()}%</span>
          </SummaryItem>
          
          {shoppingList.totalEstimatedCost && (
            <SummaryItem>
              <span>Estimated Cost</span>
              <span>${shoppingList.totalEstimatedCost}</span>
            </SummaryItem>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#374151' }}>
              Status Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {shoppingList.status !== 'draft' && (
                <ActionButton
                  $variant="secondary"
                  onClick={() => handleUpdateStatus('draft')}
                  style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                >
                  Mark as Draft
                </ActionButton>
              )}
              {shoppingList.status !== 'active' && (
                <ActionButton
                  $variant="secondary"
                  onClick={() => handleUpdateStatus('active')}
                  style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                >
                  Mark as Active
                </ActionButton>
              )}
              {shoppingList.status !== 'completed' && (
                <ActionButton
                  $variant="secondary"
                  onClick={() => handleUpdateStatus('completed')}
                  style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                >
                  Mark as Completed
                </ActionButton>
              )}
            </div>
          </div>
        </SummaryCard>
      </ContentGrid>
    </Container>
  );
};

export default ShoppingListDetail;
