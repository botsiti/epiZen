import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopPet } from './DesktopPet';
import '../styles.css';
import './pet.css';

async function start() {
  if (import.meta.env.MODE === 'e2e') await import('@wdio/tauri-plugin');
  const root = document.getElementById('root'); if (!root) throw new Error('pet.html has no root.');
  createRoot(root).render(<StrictMode><DesktopPet /></StrictMode>);
}
void start();
