import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('graphmind', {
  file: {
    read: (path: string) => ipcRenderer.invoke('file:read', { path }),
    write: (path: string, content: string) => ipcRenderer.invoke('file:write', { path, content }),
    list: (dirPath: string) => ipcRenderer.invoke('file:list', { path: dirPath }),
    watch: (dirPath: string, callback: (event: string, path: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, args: { event: string; path: string }) => {
        callback(args.event, args.path);
      };
      ipcRenderer.on('file:watch-event', handler);
      ipcRenderer.invoke('file:watch', { path: dirPath });
      return () => {
        ipcRenderer.removeListener('file:watch-event', handler);
      };
    },
    indexVault: (vaultPath: string) => ipcRenderer.invoke('file:index-vault', { vaultPath }),
    incrementalIndex: (vaultPath: string) => ipcRenderer.invoke('file:incremental-index', { vaultPath }),
    create: (vaultPath: string, title: string, content?: string) =>
      ipcRenderer.invoke('file:create', { vaultPath, title, content }),
  },
  graph: {
    query: (args: { nodeId?: string; query?: string; hops?: number; limit?: number }) =>
      ipcRenderer.invoke('graph:query', args),
    getBacklinks: (nodeId: string) => ipcRenderer.invoke('graph:backlinks', { nodeId }),
    onGraphUpdate: (callback: (event: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, args: unknown) => callback(args);
      ipcRenderer.on('graph:updated', handler);
      return () => ipcRenderer.removeListener('graph:updated', handler);
    },
  },
  agent: {
    chat: (args: { message: string; conversationId?: string; model?: string; vaultPath?: string }) =>
      ipcRenderer.invoke('agent:chat', args),
    chatStream: (args: { message: string; conversationId?: string; model?: string }) => {
      const channel = new MessageChannel();
      ipcRenderer.postMessage('agent:chat-stream', args, [channel.port2]);
      return channel.port1;
    },
    switchModel: (modelId: string) => ipcRenderer.invoke('agent:switch-model', { modelId }),
    models: () => ipcRenderer.invoke('agent:models'),
    updateModel: (modelId: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('agent:update-model', { modelId, config }),
    abortGeneration: () => ipcRenderer.invoke('agent:abort'),
  },
  sync: {
    getConfig: () => ipcRenderer.invoke('sync:get-config'),
    saveConfig: (args: { url: string; username: string; password?: string; remotePath: string; conflictStrategy?: string }) =>
      ipcRenderer.invoke('sync:save-config', args),
    testConnection: () => ipcRenderer.invoke('sync:test-connection'),
    preview: () => ipcRenderer.invoke('sync:preview'),
    start: (direction?: 'upload' | 'download' | 'bidirectional') =>
      ipcRenderer.invoke('sync:start', { direction }),
    status: () => ipcRenderer.invoke('sync:status'),
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, args: unknown) => callback(args);
      ipcRenderer.on('sync:progress', handler);
      return () => ipcRenderer.removeListener('sync:progress', handler);
    },
    resume: () => ipcRenderer.invoke('sync:resume'),
  },
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', { key, value }),
  rag: {
    query: (args: { query: string; topK?: number; vaultPath: string }) =>
      ipcRenderer.invoke('rag:query', args),
    bm25Query: (args: { query: string; topK?: number }) =>
      ipcRenderer.invoke('rag:bm25-query', args),
    indexNote: (args: { noteId: string; content: string; vaultPath: string }) =>
      ipcRenderer.invoke('rag:index-note', args),
    removeNote: (args: { noteId: string; vaultPath: string }) =>
      ipcRenderer.invoke('rag:remove-note', args),
    indexVault: (vaultPath: string) =>
      ipcRenderer.invoke('rag:index-vault', { vaultPath }),
    assembleContext: (args: { query: string; vaultPath: string; topK?: number; maxTokens?: number }) =>
      ipcRenderer.invoke('rag:assemble-context', args),
    setEmbeddingConfig: (args: { type: string; apiUrl?: string; apiKey?: string; model?: string; dimensions?: number }) =>
      ipcRenderer.invoke('rag:set-embedding-config', args),
    getEmbeddingConfig: () => ipcRenderer.invoke('rag:get-embedding-config'),
  },
  plugins: {
    list: (vaultPath: string) => ipcRenderer.invoke('plugins:list', { vaultPath }),
    scan: (vaultPath: string) => ipcRenderer.invoke('plugins:scan', { vaultPath }),
    activate: (vaultPath: string, pluginId: string) =>
      ipcRenderer.invoke('plugins:activate', { vaultPath, pluginId }),
    deactivate: (vaultPath: string, pluginId: string) =>
      ipcRenderer.invoke('plugins:deactivate', { vaultPath, pluginId }),
    extensions: (vaultPath: string, type: string) =>
      ipcRenderer.invoke('plugins:extensions', { vaultPath, type }),
  },
});
