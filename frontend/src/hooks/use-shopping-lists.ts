import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getShoppingLists, createShoppingList, updateShoppingListItem, deleteShoppingList, updateShoppingList } from '@/lib/api';

export function useShoppingLists() {
  const query = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
    placeholderData: [],
    refetchOnMount: 'always',
  });

  const list = (Array.isArray(query.data) ? query.data : []).map(list => ({
    ...list,
    title: list.title || 'Untitled list',
    description: list.description || '',
    status: list.status || 'draft',
    // Normalize items so the UI can always show name/amount/unit/category/price
    items: (Array.isArray(list.items) ? list.items : []).map((item) => ({
      ...item,
      name: item.name || 'Unknown item',
      amount: item.amount ?? item.quantity ?? '',
      unit: item.unit || '',
      category: item.category || 'other',
      storeSection: item.storeSection || item.category || 'other',
      purchased: Boolean(item.purchased),
      estimatedPrice: typeof item.estimatedPrice === 'number' 
        ? item.estimatedPrice 
        : typeof item.price === 'number' 
          ? item.price 
          : undefined,
      price: typeof item.price === 'number' 
        ? item.price 
        : typeof item.estimatedPrice === 'number' 
          ? item.estimatedPrice 
          : undefined,
    })),
  }));

  return { ...query, data: list };
}

export function useCreateShoppingList() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { 
      title: string; 
      description?: string; 
      items?: { name: string; quantity: string; category: string; purchased: boolean; price: number }[];
      status?: 'draft' | 'active' | 'completed';
    }) => 
      createShoppingList({
        title: data.title,
        description: data.description,
        items: data.items || [],
        status: data.status || 'draft',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });
}

export function useUpdateShoppingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateShoppingListItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });
}

export function useUpdateShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, data }: { listId: string; data: Partial<any> }) =>
      updateShoppingList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });
}

export function useDeleteShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteShoppingList,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });
}
