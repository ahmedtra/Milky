import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User } from 'lucide-react';
import axios from 'axios';

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.lg};
  overflow: hidden;
`;

const ChatHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  background: ${props => props.theme.colors.primary[50]};
`;

const ChatTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Message = styled(motion.div)`
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  ${props => props.$isUser && 'flex-direction: row-reverse;'}
`;

const MessageAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${props => props.$isUser 
    ? props.theme.colors.primary[600] 
    : props.theme.colors.gray[600]};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const MessageContent = styled.div`
  max-width: 70%;
  ${props => props.$isUser && 'text-align: right;'}
`;

const MessageBubble = styled.div`
  background: ${props => props.$isUser 
    ? props.theme.colors.primary[600] 
    : props.theme.colors.gray[100]};
  color: ${props => props.$isUser ? 'white' : props.theme.colors.gray[800]};
  padding: 0.75rem 1rem;
  border-radius: ${props => props.$isUser 
    ? `${props.theme.borderRadius.lg} ${props.theme.borderRadius.lg} ${props.theme.borderRadius.sm} ${props.theme.borderRadius.lg}`
    : `${props.theme.borderRadius.lg} ${props.theme.borderRadius.lg} ${props.theme.borderRadius.lg} ${props.theme.borderRadius.sm}`};
  font-size: 0.95rem;
  line-height: 1.5;
  word-wrap: break-word;
  white-space: pre-wrap;
`;

const FormattedText = styled.div`
  color: ${props => props.$isUser ? 'white' : props.theme.colors.gray[800]};
  line-height: 1.6;
  
  h1, h2, h3, h4, h5, h6 {
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
    color: ${props => props.$isUser ? 'white' : props.theme.colors.gray[900]};
  }
  
  h1 { font-size: 1.25rem; }
  h2 { font-size: 1.1rem; }
  h3 { font-size: 1rem; }
  
  p {
    margin: 0.5rem 0;
    line-height: 1.6;
  }
  
  ul, ol {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  
  li {
    margin: 0.25rem 0;
    line-height: 1.5;
  }
  
  ul li {
    list-style-type: disc;
  }
  
  ol li {
    list-style-type: decimal;
  }

  .recipe-line {
    margin: 0.5rem 0;
    line-height: 1.6;
  }
  
  strong, b {
    font-weight: 600;
  }
  
  em, i {
    font-style: italic;
  }
  
  code {
    background: ${props => props.$isUser ? 'rgba(255,255,255,0.2)' : props.theme.colors.gray[200]};
    padding: 0.2rem 0.4rem;
    border-radius: ${props => props.theme.borderRadius.sm};
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }
  
  blockquote {
    border-left: 3px solid ${props => props.$isUser ? 'rgba(255,255,255,0.5)' : props.theme.colors.primary[300]};
    padding-left: 1rem;
    margin: 0.5rem 0;
    font-style: italic;
    color: ${props => props.$isUser ? 'rgba(255,255,255,0.9)' : props.theme.colors.gray[600]};
  }
`;

const MessageTime = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.gray[500]};
  margin-top: 0.25rem;
  ${props => props.$isUser && 'text-align: right;'}
`;

const InputContainer = styled.div`
  padding: 1.5rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
  background: white;
`;

const InputForm = styled.form`
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
`;

const MessageInput = styled.textarea`
  flex: 1;
  min-height: 44px;
  max-height: 120px;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.lg};
  font-size: 0.95rem;
  resize: none;
  transition: all 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${props => props.theme.colors.gray[400]};
  }
`;

const SendButton = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.primary[700]};
    transform: scale(1.05);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TypingIndicator = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: ${props => props.theme.colors.gray[100]};
  border-radius: ${props => props.theme.borderRadius.lg} ${props => props.theme.borderRadius.lg} ${props => props.theme.borderRadius.lg} ${props => props.theme.borderRadius.sm};
  max-width: 100px;
`;

const TypingDots = styled.div`
  display: flex;
  gap: 0.25rem;
`;

const Dot = styled(motion.div)`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${props => props.theme.colors.gray[500]};
`;

const Chat = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI diet assistant. I can help you create personalized meal plans, answer nutrition questions, and provide cooking tips. What would you like to know?",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/gemini/chat', {
        message: inputValue,
        conversationHistory: messages.slice(-10) // Last 10 messages for context
      });

      const aiMessage = {
        id: Date.now() + 1,
        text: response.data.message,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        text: "I'm sorry, I'm having trouble responding right now. Please try again later.",
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageText = (text) => {
    console.log('🧾 Chat message raw:', text);
    const normalizeRecipeListText = (raw) => {
      const content = String(raw || '');
      const hasRecipeTags = /<recipe>.*<\/recipe>/i.test(content);
      const lines = content.split(/\r?\n/);
      const isEmojiOnly = (line) => !/[\w<]/.test(line);
      const isSaveOnly = (line) => line.trim().toLowerCase() === 'save';
      const isMacroLine = (line) =>
        /^[-•*]\s*/.test(line) ||
        /^—\s*|^–\s*/.test(line) ||
        /(cal|protein|min)/i.test(line);
      if (!hasRecipeTags) {
        const hasMacros = lines.some((line) => /(cal|protein|min)/i.test(line));
        if (!hasMacros) return content;
        const preamble = [];
        const items = [];
        const postamble = [];
        let lastTitle = '';
        let started = false;
        lines.forEach((rawLine) => {
          const line = rawLine.trim();
          if (!line) return;
          if (isEmojiOnly(line) || isSaveOnly(line)) return;
          if (isMacroLine(line)) {
            if (lastTitle) {
              const macro = line.replace(/^[-•*]\s*/, '').replace(/^—\s*|^–\s*/, '').trim();
              items.push(`${lastTitle} — ${macro}`);
              lastTitle = '';
              started = true;
            }
            return;
          }
          if (!started) {
            preamble.push(line);
          } else {
            if (lastTitle) {
              items.push(`${lastTitle}`);
            }
            lastTitle = line;
          }
        });
        if (lastTitle) {
          items.push(`${lastTitle}`);
        }
        const blocks = [];
        if (preamble.length) blocks.push(preamble.join('\n'));
        if (items.length) blocks.push(items.join('\n'));
        if (postamble.length) blocks.push(postamble.join('\n'));
        return blocks.join('\n\n');
      }
      const output = [];
      const preamble = [];
      const postamble = [];
      const firstRecipeIdx = lines.findIndex((l) => /<recipe>.*<\/recipe>/i.test(l));
      let lastRecipeIdx = -1;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (/<recipe>.*<\/recipe>/i.test(lines[i])) {
          lastRecipeIdx = i;
          break;
        }
      }
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (idx < firstRecipeIdx) preamble.push(trimmed);
        else if (idx > lastRecipeIdx) postamble.push(trimmed);
      });

      for (let i = Math.max(firstRecipeIdx, 0); i <= lastRecipeIdx; i += 1) {
        const line = lines[i].trim();
        if (!line) continue;
        if (/^[-•*]\s*[^\w<]+$/.test(line)) {
          continue;
        }
        const hasRecipe = /<recipe>.*<\/recipe>/i.test(line);
        if (!hasRecipe) {
          output.push(line);
          continue;
        }
        let titleLine = line.replace(/^\s*[-•*]\s*/, '').trim();
        let macro = '';
        for (let j = i + 1; j < lines.length; j += 1) {
          const nextLine = lines[j].trim();
          if (!nextLine) continue;
          if (/^[-•*]\s*[^\w<]+$/.test(nextLine)) {
            continue;
          }
          if (/<recipe>.*<\/recipe>/i.test(nextLine)) break;
          if (/(cal|protein|min)/i.test(nextLine)) {
            macro = nextLine.replace(/^[-•*]\s*/, '').replace(/^—\s*|^–\s*/, '').trim();
            i = j;
            break;
          }
          break;
        }
        if (macro) {
          titleLine = `${titleLine} — ${macro}`;
        }
        output.push(`${titleLine}`);
      }
      const blocks = [];
      if (preamble.length) blocks.push(preamble.join('\n'));
      if (output.length) blocks.push(output.join('\n'));
      if (postamble.length) blocks.push(postamble.join('\n'));
      return blocks.join('\n\n');
    };

    // Convert line breaks to <br> tags and handle basic formatting
    const mergedText = normalizeRecipeListText(text)
      // Drop orphan '*' bullet lines
      .replace(/^\*\s*$/gm, '');
    let formattedText = mergedText
      // Normalize numbered lists like "1)" to "1." so list parsing works
      .replace(/^(\d+)\)\s+(.+)$/gm, '$1. $2')
      // Treat recipe lines as standalone blocks (not list items)
      .replace(/^(<recipe>.*<\/recipe>.*)$/gm, '<div class="recipe-line">$1</div>')
      // Handle headers first (# Header, ## Header, etc.)
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      // Handle blockquotes (> text)
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      // Handle bullet points (-, •, or *), skip emoji-only bullets
      .replace(/^[-•*]\s+(.+)$/gm, (match, content) => {
        if (!/[\w<]/.test(content)) return '';
        return `<li>${content}</li>`;
      })
      // Handle numbered lists (1., 2., etc.)
      .replace(/^(\d+\.)\s+(.+)$/gm, '<li>$2</li>')
      // Handle bold text (**text** or __text__)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Handle italic text (*text* or _text_)
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Handle inline code (`code`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Wrap consecutive list items in ul/ol tags
      .replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/g, (match) => {
        // Check if it's a numbered list by looking for numbers at the start
        const hasNumbers = /^\s*(\d+\.)/m.test(match);
        return hasNumbers ? `<ol>${match}</ol>` : `<ul>${match}</ul>`;
      })
      // Handle line breaks (but not inside HTML tags)
      .replace(/\n(?!<[^>]*>)/g, '<br>');

    return formattedText;
  };

  return (
    <ChatContainer>
      <ChatHeader>
        <ChatTitle>
          <Bot size={20} />
          AI Diet Assistant
        </ChatTitle>
      </ChatHeader>

      <MessagesContainer>
        <AnimatePresence>
          {messages.map((message) => (
            <Message
              key={message.id}
              $isUser={message.isUser}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <MessageAvatar $isUser={message.isUser}>
                {message.isUser ? <User size={16} /> : <Bot size={16} />}
              </MessageAvatar>
              <MessageContent $isUser={message.isUser}>
                <MessageBubble $isUser={message.isUser}>
                  <FormattedText 
                    $isUser={message.isUser}
                    dangerouslySetInnerHTML={{ __html: formatMessageText(message.text) }}
                  />
                </MessageBubble>
                <MessageTime $isUser={message.isUser}>
                  {formatTime(message.timestamp)}
                </MessageTime>
              </MessageContent>
            </Message>
          ))}
        </AnimatePresence>

        {isLoading && (
          <Message>
            <MessageAvatar>
              <Bot size={16} />
            </MessageAvatar>
            <MessageContent>
              <TypingIndicator
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <TypingDots>
                  <Dot
                    animate={{ y: [0, -8, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                  />
                  <Dot
                    animate={{ y: [0, -8, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                  />
                  <Dot
                    animate={{ y: [0, -8, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                  />
                </TypingDots>
              </TypingIndicator>
            </MessageContent>
          </Message>
        )}

        <div ref={messagesEndRef} />
      </MessagesContainer>

      <InputContainer>
        <InputForm onSubmit={handleSubmit}>
          <MessageInput
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about nutrition, meal planning, or cooking..."
            rows={1}
            disabled={isLoading}
          />
          <SendButton type="submit" disabled={!inputValue.trim() || isLoading}>
            <Send size={18} />
          </SendButton>
        </InputForm>
      </InputContainer>
    </ChatContainer>
  );
};

export default Chat;
