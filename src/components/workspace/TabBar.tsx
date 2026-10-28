import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { canGoBack, canGoForward, currentView, tabTitle, type Tab, type Workspace } from '../../lib/tabs';
import { useEscape } from '../calendar/useEscape';
import './workspace.css';

interface Props {
  ws: Workspace;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  onNewTab: () => void;
  onBack: () => void;
  onForward: () => void;
  rightOpen: boolean;
  onToggleRight: () => void;
}

/**
 * The tabs across the top of the main pane, as in Obsidian: back and forward for the tab in front,
 * the tabs (pinned ones first, with a pin where the × would be), + for a new one, and at the right
 * the right sidebar's switch. A right-click on a tab pins or unpins it, or closes it.
 */
export function TabBar({ ws, onActivate, onClose, onPin, onNewTab, onBack, onForward, rightOpen, onToggleRight }: Props) {
  const [menu, setMenu] = useState<{ id: number; x: number; y: number }>();
  const front = ws.tabs.find((tab) => tab.id === ws.active);
  const menuTab = menu && ws.tabs.find((tab) => tab.id === menu.id);
  // The tab in front stays in sight when there are more than fit.
  const strip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    strip.current?.querySelector('.tabbar-tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [ws.active]);

  return (
    <div className="tabbar" data-testid="tabbar">
      <div className="tabbar-nav">
        <button type="button" className="tabbar-button" onClick={onBack} disabled={!front || !canGoBack(front)} aria-label="Back" title="Back (⌘[)" data-testid="tab-back">
          <Chevron direction="left" />
        </button>
        <button type="button" className="tabbar-button" onClick={onForward} disabled={!front || !canGoForward(front)} aria-label="Forward" title="Forward (⌘])" data-testid="tab-forward">
          <Chevron direction="right" />
        </button>
      </div>
      <div className="tabbar-tabs" role="tablist" aria-label="Open tabs" ref={strip}>
        {ws.tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === ws.active}
            onActivate={() => onActivate(tab.id)}
            onClose={() => onClose(tab.id)}
            onUnpin={() => onPin(tab.id, false)}
            onMenu={(event) => {
              event.preventDefault();
              setMenu({ id: tab.id, x: event.clientX, y: event.clientY });
            }}
          />
        ))}
        <button type="button" className="tabbar-button tabbar-new" onClick={onNewTab} aria-label="New tab" title="New tab (⌘T)" data-testid="tab-new">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        className={rightOpen ? 'tabbar-button tabbar-right is-on' : 'tabbar-button tabbar-right'}
        onClick={onToggleRight}
        aria-pressed={rightOpen}
        aria-label="Right sidebar"
        title={`${rightOpen ? 'Hide' : 'Show'} the right sidebar: backlinks and the local graph (⌥⌘B)`}
        data-testid="right-sidebar-toggle"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect x="2" y="2.5" width="12" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
          {rightOpen && <rect x="10.6" y="3.2" width="2.7" height="9.6" rx="1" fill="currentColor" opacity="0.45" />}
        </svg>
      </button>
      {menu && menuTab && (
        <TabMenu
          at={menu}
          pinned={menuTab.pinned}
          onPin={() => onPin(menuTab.id, !menuTab.pinned)}
          onClose={() => onClose(menuTab.id)}
          onDismiss={() => setMenu(undefined)}
        />
      )}
    </div>
  );
}

interface ItemProps {
  tab: Tab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  onUnpin: () => void;
  onMenu: (event: MouseEvent) => void;
}

function TabItem({ tab, active, onActivate, onClose, onUnpin, onMenu }: ItemProps) {
  const view = currentView(tab);
  const title = tabTitle(view);
  const classes = ['tabbar-tab', active && 'is-active', tab.pinned && 'is-pinned'].filter(Boolean).join(' ');
  return (
    <div
      className={classes}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={view.kind === 'note' ? view.path : title}
      onClick={onActivate}
      // A middle click closes a tab, as in a browser; a pinned one stays.
      onAuxClick={(event) => {
        if (event.button !== 1 || tab.pinned) return;
        event.preventDefault();
        onClose();
      }}
      onContextMenu={onMenu}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onActivate();
      }}
      data-testid="workspace-tab"
      data-tab-id={tab.id}
      data-active={active}
      data-pinned={tab.pinned}
      data-title={title}
    >
      <span className="tabbar-tab-title">{title}</span>
      {tab.pinned ? (
        <button
          type="button"
          className="tabbar-tab-end tabbar-tab-pin"
          onClick={(event) => {
            event.stopPropagation();
            onUnpin();
          }}
          aria-label={`Unpin ${title}`}
          title="Pinned: ⌘W leaves it open, and links open beside it. Click to unpin."
          data-testid="tab-pin"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M6 2.5h4M6.6 2.5l-.6 5-2 2h8l-2-2-.6-5M8 9.5V14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="tabbar-tab-end tabbar-tab-close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label={`Close ${title}`}
          title="Close (⌘W)"
          data-testid="tab-close"
        >
          <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function TabMenu({ at, pinned, onPin, onClose, onDismiss }: { at: { x: number; y: number }; pinned: boolean; onPin: () => void; onClose: () => void; onDismiss: () => void }) {
  useEscape(onDismiss);
  const menu = useRef<HTMLDivElement>(null);
  // Kept inside the window, like a system menu.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8))}px`;
    element.querySelector('button')?.focus();
  }, [at]);
  const pick = (action: () => void) => () => {
    onDismiss();
    action();
  };
  return (
    <div className="tab-menu-backdrop" onMouseDown={onDismiss} onContextMenu={(event) => event.preventDefault()}>
      <div ref={menu} className="tab-menu" role="menu" style={{ left: at.x, top: at.y }} onMouseDown={(event) => event.stopPropagation()} data-testid="tab-menu">
        <button type="button" role="menuitem" onClick={pick(onPin)} data-testid="tab-menu-pin">
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        {!pinned && (
          <button type="button" role="menuitem" onClick={pick(onClose)} data-testid="tab-menu-close">
            Close
            <span className="tab-menu-key">⌘W</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={direction === 'left' ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
