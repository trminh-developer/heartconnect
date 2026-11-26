import React, { createContext, useReducer, useCallback, useEffect, ReactNode } from 'react';
import { Match } from '../models';
import { authService, matchService } from '../services';
import { useAuth } from '../hooks/useAuth';

interface MatchState {
  matches: Match[];
  isLoading: boolean;
  showMatchModal: boolean;
  newMatch?: Match;
}

type MatchAction =
  | { type: 'RESET' }
  | { type: 'LOAD_MATCHES_START' }
  | { type: 'LOAD_MATCHES_SUCCESS'; payload: Match[] }
  | { type: 'NEW_MATCH'; payload: Match }
  | { type: 'CLOSE_MODAL' };

const initialState: MatchState = {
  matches: [],
  isLoading: false,
  showMatchModal: false,
};

const matchReducer = (state: MatchState, action: MatchAction): MatchState => {
  switch (action.type) {
    case 'RESET':
      return initialState;
    case 'LOAD_MATCHES_START':
      return { ...state, isLoading: true };
    case 'LOAD_MATCHES_SUCCESS':
      return { ...state, matches: action.payload, isLoading: false };
    case 'NEW_MATCH':
      return { ...state, matches: [action.payload, ...state.matches.filter(match => match.id !== action.payload.id)], showMatchModal: true, newMatch: action.payload };
    case 'CLOSE_MODAL':
      return { ...state, showMatchModal: false, newMatch: undefined };
    default:
      return state;
  }
};

export interface MatchContextType extends MatchState {
  loadMatches: () => Promise<void>;
  likeUser: (userId: string) => Promise<boolean>;
  dislikeUser: (userId: string) => Promise<void>;
  superLikeUser: (userId: string) => Promise<boolean>;
  closeMatchModal: () => void;
}

export const MatchContext = createContext<MatchContextType | undefined>(undefined);

export const MatchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(matchReducer, initialState);
  const { user } = useAuth();
  useEffect(() => { dispatch({ type: 'RESET' }); }, [user?.id]);

  const getCurrentUserId = () => {
    return authService.getCurrentUser()?.id || '';
  };

  const loadMatches = useCallback(async () => {
    const currentUserId = user?.id;
    if (!currentUserId) return;
    dispatch({ type: 'LOAD_MATCHES_START' });
    try {
      const matches = await matchService.getMatches(currentUserId);
      dispatch({ type: 'LOAD_MATCHES_SUCCESS', payload: matches });
    } catch (error) {
      console.error('Error loading matches:', error);
      dispatch({ type: 'LOAD_MATCHES_SUCCESS', payload: [] });
    }
  }, [user?.id]);

  const likeUser = async (targetId: string) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return false;
    try {
      const result = await matchService.likeUser(currentUserId, targetId);
      if (getCurrentUserId() === currentUserId && result.matched && result.match?.isNew) {
        dispatch({ type: 'NEW_MATCH', payload: result.match });
      }
      return result.matched;
    } catch (error) {
      console.error('Error liking user:', error);
      throw error;
    }
  };

  const dislikeUser = async (targetId: string) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;
    try {
      await matchService.dislikeUser(currentUserId, targetId);
    } catch (error) {
      console.error('Error disliking user:', error);
      throw error;
    }
  };

  const superLikeUser = async (targetId: string) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return false;
    try {
      const result = await matchService.superLikeUser(currentUserId, targetId);
      if (getCurrentUserId() === currentUserId && result.matched && result.match?.isNew) {
        dispatch({ type: 'NEW_MATCH', payload: result.match });
      }
      return result.matched;
    } catch (error) {
      console.error('Error superliking user:', error);
      throw error;
    }
  };

  const closeMatchModal = () => {
    dispatch({ type: 'CLOSE_MODAL' });
  };

  return (
    <MatchContext.Provider value={{ ...state, loadMatches, likeUser, dislikeUser, superLikeUser, closeMatchModal }}>
      {children}
    </MatchContext.Provider>
  );
};

