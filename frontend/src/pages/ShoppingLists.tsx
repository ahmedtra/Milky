import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Plus, Check, ShoppingCart, Loader2, 
  Package, CheckCircle, ChefHat, Trash2 
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
import { ShoppingMode } from "@/components/shopping/ShoppingMode";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, { amount: string | number; unit: string }>>({});
  const [shoppingModeListId, setShoppingModeListId] = useState<string | null>(null);
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
  const sectionStyles: Record<string, string> = {
    produce: "bg-emerald-100 text-emerald-800",
    meat: "bg-rose-100 text-rose-800",
    dairy: "bg-sky-100 text-sky-800",
    pantry: "bg-amber-100 text-amber-800",
    frozen: "bg-cyan-100 text-cyan-800",
    bakery: "bg-orange-100 text-orange-800",
    beverages: "bg-indigo-100 text-indigo-800",
    other: "bg-slate-100 text-slate-700",
  };

  const handleGenerateFromPlan = async () => {
    const plan = plans?.find(p => getPlanId(p) === selectedPlanId) || activePlan;
    if (!plan) {
      toast.error('Please select a meal plan first');
      return;
    }
    setIsGenerating(true);
    try {
      await generateShoppingListFromPlan(plan);
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      setShowCreateForm(false);
      setSelectedPlanId("");
      toast.success('Shopping list generated from meal plan!');
    } catch (error) {
      console.error('Create error:', error);
      toast.error('Failed to generate shopping list');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredLists = (lists || []).filter(list => 
    (list.title || 'Untitled list').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const shoppingModeList = useMemo(() => {
    if (!shoppingModeListId) return null;
    return (lists || []).find((list) => getListId(list) === shoppingModeListId) || null;
  }, [lists, shoppingModeListId]);

  const buildSections = (items: any[]) => {
    const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
      const section = (item.category || item.storeSection || "other").toLowerCase();
      acc[section] = acc[section] || [];
      acc[section].push(item);
      return acc;
    }, {});
    return Object.entries(grouped).map(([section, sectionItems]) => ({
      section,
      label: sectionLabels[section] || section,
      items: sectionItems,
    }));
  };

  const activeCount = lists?.filter(l => l.status === 'active').length || 0;
  const completedCount = lists?.filter(l => l.status === 'completed').length || 0;
  const normalizeDisplayQuantity = (item: any) => {
    const id = getItemId(item);
    const override = quantityOverrides[id];
    let amount: string | number = override?.amount ?? item.amount ?? item.quantity ?? '1';
    const unit = override?.unit ?? item.unit ?? 'unit';
    if (typeof amount === 'number' && !Number.isFinite(amount)) {
      amount = item.amount ?? item.quantity ?? '1';
    }
    if (typeof amount === 'string' && amount.trim().toLowerCase() === 'nan') {
      amount = item.amount ?? item.quantity ?? '1';
    }
    return { amount, unit };
  };

  const getSelectedVariantIndex = (item: any, unitVariants: any[]) => {
    const id = getItemId(item);
    const override = quantityOverrides[id];
    if (!override) return "0";
    const idx = unitVariants.findIndex(
      (variant) =>
        String(variant.amount) === String(override.amount) &&
        String(variant.unit).toLowerCase() === String(override.unit).toLowerCase()
    );
    return idx >= 0 ? String(idx) : "0";
  };

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
                        disabled={isGenerating || createMutation.isPending || !plans?.length}
                      >
                        {isGenerating || createMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Preparing list...
                          </>
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
                    <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground text-base sm:text-lg leading-snug">
                          {list.title}
                        </h3>
                        {list.description && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{list.description}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end sm:min-w-[240px]">
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
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShoppingModeListId(getListId(list));
                              }}
                            >
                              Shopping Mode
                            </Button>
                          </div>

                          {items.length > 0 && (
                            <div className="relative">
                              <div className="max-h-64 overflow-auto pr-2 space-y-4">
                                {Object.entries(
                                  items.reduce<Record<string, typeof items>>((acc, item) => {
                                    const section = (item.category || item.storeSection || "other").toLowerCase();
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
                                        const id = getItemId(item);
                                        const { amount: displayAmount, unit: displayUnit } = normalizeDisplayQuantity(item);
                                        const quantity = [displayAmount, displayUnit].filter(Boolean).join(" ");
                                        const unitVariants = Array.isArray(item.unitVariants) ? item.unitVariants : [];
                                        const showVariants = unitVariants.length > 1;
                                        const selectedVariantIndex = showVariants
                                          ? (() => {
                                              const override = quantityOverrides[id];
                                              if (!override) return "0";
                                              const idx = unitVariants.findIndex(
                                                (variant) =>
                                                  String(variant.amount) === String(override.amount) &&
                                                  String(variant.unit).toLowerCase() === String(override.unit).toLowerCase()
                                              );
                                              return idx >= 0 ? String(idx) : "0";
                                            })()
                                          : undefined;
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
                                              "relative flex items-center gap-2 text-center text-sm rounded-lg border px-3 py-2 min-w-[220px] max-w-[280px] flex-1 cursor-pointer transition",
                                              purchased
                                                ? "bg-primary/10 border-primary text-primary"
                                                : "bg-card/80 border-border hover:border-primary/50"
                                            )}
                                          >
                                            {showVariants && (
                                              <div className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0">
                                                <Select
                                                  value={selectedVariantIndex}
                                                  onValueChange={(value) => {
                                                    const chosen = unitVariants[Number(value)];
                                                    if (!chosen) return;
                                                    setQuantityOverrides((prev) => ({
                                                      ...prev,
                                                      [id]: { amount: chosen.amount, unit: chosen.unit }
                                                    }));
                                                  }}
                                                >
                                                  <SelectTrigger
                                                    className="h-7 w-20 text-xs px-2"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <SelectValue />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {unitVariants.map((variant, idx) => (
                                                      <SelectItem
                                                        key={`${variant.amount}-${variant.unit}-${idx}`}
                                                        value={String(idx)}
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        {`${variant.amount} ${variant.unit}`}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                            )}
                                            <div className={cn("flex-1 min-w-0 space-y-1 text-center", showVariants && "pr-20")}>
                                              <p className={cn(
                                                "font-semibold leading-tight break-words",
                                                purchased ? "line-through" : "text-foreground"
                                              )}>
                                                {item.name}
                                              </p>
                                              <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
                                                {quantity && <span>{quantity}</span>}
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
      {shoppingModeList && (
        <ShoppingMode
          title={shoppingModeList.title || "Shopping List"}
          itemsBySection={buildSections(Array.isArray(shoppingModeList.items) ? shoppingModeList.items : [])}
          sectionStyles={sectionStyles}
          onToggleItem={(item) => {
            updateItemMutation.mutate({
              listId: getListId(shoppingModeList),
              itemId: getItemId(item),
              purchased: !item.purchased,
            });
          }}
          getItemKey={getItemId}
          normalizeDisplayQuantity={normalizeDisplayQuantity}
          getSelectedVariantIndex={getSelectedVariantIndex}
          onSelectVariant={(item, chosen) => {
            const id = getItemId(item);
            setQuantityOverrides((prev) => ({
              ...prev,
              [id]: { amount: chosen.amount, unit: chosen.unit }
            }));
          }}
          onExit={() => setShoppingModeListId(null)}
        />
      )}
    </div>
  );
}
