import type { IpcMain, BrowserWindow } from 'electron';
import { PluginRegistry } from '../services/plugins/registry.js';
import type { PluginPermission, PluginAPI } from '../services/plugins/types.js';
import path from 'node:path';

let registry: PluginRegistry | null = null;

function getRegistry(vaultPath: string): PluginRegistry {
  if (!registry) {
    const pluginsDir = path.join(vaultPath, '.graphmind', 'plugins');
    registry = new PluginRegistry(pluginsDir, (permissions) => createPluginAPI(permissions));
  }
  return registry;
}

function createPluginAPI(permissions: PluginPermission[]): PluginAPI {
  const hasPermission = (perm: PluginPermission) => permissions.includes(perm);

  return {
    file: {
      read: async (filePath: string) => {
        if (!hasPermission('file:read')) throw new Error('Permission denied: file:read');
        const fs = await import('node:fs/promises');
        return fs.readFile(filePath, 'utf-8');
      },
      write: async (filePath: string, content: string) => {
        if (!hasPermission('file:write')) throw new Error('Permission denied: file:write');
        const fs = await import('node:fs/promises');
        const pathMod = await import('node:path');
        await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
      },
    },
    graph: {
      query: async (args: unknown) => {
        if (!hasPermission('graph:read')) throw new Error('Permission denied: graph:read');
        return { nodes: [], edges: [] };
      },
      getBacklinks: async (nodeId: string) => {
        if (!hasPermission('graph:read')) throw new Error('Permission denied: graph:read');
        return { edges: [] };
      },
    },
    agent: {
      chat: async (message: string) => {
        if (!hasPermission('agent:call')) throw new Error('Permission denied: agent:call');
        return '[Plugin API] Agent call not available in plugin context';
      },
    },
    rag: {
      query: async (query: string, topK?: number) => {
        if (!hasPermission('rag:query')) throw new Error('Permission denied: rag:query');
        return [];
      },
    },
    ui: {
      registerCommand: (id: string, label: string, action: () => void) => {
        if (!hasPermission('ui:command')) throw new Error('Permission denied: ui:command');
      },
      registerPanel: (id: string, label: string, component: unknown) => {
        if (!hasPermission('ui:panel')) throw new Error('Permission denied: ui:panel');
      },
    },
  };
}

export function registerPluginHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {
  ipcMain.handle('plugins:list', async (_event, args: { vaultPath: string }) => {
    const reg = getRegistry(args.vaultPath);
    const plugins = reg.getAllPlugins();
    return plugins.map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      permissions: p.manifest.permissions ?? [],
      activated: p.activated,
    }));
  });

  ipcMain.handle('plugins:scan', async (_event, args: { vaultPath: string }) => {
    const reg = getRegistry(args.vaultPath);
    const manifests = await reg.scanPlugins();
    return manifests;
  });

  ipcMain.handle('plugins:activate', async (_event, args: { vaultPath: string; pluginId: string }) => {
    const reg = getRegistry(args.vaultPath);
    const manifests = await reg.scanPlugins();
    const manifest = manifests.find((m) => m.id === args.pluginId);
    if (!manifest) return { error: 'Plugin not found' };

    try {
      const instance = await reg.loadPlugin(manifest);
      await instance.activate();
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('plugins:deactivate', async (_event, args: { vaultPath: string; pluginId: string }) => {
    const reg = getRegistry(args.vaultPath);
    await reg.unloadPlugin(args.pluginId);
    return { success: true };
  });

  ipcMain.handle('plugins:extensions', async (_event, args: { vaultPath: string; type: string }) => {
    const reg = getRegistry(args.vaultPath);
    return reg.getExtensions(args.type as any);
  });
}
