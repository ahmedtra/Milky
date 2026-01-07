import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Check, Sparkles } from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  price: number;
  checked: boolean;
}

const initialItems: ShoppingItem[] = [
  { id: "1", name: "Organic Spinach", category: "Produce", price: 3.99, checked: false },
  { id: "2", name: "Avocados (3 pack)", category: "Produce", price: 4.49, checked: false },
  { id: "3", name: "Cherry Tomatoes", category: "Produce", price: 2.99, checked: true },
  { id: "4", name: "Fresh Salmon Fillet", category: "Meat & Seafood", price: 12.99, checked: false },
  { id: "5", name: "Chicken Breast", category: "Meat & Seafood", price: 8.49, checked: false },
  { id: "6", name: "Greek Yogurt", category: "Dairy", price: 5.99, checked: true },
  { id: "7", name: "Almond Milk", category: "Dairy", price: 4.29, checked: false },
  { id: "8", name: "Quinoa", category: "Pantry", price: 6.99, checked: false },
  { id: "9", name: "Extra Virgin Olive Oil", category: "Pantry", price: 11.99, checked: false },
  { id: "10", name: "Brown Rice", category: "Pantry", price: 3.49, checked: true },
];

const categoryOrder = ["Produce", "Meat & Seafood", "Dairy", "Pantry"];

export default function ShoppingList() {
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState("");

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    const item: ShoppingItem = {
      id: Date.now().toString(),
      name: newItem,
      category: "Pantry",
      price: 0,
      checked: false,
    };
    setItems((prev) => [...prev, item]);
    setNewItem("");
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedItems = categoryOrder.reduce((acc, category) => {
    const categoryItems = filteredItems.filter((item) => item.category === category);
    if (categoryItems.length > 0) {
      acc[category] = categoryItems;
    }
    return acc;
  }, {} as Record<string, ShoppingItem[]>);

  const totalPrice = items
    .filter((item) => !item.checked)
    .reduce((sum, item) => sum + item.price, 0);

  const checkedCount = items.filter((item) => item.checked).length;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-32 md:pt-40 pb-8 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Shopping List
            </h1>
            <p className="text-muted-foreground">
              {checkedCount} of {items.length} items completed
            </p>
          </motion.div>

          {/* Smart Add Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card-elevated p-2 mb-6"
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                <Input
                  type="text"
                  placeholder="Smart Add — try 'organic chicken' or '2 lbs salmon'"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  className="pl-11 h-12 rounded-xl border-0 bg-secondary/50 focus-visible:ring-primary"
                />
              </div>
              <Button
                variant="primary"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={addItem}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </motion.div>

          {/* Search Filter */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative mb-8"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-11 rounded-xl"
            />
          </motion.div>

          {/* Shopping Items */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-8"
          >
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {category}
                </h2>
                <div className="glass-card divide-y divide-border/50">
                  <AnimatePresence>
                    {categoryItems.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center gap-4 p-4"
                      >
                        <button
                          onClick={() => toggleItem(item.id)}
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-200",
                            item.checked
                              ? "bg-primary border-primary"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          {item.checked && (
                            <Check className="h-3.5 w-3.5 text-primary-foreground" />
                          )}
                        </button>
                        <span
                          className={cn(
                            "flex-1 transition-all duration-200",
                            item.checked
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          )}
                        >
                          {item.name}
                        </span>
                        {item.price > 0 && (
                          <span className="text-sm font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-lg">
                            ${item.price.toFixed(2)}
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Total */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 glass-card-elevated p-5 flex items-center justify-between"
          >
            <span className="text-muted-foreground">Estimated Total</span>
            <span className="text-2xl font-bold text-foreground">
              ${totalPrice.toFixed(2)}
            </span>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
