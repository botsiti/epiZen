import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TrayApp } from './TrayApp';
import '../styles.css';
import '../components/periodic/periodic.css';
import './tray.css';

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
