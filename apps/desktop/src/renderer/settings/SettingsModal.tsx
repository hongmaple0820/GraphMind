import { useState, useEffect, useCallback } from 'react';
import { useThemeStore, type ThemeMode } from '../stores/theme-store';

interface ModelConfig {
  id: string;
  name: string;
  type: 'local' | 'openai' | 'claude' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  enabled: boolean;
}

interface SyncConfigForm {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  conflictStrategy: 'local-wins' | 'remote-wins' | 'both-keep' | 'skip';
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'models' | 'sync' | 'general'>('models');
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);

  const [syncConfig, setSyncConfig] = useState<SyncConfigForm>({
    url: '', username: '', password: '', remotePath: '/graphmind', conflictStrategy: 'local-wins',
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'testing' | 'connected' | 'error' | 'syncing' | 'preview'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncPreview, setSyncPreview] = useState<{ upload: number; download: number; conflict: number; skip: number; total: number } | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ phase: string; completed: number; total: number; currentFile?: string } | null>(null);

  const loadModels = useCallback(async () => {
    try {
      const result = await (window as any).graphmind?.agent?.models?.();
      if (result) {
        setModels(result.models);
        setAvailability(result.availability);
      }
    } catch {}
  }, []);

  const loadSyncConfig = useCallback(async () => {
    try {
      const result = await (window as any).graphmind?.sync?.getConfig?.();
      if (result?.configured) {
        setSyncConfig((prev) => ({
          ...prev,
          url: result.url,
          username: result.username,
          remotePath: result.remotePath,
          conflictStrategy: result.conflictStrategy || 'local-wins',
          password: result.hasPassword ? '********' : '',
        }));
        setSyncStatus('connected');
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      loadModels();
      loadSyncConfig();
    }
  }, [open, loadModels, loadSyncConfig]);

  useEffect(() => {
    if (!open) return;
    const unsub = (window as any).graphmind?.sync?.onProgress?.((progress: any) => {
      setSyncProgress(progress);
    });
    return () => { unsub?.(); };
  }, [open]);

  if (!open) return null;

  const handleUpdateModel = async (modelId: string, updates: Partial<ModelConfig>) => {
    try {
      await (window as any).graphmind?.agent?.updateModel?.(modelId, updates);
      setModels((prev) => prev.map((m) => m.id === modelId ? { ...m, ...updates } : m));
    } catch {}
  };

  const handleSetPrimary = async (modelId: string) => {
    try {
      await (window as any).graphmind?.agent?.switchModel?.(modelId);
      setPrimaryModel(modelId);
    } catch {}
  };

  const handleSaveSyncConfig = async () => {
    try {
      const password = syncConfig.password === '********' ? undefined : syncConfig.password || undefined;
      await (window as any).graphmind?.sync?.saveConfig?.({
        url: syncConfig.url,
        username: syncConfig.username,
        password,
        remotePath: syncConfig.remotePath,
        conflictStrategy: syncConfig.conflictStrategy,
      });
    } catch {}
  };

  const handleTestConnection = async () => {
    setSyncStatus('testing');
    setSyncError(null);
    try {
      await handleSaveSyncConfig();
      const result = await (window as any).graphmind?.sync?.testConnection?.();
      if (result?.success) {
        setSyncStatus('connected');
      } else {
        setSyncStatus('error');
        setSyncError(result?.error || 'Connection failed');
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncError(err.message);
    }
  };

  const handlePreviewSync = async () => {
    try {
      const result = await (window as any).graphmind?.sync?.preview?.();
      if (result?.success) {
        setSyncPreview({ upload: result.upload, download: result.download, conflict: result.conflict, skip: result.skip, total: result.total });
      } else {
        setSyncError(result?.error || 'Preview failed');
      }
    } catch (err: any) {
      setSyncError(err.message);
    }
  };

  const handleStartSync = async () => {
    setSyncStatus('syncing');
    setSyncProgress(null);
    try {
      const result = await (window as any).graphmind?.sync?.start?.('bidirectional');
      if (result?.success) {
        setSyncStatus('idle');
        setSyncPreview(null);
      } else {
        setSyncStatus('error');
        setSyncError(result?.error || 'Sync failed');
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative flex h-[560px] w-[640px] flex-col rounded-lg border border-border-subtle bg-surface-raised shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <button onClick={onClose} className="topbar-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.94L4.53 3.47 3.47 4.53 6.94 8 3.47 11.47l1.06 1.06L8 9.06l3.47 3.47 1.06-1.06L9.06 8l3.47-3.47-1.06-1.06L8 6.94z" /></svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <nav className="w-40 border-r border-border-subtle p-2">
            {(['models', 'sync', 'general'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`mb-0.5 flex w-full items-center rounded px-2 py-1.5 text-sm capitalize ${activeTab === tab ? 'bg-primary-500/20 text-primary-300' : 'text-text-secondary hover:bg-surface-overlay'}`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {activeTab === 'models' && (
              <div className="space-y-3">
                <p className="text-xs text-text-disabled">Configure LLM providers to enable Agent responses.</p>
                {models.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    available={availability[model.id] ?? false}
                    isPrimary={primaryModel === model.id}
                    onUpdate={handleUpdateModel}
                    onSetPrimary={handleSetPrimary}
                  />
                ))}
              </div>
            )}
            {activeTab === 'sync' && (
              <div className="space-y-3">
                <p className="text-xs text-text-disabled">WebDAV bidirectional sync for your vault.</p>

                <div>
                  <label className="mb-0.5 block text-xs text-text-disabled">Server URL</label>
                  <input
                    type="text"
                    value={syncConfig.url}
                    onChange={(e) => setSyncConfig((p) => ({ ...p, url: e.target.value }))}
                    placeholder="https://dav.example.com"
                    className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-xs text-text-disabled">Username</label>
                    <input
                      type="text"
                      value={syncConfig.username}
                      onChange={(e) => setSyncConfig((p) => ({ ...p, username: e.target.value }))}
                      placeholder="user"
                      className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-text-disabled">Password</label>
                    <input
                      type="password"
                      value={syncConfig.password}
                      onChange={(e) => setSyncConfig((p) => ({ ...p, password: e.target.value }))}
                      placeholder="password or token"
                      className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-text-disabled">Remote Path</label>
                  <input
                    type="text"
                    value={syncConfig.remotePath}
                    onChange={(e) => setSyncConfig((p) => ({ ...p, remotePath: e.target.value }))}
                    placeholder="/graphmind"
                    className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-text-disabled">Conflict Strategy</label>
                  <select
                    value={syncConfig.conflictStrategy}
                    onChange={(e) => setSyncConfig((p) => ({ ...p, conflictStrategy: e.target.value as any }))}
                    className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="local-wins">Local wins (overwrite remote)</option>
                    <option value="remote-wins">Remote wins (overwrite local)</option>
                    <option value="both-keep">Keep both (create .conflict.md)</option>
                    <option value="skip">Skip conflicts</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleTestConnection}
                    disabled={!syncConfig.url || syncStatus === 'testing'}
                    className="rounded bg-surface-overlay px-3 py-1 text-xs text-text-primary hover:bg-surface-overlay/80 disabled:opacity-50"
                  >
                    {syncStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  {syncStatus === 'connected' && <span className="text-xs text-success">Connected</span>}
                  {syncStatus === 'error' && <span className="text-xs text-error">{syncError}</span>}
                </div>

                {(syncStatus === 'connected' || syncStatus === 'syncing' || syncStatus === 'preview') && (
                  <div className="border-t border-border-subtle pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePreviewSync}
                        className="rounded bg-surface-overlay px-3 py-1 text-xs text-text-primary hover:bg-surface-overlay/80"
                      >
                        Preview Changes
                      </button>
                      {syncPreview && (
                        <button
                          onClick={handleStartSync}
                          disabled={syncStatus === 'syncing'}
                          className="rounded bg-primary-500 px-3 py-1 text-xs text-white hover:bg-primary-600 disabled:opacity-50"
                        >
                          {syncStatus === 'syncing' ? 'Syncing...' : 'Start Sync'}
                        </button>
                      )}
                    </div>

                    {syncPreview && (
                      <div className="mt-2 rounded border border-border-subtle bg-surface-base p-2 text-xs">
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div><span className="text-success">{syncPreview.upload}</span> upload</div>
                          <div><span className="text-blue-400">{syncPreview.download}</span> download</div>
                          <div><span className="text-warning">{syncPreview.conflict}</span> conflict</div>
                          <div><span className="text-text-disabled">{syncPreview.skip}</span> skip</div>
                        </div>
                      </div>
                    )}

                    {syncProgress && syncStatus === 'syncing' && (
                      <div className="mt-2 text-xs text-text-secondary">
                        <span className="capitalize">{syncProgress.phase}</span> {syncProgress.completed}/{syncProgress.total}
                        {syncProgress.currentFile && <span className="ml-1 text-text-disabled">{syncProgress.currentFile}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-medium text-text-primary">Appearance</h3>
                  <div className="flex gap-2">
                    {(['dark', 'light', 'system'] as const).map((mode) => {
                      const themeStore = useThemeStore.getState();
                      const isActive = themeStore.mode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => useThemeStore.getState().setMode(mode)}
                          className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                            isActive
                              ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                              : 'border-border-subtle bg-surface-base text-text-secondary hover:border-border-default'
                          }`}
                        >
                          <span className="text-lg">{mode === 'dark' ? '🌙' : mode === 'light' ? '☀️' : '💻'}</span>
                          <span className="text-xs capitalize">{mode}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-text-disabled">
                    Current: {useThemeStore.getState().resolvedTheme} mode
                    {useThemeStore.getState().mode === 'system' && ' (following system)'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelCard({ model, available, isPrimary, onUpdate, onSetPrimary }: {
  model: ModelConfig;
  available: boolean;
  isPrimary: boolean;
  onUpdate: (id: string, updates: Partial<ModelConfig>) => void;
  onSetPrimary: (id: string) => void;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState(model.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(model.baseUrl ?? '');

  const typeLabel: Record<string, string> = { openai: 'OpenAI', claude: 'Claude', local: 'Local', custom: 'Custom' };
  const typeColor: Record<string, string> = { openai: 'text-green-400', claude: 'text-orange-400', local: 'text-blue-400', custom: 'text-purple-400' };

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${typeColor[model.type]}`}>{typeLabel[model.type]}</span>
          <span className="text-sm text-text-primary">{model.name}</span>
          {available && <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />}
          {isPrimary && <span className="rounded bg-primary-500/20 px-1 py-0.5 text-xs text-primary-300">Active</span>}
        </div>
        <div className="flex items-center gap-1">
          {(model.type !== 'local') && (
            <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-text-secondary hover:text-text-primary">
              {showConfig ? 'Hide' : 'Configure'}
            </button>
          )}
          <button
            onClick={() => {
              onUpdate(model.id, { enabled: !model.enabled });
              if (apiKey) onUpdate(model.id, { apiKey });
              if (baseUrl) onUpdate(model.id, { baseUrl });
            }}
            className={`relative h-4 w-7 rounded-full transition-colors ${model.enabled ? 'bg-primary-500' : 'bg-surface-overlay'}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${model.enabled ? 'left-3.5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {showConfig && model.type !== 'local' && (
        <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <div>
            <label className="mb-0.5 block text-xs text-text-disabled">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => apiKey && onUpdate(model.id, { apiKey })}
              placeholder="sk-..."
              className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          {model.type === 'custom' && (
            <div>
              <label className="mb-0.5 block text-xs text-text-disabled">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => baseUrl && onUpdate(model.id, { baseUrl })}
                placeholder="https://api.example.com/v1"
                className="w-full rounded bg-surface-overlay/50 px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}
          <button
            onClick={() => onSetPrimary(model.id)}
            className="rounded bg-primary-500 px-3 py-1 text-xs text-white hover:bg-primary-600 disabled:opacity-50"
            disabled={!model.enabled}
          >
            Set as Primary
          </button>
        </div>
      )}

      {model.type === 'local' && (
        <p className="mt-2 text-xs text-text-disabled">Start llama.cpp server: <code className="rounded bg-surface-overlay px-1">./llama-server -m model.gguf --port 8080</code></p>
      )}
    </div>
  );
}
