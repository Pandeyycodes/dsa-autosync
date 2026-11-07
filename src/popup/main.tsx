import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles/globals.css';
import { ToastProvider } from '@/ui/components/Toast';
import { SettingsProvider } from '@/ui/hooks/useSettings';
import { Popup } from './Popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <Popup />
      </ToastProvider>
    </SettingsProvider>
  </StrictMode>,
);
