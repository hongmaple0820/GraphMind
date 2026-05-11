export interface WindowGraphMind {
  file: {
    read: (path: string) => Promise<{ content: string; encoding: string }>;
    write: (path: string, content: string) => Promise<{ success: boolean }>;
    list: (dirPath: string) => Promise<{ name: string; path: string }[]>;
    watch: (
      dirPath: string,
      callback: (event: string, path: string) => void,
    ) => () => void;
  };
  graph: {
    query: (args: {
      nodeId?: string;
      query?: string;
      hops?: number;
      limit?: number;
    }) => Promise<{ nodes: unknown[]; edges: unknown[] }>;
    getBacklinks: (nodeId: string) => Promise<{ edges: unknown[] }>;
    onGraphUpdate: (callback: (event: unknown) => void) => () => void;
  };
  agent: {
    chat: (args: {
      message: string;
      conversationId?: string;
      model?: string;
    }) => Promise<unknown>;
    chatStream: (args: {
      message: string;
      conversationId?: string;
      model?: string;
    }) => MessagePort;
    switchModel: (modelId: string) => Promise<void>;
    abortGeneration: () => Promise<void>;
  };
  sync: {
    start: (
      direction: 'upload' | 'download' | 'bidirectional',
    ) => Promise<{ syncId: string }>;
    onProgress: (callback: (progress: unknown) => void) => () => void;
  };
  getConfig: () => Promise<unknown>;
  setConfig: (key: string, value: unknown) => Promise<void>;
}

declare global {
  interface Window {
    graphmind: WindowGraphMind;
  }
}
