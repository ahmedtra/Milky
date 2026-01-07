import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Plus, Check, ShoppingCart, Loader2, 
  Package, DollarSign, CheckCircle, ChefHat, Trash2 
} from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useShoppingLists, useCreateShoppingList, useUpdateShoppingItem, useDeleteShoppingList, useUpdateShoppingList } from "@/hooks/use-shopping-lists";
import { useActiveMealPlan } from "@/hooks/use-meal-plans";
import { getListId, getItemId, getPlanId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { generateShoppingListFromPlan } from "@/lib/api";

export default function ShoppingLists() {
  const { data: lists, isLoading } = useShoppingLists();
  const { data: activePlan, plans } = useActiveMealPlan();
  const createMutation = useCreateShoppingList();
  const updateItemMutation = useUpdateShoppingItem();
  const updateListMutation = useUpdateShoppingList();
  const deleteMutation = useDeleteShoppingList();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sectionLabels: Record<string, string> = {
    produce: "Produce",
    meat: "Meat & Seafood",
    dairy: "Dairy",
    pantry: "Pantry",
    frozen: "Frozen",
    bakery: "Bakery",
    beverages: "Beverages",
    other: "Other",
  };

  const computeItemPrice = (item: any) =>
    typeof item?.estimatedPrice === 'number'
      ? item.estimatedPrice
      : typeof item?.price === 'number'
        ? item.price
        : 0;

  const computeListTotal = (list: any) => {
    if (typeof list?.totalEstimatedCost === 'number') return list.totalEstimatedCost;
    const items = Array.isArray(list?.items) ? list.items : [];
    return items.reduce((sum, item) => sum + computeItemPrice(item), 0);
  };

  const handleGenerateFromPlan = async () => {
    const plan = plans?.find(p => getPlanId(p) === selectedPlanId) || activePlan;
    if (!plan) {
      toast.error('Please select a meal plan first');
      return;
    }
    try {
      await generateShoppingListFromPlan(plan);
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      setShowCreateForm(false);
      setSelectedPlanId("");
      toast.success('Shopping list generated from meal plan!');
    } catch (error) {
      console.error('Create error:', error);
      toast.error('Failed to generate shopping list');
    }
  };

  const filteredLists = (lists || []).filter(list => 
    (list.title || 'Untitled list').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = lists?.filter(l => l.status === 'active').length || 0;
  const completedCount = lists?.filter(l => l.status === 'completed').length || 0;
  const totalEstimate = lists?.reduce((sum, list) => sum + computeListTotal(list), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-32 md:pt-40 pb-8 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Shopping Lists
            </h1>
            <p className="text-muted-foreground">
              Generate lists from your meal plans
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-wrap gap-3 mb-6 justify-center"
          >
            <div className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              {activeCount} Active
            </div>
            <div className="px-4 py-2 rounded-full bg-secondary text-muted-foreground text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {completedCount} Completed
            </div>
            <div className="px-4 py-2 rounded-full bg-secondary text-muted-foreground text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              ${totalEstimate.toFixed(2)} Est. Total
            </div>
          </motion.div>

          {/* Create Form Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-6"
          >
            <AnimatePresence mode="wait">
              {showCreateForm ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="glass-card-elevated p-4"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <ChefHat className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Generate from Meal Plan</h3>
                        <p className="text-sm text-muted-foreground">Select a meal plan to create a shopping list</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Select Meal Plan</Label>
                      <Select
                        value={selectedPlanId}
                        onValueChange={setSelectedPlanId}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Choose a meal plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans?.map(plan => (
                            <SelectItem key={getPlanId(plan)} value={getPlanId(plan)}>
                              {plan.title} {plan.status === 'active' && '(Active)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {!plans?.length && (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">
                          No meal plans available. Create a meal plan first!
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={handleGenerateFromPlan}
                        disabled={createMutation.isPending || !plans?.length}
                      >
                        {createMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Generate List'
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowCreateForm(false);
                          setSelectedPlanId("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="button">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Generate from Meal Plan
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative mb-8"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-11 rounded-xl"
            />
          </motion.div>

          {/* Lists */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="glass-card h-40 animate-pulse bg-secondary/50" />
              ))}
            </div>
          ) : !filteredLists.length ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-8 text-center"
            >
              <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No lists match your search' : 'No shopping lists yet. Generate one from a meal plan!'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="space-y-4"
            >
              {filteredLists.map((list, index) => {
                const items = Array.isArray(list.items) ? list.items : [];
                const listTotal = computeListTotal(list);
                const purchasedCount = items.filter((i) => i.purchased).length;
                const totalCount = items.length;
                const isExpanded = expandedId === getListId(list);

                return (
                  <motion.div
                    key={getListId(list)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="glass-card p-5 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : getListId(list))}
                  >
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-lg">{list.title}</h3>
                        {list.description && (
                          <p className="text-sm text-muted-foreground">{list.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-xs font-medium",
                          list.status === 'active' 
                            ? "bg-primary/10 text-primary" 
                            : "bg-secondary text-muted-foreground"
                        )}>
                          {list.status}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            const id = getListId(list);
                            const nextStatus = list.status === 'active' ? 'draft' : 'active';
                            updateListMutation.mutate(
                              { listId: id, data: { status: nextStatus } },
                              {
                                onSuccess: () => toast.success(`List set to ${nextStatus}`),
                                onError: () => toast.error('Failed to update status'),
                              }
                            );
                          }}
                          disabled={list.status === 'completed' || updateListMutation.isPending}
                        >
                          {list.status === 'active' ? 'Set Draft' : list.status === 'draft' ? 'Set Active' : 'Completed'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-2 hover:bg-destructive/10 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            const id = getListId(list);
                            deleteMutation.mutate(id, {
                              onSuccess: () => toast.success('Shopping list deleted'),
                              onError: () => toast.error('Failed to delete list'),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 space-y-4"
                        >
                          <div className="flex flex-wrap gap-3 text-sm">
                            <div className="px-3 py-2 rounded-xl bg-primary/10 text-primary font-medium">
                              {purchasedCount} / {totalCount || 0} items bought
                            </div>
                            <div className="px-3 py-2 rounded-xl bg-secondary text-muted-foreground font-medium">
                              Total: ${listTotal.toFixed(2)}
                            </div>
                            <div className={cn(
                              "px-3 py-2 rounded-xl font-medium capitalize",
                              list.status === 'completed'
                                ? "bg-primary text-primary-foreground"
                                : list.status === 'active'
                                  ? "bg-primary/10 text-primary"
                                  : "bg-secondary text-muted-foreground"
                            )}>
                              {list.status}
                            </div>
                          </div>

                          {items.length > 0 && (
                            <div className="relative">
                              <div className="max-h-64 overflow-auto pr-2 space-y-4">
                                {Object.entries(
                                  items.reduce<Record<string, typeof items>>((acc, item) => {
                                    const section = item.storeSection || item.category || "other";
                                    acc[section] = acc[section] || [];
                                    acc[section].push(item);
                                    return acc;
                                  }, {})
                                ).map(([section, sectionItems]) => (
                                  <div key={section} className="space-y-2">
                                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                                      <span>{sectionLabels[section] || section}</span>
                                      <span>{sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {sectionItems.map((item) => {
                                        const quantity = [item.amount ?? item.quantity, item.unit].filter(Boolean).join(" ");
                                        const price = computeItemPrice(item);
                                        const purchased = !!item.purchased;

                                        return (
                                          <div
                                            key={getItemId(item)}
                                            role="button"
                                            aria-pressed={purchased}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              updateItemMutation.mutate({
                                                listId: getListId(list),
                                                itemId: getItemId(item),
                                                purchased: !purchased,
                                              });
                                            }}
                                            className={cn(
                                              "flex items-center gap-2 text-sm rounded-lg border px-3 py-2 min-w-[220px] max-w-[280px] flex-1 cursor-pointer transition",
                                              purchased
                                                ? "bg-primary/10 border-primary text-primary"
                                                : "bg-card/80 border-border hover:border-primary/50"
                                            )}
                                          >
                                            <div className="flex-1 min-w-0 space-y-1 text-center">
                                              <p className={cn(
                                                "font-semibold leading-tight break-words",
                                                purchased ? "line-through" : "text-foreground"
                                              )}>
                                                {item.name}
                                              </p>
                                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground justify-center">
                                                {quantity && <span>{quantity}</span>}
                                                {price ? <span className={cn(
                                                  "font-medium",
                                                  purchased ? "text-primary" : "text-foreground"
                                                )}>${price.toFixed(2)}</span> : null}
                                              </div>
                                            </div>
                                            {purchased && (
                                              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background via-background/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
