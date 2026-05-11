import type { IpcMain, BrowserWindow } from 'electron';
import { SyncEngine, type SyncDecision, type ConflictStrategy } from '../services/sync/engine.js';
import Store from 'electron-store';

interface SyncConfig {
  url: string;
  username: string;
  password?: string;
  remotePath: string;
  conflictStrategy: ConflictStrategy;
}

const store = new Store({ name: 'graphmind-sync' });
let activeEngine: SyncEngine | null = null;
let isSyncing = false;

function getSyncConfig(): SyncConfig | null {
  return (store.get('webdav') as SyncConfig) ?? null;
}

function saveSyncConfig(config: SyncConfig) {
  store.set('webdav', config);
}

export function registerSyncHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {
  ipcMain.handle('sync:get-config', async () => {
    const config = getSyncConfig();
    if (!config) return { configured: false };
    return {
      configured: true,
      url: config.url,
      username: config.username,
      remotePath: config.remotePath,
      conflictStrategy: config.conflictStrategy,
      hasPassword: !!config.password,
    };
  });

  ipcMain.handle('sync:save-config', async (_event, args: { url: string; username: string; password?: string; remotePath: string; conflictStrategy?: ConflictStrategy }) => {
    const config: SyncConfig = {
      url: args.url,
      username: args.username,
      password: args.password,
      remotePath: args.remotePath || '/graphmind',
      conflictStrategy: args.conflictStrategy || 'local-wins',
    };
    saveSyncConfig(config);
    return { success: true };
  });

  ipcMain.handle('sync:test-connection', async () => {
    const config = getSyncConfig();
    if (!config) return { success: false, error: 'Not configured' };

    const vaultPath = (globalThis as any).__vaultPath as string | undefined;
    if (!vaultPath) return { success: false, error: 'No vault path' };

    const engine = new SyncEngine({
      url: config.url,
      username: config.username,
      password: config.password,
      remotePath: config.remotePath,
      localPath: vaultPath,
    });

    return engine.testConnection();
  });

  ipcMain.handle('sync:start', async (_event, args: { direction?: 'upload' | 'download' | 'bidirectional' } = {}) => {
    if (isSyncing) return { error: 'Sync already in progress' };

    const config = getSyncConfig();
    if (!config) return { error: 'Not configured' };

    const vaultPath = (globalThis as any).__vaultPath as string | undefined;
    if (!vaultPath) return { error: 'No vault path' };

    isSyncing = true;
    const engine = new SyncEngine({
      url: config.url,
      username: config.username,
      password: config.password,
      remotePath: config.remotePath,
      localPath: vaultPath,
    });
    activeEngine = engine;

    engine.onProgressUpdate((progress) => {
      mainWindow.webContents.send('sync:progress', progress);
    });

    try {
      const localIndex = await engine.scanLocal();
      const remoteIndex = await engine.scanRemote();

      let decisions = engine.computeSyncPlan(localIndex, remoteIndex);

      if (args.direction === 'upload') {
        decisions = decisions.filter((d) => d.action !== 'download');
      } else if (args.direction === 'download') {
        decisions = decisions.filter((d) => d.action !== 'upload');
      }

      const result = await engine.executeSync(decisions, config.conflictStrategy);

      mainWindow.webContents.send('sync:progress', { phase: 'done', completed: decisions.length, total: decisions.length });
      return { success: true, ...result };
    } catch (err: any) {
      return { error: err.message };
    } finally {
      isSyncing = false;
      activeEngine = null;
    }
  });

  ipcMain.handle('sync:preview', async () => {
    const config = getSyncConfig();
    if (!config) return { error: 'Not configured' };

    const vaultPath = (globalThis as any).__vaultPath as string | undefined;
    if (!vaultPath) return { error: 'No vault path' };

    const engine = new SyncEngine({
      url: config.url,
      username: config.username,
      password: config.password,
      remotePath: config.remotePath,
      localPath: vaultPath,
    });

    try {
      const localIndex = await engine.scanLocal();
      const remoteIndex = await engine.scanRemote();
      const decisions = engine.computeSyncPlan(localIndex, remoteIndex);

      const summary = {
        upload: decisions.filter((d) => d.action === 'upload').length,
        download: decisions.filter((d) => d.action === 'download').length,
        conflict: decisions.filter((d) => d.action === 'conflict').length,
        skip: decisions.filter((d) => d.action === 'skip').length,
        total: decisions.length,
        details: decisions.filter((d) => d.action !== 'skip').map((d) => ({
          path: d.path,
          action: d.action,
        })),
      };

      return { success: true, ...summary };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('sync:status', async () => {
    return {
      status: isSyncing ? 'syncing' : 'idle',
      lastSync: store.get('lastSyncTime') as number | null,
    };
  });

  ipcMain.handle('sync:resolve-conflict', async (_event, args: { path: string; strategy: ConflictStrategy }) => {
    if (!activeEngine) return { error: 'No active sync' };
    return { success: true };
  });

  ipcMain.handle('sync:resume', async () => {
    if (isSyncing) return { error: 'Sync already in progress' };

    const config = getSyncConfig();
    if (!config) return { error: 'Not configured' };

    const vaultPath = (globalThis as any).__vaultPath as string | undefined;
    if (!vaultPath) return { error: 'No vault path' };

    isSyncing = true;
    const engine = new SyncEngine({
      url: config.url,
      username: config.username,
      password: config.password,
      remotePath: config.remotePath,
      localPath: vaultPath,
    });
    activeEngine = engine;

    try {
      const result = await engine.resumePendingUploads();
      return { success: true, ...result };
    } catch (err: any) {
      return { error: err.message };
    } finally {
      isSyncing = false;
      activeEngine = null;
    }
  });
}
