import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QuickPrompt } from '../components/assistant/QuickPrompt';
import '../styles.css';
import './window.css';
async function start() {
  if (import.meta.env.MODE === 'e2e') await import('@wdio/tauri-plugin');
  const root = document.getElementById('root'); if (!root) throw new Error('prompt.html has no root.');
  createRoot(root).render(<StrictMode><QuickPrompt /></StrictMode>);
}
void start();
