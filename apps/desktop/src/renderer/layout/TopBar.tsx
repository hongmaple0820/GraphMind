import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { useThemeStore, type ThemeMode } from '../stores/theme-store';

interface TopBarProps {
  isIndexing?: boolean;
  onOpenSettings?: () => void;
}

interface ModelOption {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  available: boolean;
}

export function TopBar({ isIndexing, onOpenSettings }: TopBarProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleAgentPanel = useAppStore((s) => s.toggleAgentPanel);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [showModelSwitcher, setShowModelSwitcher] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  const themeMode = useThemeStore((s) => s.mode);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setThemeMode = useThemeStore((s) => s.setMode);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const result = await (window as any).graphmind?.agent?.models?.();
        if (result?.models) {
          const options = result.models.map((m: any) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            enabled: m.enabled,
            available: result.availability?.[m.id] ?? false,
          }));
          setModels(options.filter((m: ModelOption) => m.enabled));
          const primary = options.find((m: ModelOption) => m.enabled && m.available);
          if (primary) setActiveModelId(primary.id);
        }
      } catch {}
    };
    loadModels();
    const interval = setInterval(loadModels, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = (window as any).graphmind?.sync?.onProgress?.(() => {
      setSyncStatus('syncing');
    });
    return () => { unsub?.(); };
  }, []);

  const handleSwitchModel = async (modelId: string) => {
    try {
      await (window as any).graphmind?.agent?.switchModel?.(modelId);
      setActiveModelId(modelId);
      setShowModelSwitcher(false);
    } catch {}
  };

  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      await (window as any).graphmind?.sync?.start?.('bidirectional');
      setSyncStatus('idle');
    } catch {
      setSyncStatus('error');
    }
  };

  const activeModel = models.find((m) => m.id === activeModelId);

  return (
    <header className="flex h-9 items-center justify-between border-b border-border-subtle bg-surface-raised px-2">
      <div className="flex items-center gap-1">
        <button onClick={toggleSidebar} className="topbar-btn" aria-label="Toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1.5H2V3zm0 4.25h12v1.5H2v-1.5zm0 4.25h12V13H2v-1.5z" /></svg>
        </button>
        <span className="mx-1 text-sm font-semibold text-primary-400">GraphMind</span>
        {isIndexing && <span className="text-xs text-warning animate-pulse">Indexing...</span>}
      </div>
      <div className="flex items-center gap-0.5 rounded-md bg-surface-overlay/50 p-0.5">
        <button onClick={() => setActiveView('editor')} className={`rounded px-2 py-0.5 text-xs ${activeView === 'editor' ? 'bg-primary-500/20 text-primary-300' : 'text-text-secondary hover:text-text-primary'}`}>Editor</button>
        <button onClick={() => setActiveView('graph')} className={`rounded px-2 py-0.5 text-xs ${activeView === 'graph' ? 'bg-primary-500/20 text-primary-300' : 'text-text-secondary hover:text-text-primary'}`}>Graph</button>
      </div>
      <div className="flex items-center gap-1">
        {activeModel && (
          <div className="relative">
            <button
              onClick={() => setShowModelSwitcher(!showModelSwitcher)}
              className="flex items-center gap-1 rounded bg-surface-overlay/50 px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${activeModel.available ? 'bg-success' : 'bg-text-disabled'}`} />
              <span>{activeModel.name}</span>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 6l3.5 4 3.5-4z" /></svg>
            </button>
            {showModelSwitcher && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded border border-border-subtle bg-surface-raised py-1 shadow-lg">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleSwitchModel(m.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-overlay ${m.id === activeModelId ? 'text-primary-300' : 'text-text-primary'}`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${m.available ? 'bg-success' : 'bg-text-disabled'}`} />
                    <span>{m.name}</span>
                    {m.id === activeModelId && <span className="ml-auto text-primary-400">*</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={() => setCommandPaletteOpen(true)} className="topbar-btn" title="Command Palette (Ctrl+K)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" /></svg>
        </button>
        <button onClick={toggleAgentPanel} className="topbar-btn" title="Agent Panel (Ctrl+J)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 110 4 2 2 0 010-4zM3 6a2 2 0 110 4 2 2 0 010-4zm10 0a2 2 0 110 4 2 2 0 010-4z" /></svg>
        </button>
        <button onClick={handleSync} className="topbar-btn" title="Sync" disabled={syncStatus === 'syncing'}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={syncStatus === 'syncing' ? 'animate-spin' : ''}><path d="M8 2a5.53 5.53 0 00-3.594 1.322c-.766.66-1.321 1.52-1.464 2.383C1.266 6.095 0 7.555 0 9.318 0 11.366 1.708 13 3.781 13h8.906C14.502 13 16 11.57 16 9.773c0-1.636-1.242-2.969-2.834-3.194C12.923 3.999 10.69 2 8 2zm2.354 5.146a.5.5 0 01-.708.708L8.5 6.707V10.5a.5.5 0 01-1 0V6.707L6.354 7.854a.5.5 0 11-.708-.708l2-2a.5.5 0 01.708 0l2 2z" /></svg>
        </button>
        <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark')} className="topbar-btn" title={`Theme: ${themeMode} (${resolvedTheme})`}>
          {resolvedTheme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5V2.5a5.5 5.5 0 010 11z" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5V2.5a5.5 5.5 0 010 11z" /></svg>
          )}
        </button>
        <button onClick={onOpenSettings} className="topbar-btn" title="Settings (Ctrl+,)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" /></svg>
        </button>
      </div>
    </header>
  );
}
