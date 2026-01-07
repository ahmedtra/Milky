import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RefreshCw, ShoppingCart, Info, Sparkles, Bot, User } from "lucide-react";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const quickActions = [
  { label: "Swap this meal", icon: RefreshCw },
  { label: "Add to shopping list", icon: ShoppingCart },
  { label: "Explain macros", icon: Info },
];

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Hi! I'm your AI nutritionist. 🥗 I can help you plan meals, swap ingredients, explain nutritional info, or answer any diet-related questions. What would you like to know?",
    timestamp: new Date(),
  },
];

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        "That's a great question! Based on your meal plan, I'd recommend increasing your protein intake by adding Greek yogurt to your breakfast. This will help with muscle recovery and keep you feeling full longer.",
        "I've analyzed your nutrition data. Your current meal plan provides about 1,850 calories daily with a good macro split. Would you like me to suggest any adjustments?",
        "Here's a healthy swap: Instead of white rice, try cauliflower rice. It's lower in carbs and adds extra nutrients. I can update your shopping list if you'd like!",
      ];

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleQuickAction = (action: string) => {
    sendMessage(action);
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
                  <p className="text-[15px] leading-relaxed">{message.content}</p>
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
          {isTyping && (
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
              onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
              className="h-12 rounded-xl border-0 bg-secondary/50 focus-visible:ring-primary"
            />
            <Button
              variant="primary"
              size="icon"
              className="h-12 w-12 shrink-0"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isTyping}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
