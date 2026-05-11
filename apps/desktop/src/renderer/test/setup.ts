import '@testing-library/jest-dom';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class LocalStorageMock {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
}
Object.defineProperty(window, 'localStorage', { value: new LocalStorageMock() });

const graphmindMock = {
  file: { read: async () => ({ content: '' }), write: async () => {}, list: async () => [], indexVault: async () => [], create: async () => ({ noteId: 'test' }) },
  graph: { query: async () => ({ nodes: [], edges: [] }), getBacklinks: async () => ({ edges: [] }) },
  agent: { chat: async () => ({ content: 'test response' }), models: async () => ({ models: [], availability: {} }), switchModel: async () => ({ success: true }), updateModel: async () => ({ success: true }) },
  sync: { getConfig: async () => ({ configured: false }), saveConfig: async () => ({ success: true }), testConnection: async () => ({ success: true }), preview: async () => ({}), start: async () => ({ success: true }), status: async () => ({ status: 'idle' }), onProgress: () => () => {} },
  rag: { query: async () => [], indexVault: async () => ({}), assembleContext: async () => ({ context: '', sources: [] }) },
  plugins: { list: async () => [], scan: async () => [], activate: async () => ({ success: true }), deactivate: async () => ({ success: true }), extensions: async () => [] },
  getConfig: async () => ({ vaultPath: '/tmp/test-vault', theme: 'dark' }),
  setConfig: async () => {},
};

Object.defineProperty(window, 'graphmind', { value: graphmindMock, writable: true });
