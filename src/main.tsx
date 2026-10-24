import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

async function start() {
  // Only the end-to-end build (`vite build --mode e2e`) includes the WebdriverIO bridge.
  if (import.meta.env.MODE === 'e2e') await import('@wdio/tauri-plugin');

  const root = document.getElementById('root');
  if (!root) throw new Error('index.html has no #root element');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
