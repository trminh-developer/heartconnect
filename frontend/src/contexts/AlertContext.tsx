import React, { createContext, useState, ReactNode, useContext, useCallback } from 'react';

interface AlertState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface AlertContextType {
  showAlert: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used within AlertProvider');
  return context;
};

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertState>({ show: false, message: '', type: 'info' });

  const showAlert = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setAlertState({ show: true, message, type });
    setTimeout(() => {
      setAlertState(prev => ({ ...prev, show: false }));
    }, 2500);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return { icon: 'bi-check-circle-fill', color: '#22c55e' };
      case 'error':   return { icon: 'bi-x-circle-fill',     color: '#ef4444' };
      case 'warning': return { icon: 'bi-exclamation-triangle-fill', color: '#f59e0b' };
      default:        return { icon: 'bi-info-circle-fill',  color: '#3b82f6' };
    }
  };

  const { icon, color } = getIcon(alertState.type);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alertState.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, pointerEvents: 'none'
        }}>
          <div style={{
            background: 'var(--hc-toast-bg)',
            border: '1px solid var(--hc-border)',
            backdropFilter: 'blur(12px)',
            borderRadius: '24px',
            padding: '2rem 2.5rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center',
            minWidth: '280px', maxWidth: '380px',
            animation: 'hc-alert-in 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards'
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: color + '20', display: 'flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: '1rem'
            }}>
              <i className={'bi ' + icon} style={{ fontSize: '2.5rem', color }}></i>
            </div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem', color: 'var(--hc-text)', lineHeight: 1.5 }}>
              {alertState.message}
            </p>
          </div>
        </div>
      )}
      <style>{`
        @keyframes hc-alert-in {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </AlertContext.Provider>
  );
};
