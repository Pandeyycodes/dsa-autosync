import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles/globals.css';
import { ToastProvider } from '@/ui/components/Toast';
import { SettingsProvider } from '@/ui/hooks/useSettings';
import { Dashboard } from './Dashboard';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <Dashboard />
      </ToastProvider>
    </SettingsProvider>
  </StrictMode>,
);
