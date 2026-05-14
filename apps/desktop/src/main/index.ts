import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import { registerFileHandlers } from './ipc/file-handlers.js';
import { registerGraphHandlers } from './ipc/graph-handlers.js';
import { registerAgentHandlers } from './ipc/agent-handlers.js';
import { registerSyncHandlers } from './ipc/sync-handlers.js';
import { registerRAGHandlers } from './ipc/rag-handlers.js';
import { registerPluginHandlers } from './ipc/plugin-handlers.js';

const store = new Store({ name: 'graphmind-config' });
let mainWindow: BrowserWindow | null = null;

function setVaultPath(vp: string) {
  (globalThis as Record<string, unknown>).__vaultPath = vp;
  store.set('vaultPath', vp);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'GraphMind',
    backgroundColor: '#0F172A',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerFileHandlers(ipcMain, mainWindow);
  registerGraphHandlers(ipcMain, mainWindow);
  registerAgentHandlers(ipcMain, mainWindow);
  registerSyncHandlers(ipcMain, mainWindow);
  registerRAGHandlers(ipcMain, mainWindow);
  registerPluginHandlers(ipcMain, mainWindow);

  const initialVaultPath = (store.get('vaultPath') as string) ?? app.getPath('documents');
  setVaultPath(initialVaultPath);

  ipcMain.handle('config:get', async () => ({
    vaultPath: (store.get('vaultPath') as string) ?? app.getPath('documents'),
    theme: (store.get('theme') as string) ?? 'dark',
  }));

  ipcMain.handle('config:set', async (_event, args: { key: string; value: unknown }) => {
    store.set(args.key, args.value);
    if (args.key === 'vaultPath' && typeof args.value === 'string') {
      setVaultPath(args.value);
      mainWindow?.webContents.send('config:vault-changed', args.value);
    }
    return { success: true };
  });

  ipcMain.handle('config:select-vault', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select Vault Directory',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    const selectedPath = result.filePaths[0]!;
    setVaultPath(selectedPath);
    mainWindow?.webContents.send('config:vault-changed', selectedPath);
    return { vaultPath: selectedPath };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

if (!process.env.VITE_DEV_SERVER_URL) {
  import('electron-updater').then(({ autoUpdater }) => {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('update:available');
    });

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update:progress', progress);
    });

    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:downloaded');
    });

    ipcMain.handle('update:check', async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return { updateAvailable: !!result, version: result?.updateInfo?.version };
      } catch {
        return { updateAvailable: false };
      }
    });

    ipcMain.handle('update:download', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });

    ipcMain.handle('update:install', async () => {
      autoUpdater.quitAndInstall(false);
    });
  }).catch(() => {});
}
