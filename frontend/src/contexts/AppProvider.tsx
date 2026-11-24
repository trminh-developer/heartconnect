import React, { ReactNode } from 'react';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider } from './AuthContext';
import { MatchProvider } from './MatchContext';
import { ChatProvider } from './ChatContext';
import { NotificationProvider } from './NotificationContext';
import { AlertProvider } from './AlertContext';
import { useAuth } from '../hooks/useAuth';

function AccountProviders({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Clear account-specific state and restart polling when the signed-in identity changes.
  return <MatchProvider key={user?.id || 'guest'}>
    <ChatProvider><NotificationProvider>{children}</NotificationProvider></ChatProvider>
  </MatchProvider>;
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <AccountProviders>{children}</AccountProviders>
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  );
};

