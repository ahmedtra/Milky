import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RefreshCw, ShoppingCart, Info, Sparkles, Bot, User, BookmarkPlus } from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { saveFavoriteRecipe, ensureFavoriteImage, createShoppingList, updateShoppingList } from "@/lib/api";
import { useShoppingLists } from "@/hooks/use-shopping-lists";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const parseMessageSegments = (text: string) => {
  const segments: Array<{ type: "text" | "recipe"; value: string }> = [];
  const regex = /<recipe>(.*?)<\/recipe>/gi;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "recipe", value: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
};

const addEmojiIfMissing = (txt: string) => {
  if (!txt) return "🙂";
  return /\p{Emoji}/u.test(txt) ? txt : `${txt} 🙂`;
};

export default function Chat() {
  const { messages, isLoading, sendMessage, latestRecipe, setLatestRecipe, latestListIntent, setLatestListIntent } = useChat();
  const { data: shoppingLists } = useShoppingLists();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [savingRecipe, setSavingRecipe] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIngredients, setEditIngredients] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [showListModal, setShowListModal] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("new");
  const [listTitle, setListTitle] = useState<string>("");
  const [listItems, setListItems] = useState<Array<{ name: string; quantity: string }>>([]);
  const [savingList, setSavingList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  useEffect(() => {
    if (latestRecipe) {
      setEditTitle(latestRecipe.title || "");
      setEditIngredients((latestRecipe.ingredients || []).join("\n"));
      setEditInstructions((latestRecipe.instructions || []).join("\n"));
    }
  }, [latestRecipe]);

  const openListModal = () => {
    const itemsFromRecipe = (latestRecipe?.ingredients || []).map((ing: any) => ({
      name: typeof ing === "string" ? ing : ing?.name || "",
      quantity: ing?.amount || ing?.quantity || "",
    })).filter((i) => i.name);
    setListItems(itemsFromRecipe.length ? itemsFromRecipe : [{ name: "", quantity: "" }]);
    setListTitle(latestRecipe?.title || "Shopping List");
    setSelectedListId("new");
    setShowListModal(true);
  };

  const parseQtyUnit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return { amount: "1", unit: "unit" };
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!match) return { amount: "1", unit: trimmed || "unit" };
    const amount = match[1] || "1";
    const unit = match[2]?.trim() || "unit";
    return { amount, unit };
  };

  const categorizeItem = (name: string) => {
    const lower = name.toLowerCase();
    if (/(chicken|beef|turkey|pork|salmon|fish|shrimp|meat)/.test(lower)) return "meat";
    if (/(milk|yogurt|cheese|butter|cream)/.test(lower)) return "dairy";
    if (/(apple|banana|berry|orange|fruit|grape)/.test(lower)) return "produce";
    if (/(lettuce|spinach|kale|broccoli|carrot|pepper|onion|garlic|tomato|potato)/.test(lower)) return "produce";
    if (/(bread|baguette|bun|bagel)/.test(lower)) return "bakery";
    if (/(rice|pasta|flour|sugar|salt|oil|spice|canned|grain)/.test(lower)) return "pantry";
    if (/(frozen|ice cream)/.test(lower)) return "frozen";
    return "other";
  };

  const updateItem = (idx: number, field: "name" | "quantity", value: string) => {
    setListItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const addRow = () => setListItems((prev) => [...prev, { name: "", quantity: "" }]);
  const removeRow = (idx: number) =>
    setListItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSaveList = async () => {
    const items = listItems
      .map((i) => {
        const name = i.name.trim();
        const qty = i.quantity.trim();
        const { amount, unit } = parseQtyUnit(qty);
        return {
          name,
          quantity: qty,
          amount: amount || "1",
          unit: unit || "unit",
          category: categorizeItem(name),
          purchased: false,
          price: 0,
        };
      })
      .filter((i) => i.name);
    if (!items.length) {
      toast.error("Please add at least one item");
      return;
    }
    setSavingList(true);
    try {
      if (selectedListId && selectedListId !== "new") {
        const list = (shoppingLists || []).find((l: any) => l._id === selectedListId || l.id === selectedListId);
        const existingItems = Array.isArray(list?.items) ? list.items : [];
        await updateShoppingList(selectedListId, { items: [...existingItems, ...items] });
        toast.success("Items added to shopping list");
      } else {
        await createShoppingList({
          title: listTitle || "Shopping List",
          description: "",
          items,
          status: "active",
        });
        toast.success("Shopping list created");
      }
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      setShowListModal(false);
    } catch (err) {
      console.error("Save list error", err);
      toast.error("Could not save shopping list");
    } finally {
      setSavingList(false);
    }
  };

  useEffect(() => {
    if (latestListIntent) {
      const items = Array.isArray(latestListIntent.items) && latestListIntent.items.length
        ? latestListIntent.items
        : [{ name: "", quantity: "" }];
      setListItems(items);
      setListTitle(latestListIntent.title || "Shopping List");
      setSelectedListId("new");
      setShowListModal(true);
      setLatestListIntent(null);
    }
  }, [latestListIntent, setLatestListIntent]);

  const handleSaveEditedRecipe = async () => {
    if (!editTitle.trim()) {
      toast.error("Please add a recipe title.");
      return;
    }
    const ingredients = editIngredients
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const instructions = editInstructions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      setSavingRecipe("editing");
      const nutrition = latestRecipe?.nutrition || null;
      const saved = await saveFavoriteRecipe({
        recipeId: latestRecipe?.id || undefined,
        recipe: {
          title: editTitle.trim(),
          name: editTitle.trim(),
          ingredients,
          instructions,
          imageUrl: latestRecipe?.imageUrl || null,
          source: latestRecipe?.source || "chat",
          nutrition,
        },
      });
      let imageUrl = latestRecipe?.imageUrl || null;
      const favId = saved?.favorite?._id || saved?.favorite?.id;
      if (favId) {
        try {
          const ensured = await ensureFavoriteImage(favId);
          imageUrl = ensured?.image || ensured?.favorite?.imageUrl || imageUrl;
        } catch (imgErr) {
          console.warn("Could not ensure favorite image", imgErr);
        }
      }
      toast.success("Saved edited recipe to favorites");
      // reset latest recipe to reflect saved
      setLatestRecipe({
        title: editTitle.trim(),
        ingredients,
        instructions,
        source: latestRecipe?.source || "chat",
        id: favId,
        imageUrl,
        nutrition,
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not save the recipe");
    } finally {
      setSavingRecipe(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      {/* Chat Container */}
      <main className="flex-1 pt-28 md:pt-32 pb-28 px-4 md:px-8 flex flex-col max-w-3xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">AI Nutritionist</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Chat with Milky
          </h1>
        </motion.div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-hide">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-soft">
                    <Bot className="h-5 w-5 text-primary-foreground" />
                  </div>
                )}
                <div
                className={cn(
                  "max-w-[80%] rounded-3xl px-5 py-4",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-lg"
                    : "glass-card rounded-bl-lg"
                )}
              >
                <div className="text-[15px] leading-relaxed space-y-1 whitespace-pre-line">
                    {parseMessageSegments(message.content).map((seg, idx) => {
                      if (seg.type === "recipe") {
                        return (
                          <span key={`${message.id}-seg-${idx}`} className="inline-flex items-center gap-2">
                            <button
                              className="inline text-primary font-semibold hover:underline"
                              onClick={() =>
                                sendMessage(`Show ingredients and instructions for "${seg.value}"`)
                              }
                              disabled={isLoading}
                            >
                              {message.role === "assistant" ? addEmojiIfMissing(seg.value) : seg.value}
                            </button>
                            <button
                              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                              onClick={async () => {
                                try {
                                  setSavingRecipe(seg.value);
                                  await saveFavoriteRecipe({ title: seg.value });
                                  toast.success("Saved to favorites");
                                } catch (err) {
                                  console.error(err);
                                  toast.error("Could not save favorite");
                                } finally {
                                  setSavingRecipe(null);
                                }
                              }}
                              disabled={isLoading || savingRecipe === seg.value}
                              title="Save as favorite"
                            >
                              <BookmarkPlus className="h-3.5 w-3.5" />
                              {savingRecipe === seg.value ? "Saving..." : "Save"}
                            </button>
                          </span>
                        );
                      }
                      const textContent =
                        message.role === "assistant" ? addEmojiIfMissing(seg.value.trim()) : seg.value;
                      return (
                        <ReactMarkdown
                          key={`${message.id}-seg-${idx}`}
                          remarkPlugins={[remarkGfm]}
                          className="prose prose-sm max-w-none text-[15px] leading-relaxed text-foreground prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-li:ml-4 prose-ul:list-disc prose-ol:list-decimal"
                          components={{
                            ul: ({ node, ...props }) => <ul {...props} className="list-disc ml-5" />,
                            ol: ({ node, ...props }) => <ol {...props} className="list-decimal ml-5" />,
                          }}
                        >
                          {textContent}
                        </ReactMarkdown>
                      );
                    })}
                  </div>
                </div>
                {message.role === "user" && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                    <User className="h-5 w-5 text-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-soft">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="glass-card rounded-3xl rounded-bl-lg px-5 py-4">
                <div className="flex gap-1.5">
                  <motion.div
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <motion.div
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                  />
                  <motion.div
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Latest Recipe Editor (below chat) */}
        {latestRecipe && (
          <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Latest Recipe
              </div>
              <div className="text-xs text-muted-foreground">
                {latestRecipe.source === "db" ? "From database" : "AI generated"}
              </div>
            </div>
            <input
              className="w-full rounded-lg border border-primary/30 bg-white/80 px-3 py-2 text-sm focus-visible:ring-primary"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Recipe title"
            />
            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Ingredients (one per line)</label>
                <textarea
                  className="min-h-[180px] rounded-lg border border-primary/20 bg-white/80 px-3 py-2 text-sm focus-visible:ring-primary"
                  value={editIngredients}
                  onChange={(e) => setEditIngredients(e.target.value)}
                  placeholder="- 1 cup oats"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Instructions (one step per line)</label>
                <textarea
                  className="min-h-[180px] rounded-lg border border-primary/20 bg-white/80 px-3 py-2 text-sm focus-visible:ring-primary"
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  placeholder="1. Preheat oven..."
                />
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setLatestRecipe(null)}>
                Clear
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveEditedRecipe} disabled={savingRecipe === "editing"}>
                {savingRecipe === "editing" ? "Saving..." : "Save to Favorites"}
              </Button>
            </div>
          </div>
        )}

        {/* Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card-elevated p-2"
        >
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Ask me anything about nutrition..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="h-12 rounded-xl border-0 bg-secondary/50 focus-visible:ring-primary"
            />
            <Button
              variant="primary"
              size="icon"
              className="h-12 w-12 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </motion.div>
      </main>

      <Dialog open={showListModal} onOpenChange={setShowListModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add items to shopping list</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">Target list</span>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create new list</SelectItem>
                  {(shoppingLists || []).map((list: any) => (
                    <SelectItem key={list._id || list.id} value={list._id || list.id}>
                      {list.title || "Untitled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedListId === "new" && (
              <div className="space-y-2">
                <span className="text-sm font-medium">New list name</span>
                <Input
                  value={listTitle}
                  onChange={(e) => setListTitle(e.target.value)}
                  placeholder="Shopping List"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Items</span>
                <Button variant="ghost" size="sm" onClick={addRow}>
                  + Add row
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {listItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      className="flex-1"
                      placeholder="Ingredient name"
                      value={item.name}
                      onChange={(e) => updateItem(idx, "name", e.target.value)}
                    />
                    <Input
                      className="w-32"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeRow(idx)}>
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowListModal(false)} disabled={savingList}>
                Cancel
              </Button>
              <Button onClick={handleSaveList} disabled={savingList}>
                {savingList ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
