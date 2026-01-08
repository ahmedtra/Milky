import { useState, useCallback } from 'react';
import { sendChatMessage } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';
import { toast } from 'sonner';

const initialMessage: ChatMessage = {
  id: 'initial',
  role: 'assistant',
  content: "Hi! I'm your AI nutritionist. 🥗 I can help you plan meals, swap ingredients, explain nutritional info, or answer any diet-related questions. What would you like to know?",
  timestamp: new Date(),
};

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [isLoading, setIsLoading] = useState(false);
  const [latestRecipe, setLatestRecipe] = useState<{
    title: string;
    ingredients: string[];
    instructions: string[];
    source?: string;
    id?: string | null;
    imageUrl?: string | null;
  } | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Build conversation history (last 10 messages)
      const allMessages = [...messages, userMessage];
      const conversationHistory = allMessages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await sendChatMessage({
        message: content,
        conversationHistory,
      });

      // Normalize backend response to text
      const raw = (response as any)?.message ?? response;

      const collectFields = (obj: any) => {
        const fields = ['message', 'acknowledgement', 'greeting', 'text', 'reply', 'content'];
        return fields
          .map((k) => obj?.[k])
          .filter((v) => typeof v === 'string' && v.trim().length > 0) as string[];
      };

      const flattenObject = (obj: any): string => {
        if (!obj || typeof obj !== 'object') return '';
        // Special handlers
        if (obj.currentMeal && typeof obj.currentMeal === 'object') {
          const cm = obj.currentMeal;
          const parts = [
            cm.meal ? cm.meal : null,
            cm.date ? `on ${cm.date}` : null,
            cm.time ? `at ${cm.time}` : null,
          ].filter(Boolean);
          if (parts.length) return `Current meal: ${parts.join(' ')}`;
        }
        if (typeof obj.weather === 'string') {
          return `Weather update: ${obj.weather}`;
        }
        const collected = collectFields(obj);
        if (collected.length) return collected.join(' ');
        const kv = Object.entries(obj)
          .map(([k, v]) => {
            if (v == null) return null;
            if (typeof v === 'object') return null;
            return `${k}: ${String(v)}`;
          })
          .filter(Boolean)
          .join(', ');
        return kv;
      };

      let botText = '';
      let recipePayload: any = null;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed?.type === 'recipe_detail') {
              recipePayload = parsed;
              botText = `Loaded recipe: <recipe>${parsed.title}</recipe>`;
            } else if (Array.isArray(parsed)) {
              botText = parsed
                .map((item) => {
                  if (typeof item === 'string') return item;
                  if (item && typeof item === 'object') return flattenObject(item);
                  return null;
                })
                .filter(Boolean)
                .join(' ')
                .trim();
            } else {
              botText = flattenObject(parsed) || trimmed;
            }
          } catch {
            botText = raw;
          }
        } else {
          botText = raw;
        }
      } else if (raw && typeof raw === 'object') {
        if ((raw as any).type === 'recipe_detail') {
          recipePayload = raw;
          botText = `Loaded recipe: <recipe>${(raw as any).title}</recipe>`;
        } else {
          botText = flattenObject(raw);
        }
      }
      if (!botText) {
        botText = "I'm here to help with your meal plans and nutrition questions!";
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: botText || "I'm here to help with your meal plans and nutrition questions!",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      if (recipePayload?.type === 'recipe_detail') {
        setLatestRecipe({
          title: recipePayload.title || 'Recipe',
          ingredients: Array.isArray(recipePayload.ingredients) ? recipePayload.ingredients : [],
          instructions: Array.isArray(recipePayload.instructions) ? recipePayload.instructions : [],
          source: recipePayload.source,
          id: recipePayload.id,
          imageUrl: recipePayload.imageUrl || null,
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      const reason = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Chat request failed', { description: reason });
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  return { messages, isLoading, sendMessage, latestRecipe, setLatestRecipe };
}
