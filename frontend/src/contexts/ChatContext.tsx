import React, { createContext, useReducer, useCallback, ReactNode, useRef } from 'react';
import { Conversation, Message, MessageType } from '../models';
import { authService, messageService } from '../services';

const getCurrentUserId = () => authService.getCurrentUser()?.id || '';

interface ChatState {
  conversations: Conversation[];
  activeConversation?: Conversation;
  messages: Message[];
  isLoading: boolean;
}

type ChatAction =
  | { type: 'LOAD_CONVERSATIONS_START' }
  | { type: 'LOAD_CONVERSATIONS_SUCCESS'; payload: Conversation[] }
  | { type: 'SELECT_CONVERSATION'; payload: { conversation: Conversation, messages: Message[] } }
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'RECALL_MESSAGE'; payload: Message };

const initialState: ChatState = {
  conversations: [],
  messages: [],
  isLoading: false,
};

const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case 'LOAD_CONVERSATIONS_START':
      return { ...state, isLoading: true };
    case 'LOAD_CONVERSATIONS_SUCCESS':
      return { ...state, conversations: action.payload, isLoading: false };
    case 'SELECT_CONVERSATION':
      return { ...state, activeConversation: action.payload.conversation, messages: action.payload.messages,
        conversations: state.conversations.map(conversation => conversation.id === action.payload.conversation.id ? { ...conversation, unreadCount: 0 } : conversation) };
    case 'NEW_MESSAGE':
      return { ...state,
        messages: state.activeConversation?.id === action.payload.conversationId
          ? [...state.messages.filter(message => message.id !== action.payload.id), action.payload] : state.messages,
        conversations: state.conversations.map(conversation => conversation.id === action.payload.conversationId
          ? { ...conversation, lastMessage: action.payload, updatedAt: action.payload.timestamp } : conversation),
      };
    case 'DELETE_MESSAGE': {
      const remainingMessages = state.messages.filter(m => m.id !== action.payload);
      const updatedConversations = state.conversations.map(c => {
        if (c.lastMessage?.id === action.payload) {
          return {
            ...c,
            lastMessage: remainingMessages.length > 0 ? remainingMessages[remainingMessages.length - 1] : undefined
          };
        }
        return c;
      });
      return { ...state, messages: remainingMessages, conversations: updatedConversations };
    }
    case 'RECALL_MESSAGE': {
      const updatedMessages = state.messages.map(m =>
        m.id === action.payload.id ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' } : m
      );
      const updatedConversations = state.conversations.map(c => {
        if (c.lastMessage?.id === action.payload.id) {
          return {
            ...c,
            lastMessage: {
              ...c.lastMessage,
              isRecalled: true,
              content: 'Tin nhắn đã được thu hồi'
            }
          };
        }
        return c;
      });
      return { ...state, messages: updatedMessages, conversations: updatedConversations };
    }
    default:
      return state;
  }
};

export interface ChatContextType extends ChatState {
  loadConversations: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, type?: MessageType) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  recallMessage: (messageId: string) => Promise<void>;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const conversationsRef = useRef<Conversation[]>([]);

  const loadConversations = useCallback(async () => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;
    dispatch({ type: 'LOAD_CONVERSATIONS_START' });
    try {
      const conversations = await messageService.getConversations(currentUserId);
      conversationsRef.current = conversations;
      dispatch({ type: 'LOAD_CONVERSATIONS_SUCCESS', payload: conversations });
      
      // Restore active conversation if web reloads
      const savedId = sessionStorage.getItem('activeConversationId');
      if (savedId) {
        const conversation = conversations.find(c => c.id === savedId);
        if (conversation) {
          const messages = await messageService.getMessages(savedId);
          dispatch({ type: 'SELECT_CONVERSATION', payload: { conversation, messages } });
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      dispatch({ type: 'LOAD_CONVERSATIONS_SUCCESS', payload: [] });
    }
  }, []);

  const selectConversation = useCallback(async (conversationId: string) => {
    const conversation = conversationsRef.current.find(c => c.id === conversationId);
    if (conversation) {
      sessionStorage.setItem('activeConversationId', conversationId);
      const messages = await messageService.getMessages(conversationId);
      if (conversation.unreadCount > 0) await messageService.markAsRead(conversationId, getCurrentUserId());
      conversationsRef.current = conversationsRef.current.map(item => item.id === conversationId ? { ...item, unreadCount: 0 } : item);
      dispatch({ type: 'SELECT_CONVERSATION', payload: { conversation, messages } });
    }
  }, []);

  const sendMessage = async (conversationId: string, content: string, type?: MessageType) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;
    const msg = await messageService.sendMessage(conversationId, currentUserId, content, type);
    dispatch({ type: 'NEW_MESSAGE', payload: msg });
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await messageService.deleteMessage(messageId);
      dispatch({ type: 'DELETE_MESSAGE', payload: messageId });
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  };

  const recallMessage = async (messageId: string) => {
    try {
      const recalled = await messageService.recallMessage(messageId);
      dispatch({ type: 'RECALL_MESSAGE', payload: recalled || { id: messageId, isRecalled: true, content: 'Tin nhắn đã được thu hồi' } as any });
    } catch (error) {
      console.error('Error recalling message:', error);
      throw error;
    }
  };

  return (
    <ChatContext.Provider value={{ ...state, loadConversations, selectConversation, sendMessage, deleteMessage, recallMessage }}>
      {children}
    </ChatContext.Provider>
  );
};
