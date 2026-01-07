import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RefreshCw, ShoppingCart, Info, Sparkles, Bot, User, BookmarkPlus } from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { saveFavoriteRecipe } from "@/lib/api";
import { toast } from "sonner";

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

const quickActions = [
  { label: "Swap this meal", icon: RefreshCw },
  { label: "Add to shopping list", icon: ShoppingCart },
  { label: "Explain macros", icon: Info },
];

export default function Chat() {
  const { messages, isLoading, sendMessage } = useChat();
  const [input, setInput] = useState("");
  const [savingRecipe, setSavingRecipe] = useState<string | null>(null);
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

  const handleQuickAction = (action: string) => {
    setInput(action);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      {/* Chat Container */}
      <main className="flex-1 pt-28 md:pt-32 pb-4 px-4 md:px-8 flex flex-col max-w-3xl mx-auto w-full">
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
                              {seg.value}
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
                      return <span key={`${message.id}-seg-${idx}`}>{seg.value}</span>;
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

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-2"
        >
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="glass"
              size="sm"
              className="shrink-0"
              onClick={() => handleQuickAction(action.label)}
            >
              <action.icon className="h-4 w-4 mr-2" />
              {action.label}
            </Button>
          ))}
        </motion.div>

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
    </div>
  );
}
