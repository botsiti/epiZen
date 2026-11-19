import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TrayApp } from './TrayApp';
import { followWindowTheme } from '../components/settings/windowTheme';
import '../styles.css';
import './tray.css';

void followWindowTheme().catch(() => { /* Window controls keep the default Epizen palette. */ });

// The menu bar item's panel (tray.html), its own small page beside the app's.
const root = document.getElementById('root');
if (!root) throw new Error('tray.html has no #root element');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary label="The menu bar panel">
      <TrayApp />
    </ErrorBoundary>
  </StrictMode>,
);
