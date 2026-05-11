export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  permissions?: PluginPermission[];
}

export type PluginPermission = 'file:read' | 'file:write' | 'graph:read' | 'graph:write' | 'agent:call' | 'rag:query' | 'ui:panel' | 'ui:command';

export interface PluginAPI {
  file: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
  };
  graph: {
    query: (args: unknown) => Promise<unknown>;
    getBacklinks: (nodeId: string) => Promise<unknown>;
  };
  agent: {
    chat: (message: string) => Promise<string>;
  };
  rag: {
    query: (query: string, topK?: number) => Promise<unknown>;
  };
  ui: {
    registerCommand: (id: string, label: string, action: () => void) => void;
    registerPanel: (id: string, label: string, component: unknown) => void;
  };
}

export interface PluginInstance {
  manifest: PluginManifest;
  api: PluginAPI;
  activated: boolean;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
}

export type PluginExtensionPoint = 'command' | 'panel' | 'tool' | 'theme' | 'view';

export interface PluginExtension {
  type: PluginExtensionPoint;
  id: string;
  pluginId: string;
  data: unknown;
}
