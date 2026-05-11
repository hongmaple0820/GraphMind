import type { IpcMain, BrowserWindow } from 'electron';
import { LLMRouter } from '../services/llm/router.js';
import { ToolRegistry, builtinTools } from '../services/agent/tools.js';
import { AgentCore } from '../services/agent/core.js';
import type { ChatMessage } from '../services/llm/types.js';
import { notesIndex, parseCache } from './file-handlers.js';
import { adjacency, reverseIndex } from './graph-handlers.js';

interface ConversationState {
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const conversations = new Map<string, ConversationState>();
let router: LLMRouter | null = null;
let toolRegistry: ToolRegistry | null = null;

function getOrCreateRouter(): LLMRouter {
  if (!router) {
    router = new LLMRouter();
  }
  return router;
}

function getOrCreateToolRegistry(): ToolRegistry {
  if (!toolRegistry) {
    toolRegistry = new ToolRegistry();
    for (const tool of builtinTools) {
      toolRegistry.register(tool);
    }
  }
  return toolRegistry;
}

function createAgentContext(vaultPath: string) {
  return {
    graphEngine: {
      query: async (args: unknown) => {
        if (!(globalThis as any).__mainWindow) return { nodes: [], edges: [] };
        const win = (globalThis as any).__mainWindow as BrowserWindow;
        return win.webContents.executeJavaScript(
          `window.graphmind?.graph?.query(${JSON.stringify(args)}) ?? { nodes: [], edges: [] }`,
        );
      },
      getBacklinks: async (nodeId: string) => {
        return { edges: [] };
      },
    },
    fileManager: {
      read: async (path: string) => {
        const fs = await import('node:fs/promises');
        return fs.readFile(path, 'utf-8');
      },
      write: async (path: string, content: string) => {
        const fs = await import('node:fs/promises');
        const pathMod = await import('node:path');
        await fs.mkdir(pathMod.dirname(path), { recursive: true });
        await fs.writeFile(path, content, 'utf-8');
      },
      create: async (vaultPath: string, title: string, content?: string) => {
        const fs = await import('node:fs/promises');
        const pathMod = await import('node:path');
        const fileName = title.replace(/[/\\?%*:|"<>]/g, '-') + '.md';
        const filePath = pathMod.join(vaultPath, fileName);
        await fs.writeFile(filePath, content ?? `# ${title}\n\n`, 'utf-8');
        return { path: filePath, noteId: title };
      },
    },
    syncManager: {
      startSync: async (direction: string) => {
        try {
          const { ipcMain } = await import('electron');
          const win = (globalThis as any).__mainWindow as BrowserWindow;
          return win.webContents.executeJavaScript(
            `window.graphmind?.sync?.start?.('${direction}') ?? { error: 'Sync not available' }`,
          );
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },
      getStatus: async () => {
        return { status: 'idle' };
      },
    },
    notesIndex,
    parseCache,
    vaultPath,
  };
}

export function registerAgentHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {
  (globalThis as any).__mainWindow = mainWindow;

  ipcMain.handle('agent:chat', async (_event, args: { message: string; conversationId?: string; model?: string; vaultPath?: string }) => {
    const convId = args.conversationId ?? `conv-${Date.now()}`;
    if (!conversations.has(convId)) {
      conversations.set(convId, { messages: [], createdAt: Date.now(), updatedAt: Date.now() });
    }
    const conv = conversations.get(convId)!;

    conv.messages.push({ role: 'user', content: args.message });

    const r = getOrCreateRouter();
    const tr = getOrCreateToolRegistry();
    const vaultPath = args.vaultPath ?? (globalThis as any).__vaultPath ?? '';
    const ctx = createAgentContext(vaultPath);
    const agent = new AgentCore(r, tr, ctx);

    try {
      const response = await agent.chat(args.message, conv.messages.slice(0, -1));

      try {
        const { getSharedHybridEngine } = await import('./rag-handlers.js');
        const engine = getSharedHybridEngine();
        if (engine) {
          for (const [noteId] of notesIndex) {
            const neighbors = new Set<string>();
            const fwd = adjacency.get(noteId);
            if (fwd) for (const eid of fwd) neighbors.add(eid.split('--')[1]);
            const rev = reverseIndex.get(noteId);
            if (rev) for (const eid of rev) neighbors.add(eid.split('--')[0]);
            if (neighbors.size > 0) {
              engine.setGraphNeighbors(noteId, Array.from(neighbors));
            }
          }
        }
      } catch {}

      conv.messages.push({ role: 'assistant', content: response.content });
      conv.updatedAt = Date.now();

      return {
        content: response.content,
        conversationId: convId,
        usage: response.usage,
        model: response.model,
      };
    } catch (err: any) {
      const errorMsg = `Agent error: ${err.message}\n\nPlease configure an LLM provider in Settings (Ctrl+,).\nSupported: OpenAI, Claude, Local (llama.cpp server).`;
      conv.messages.push({ role: 'assistant', content: errorMsg });
      return { content: errorMsg, conversationId: convId, usage: { promptTokens: 0, completionTokens: 0 } };
    }
  });

  ipcMain.handle('agent:conversations', async () => {
    return Array.from(conversations.entries()).map(([id, conv]) => ({
      id,
      messageCount: conv.messages.length,
      lastMessage: conv.messages[conv.messages.length - 1]?.content.slice(0, 100) ?? '',
      updatedAt: conv.updatedAt,
    }));
  });

  ipcMain.handle('agent:conversation-history', async (_event, args: { conversationId: string }) => {
    return conversations.get(args.conversationId)?.messages ?? [];
  });

  ipcMain.handle('agent:switch-model', async (_event, args: { modelId: string }) => {
    const r = getOrCreateRouter();
    r.setPrimary(args.modelId);
    return { success: true };
  });

  ipcMain.handle('agent:abort', async () => {
    // TODO: implement abort with AbortController
  });

  ipcMain.handle('agent:models', async () => {
    const r = getOrCreateRouter();
    const configs = r.getAllConfigs();
    const availability: Record<string, boolean> = {};
    for (const config of configs) {
      if (config.apiKey || config.type === 'local') {
        availability[config.id] = await r.checkAvailability(config.id);
      } else {
        availability[config.id] = false;
      }
    }
    return { models: configs, availability };
  });

  ipcMain.handle('agent:update-model', async (_event, args: { modelId: string; config: Record<string, unknown> }) => {
    const r = getOrCreateRouter();
    r.updateConfig(args.modelId, args.config as any);
    if (args.config['apiKey'] || args.config['enabled']) {
      r.registerProvider(r.getConfig(args.modelId)!);
    }
    return { success: true };
  });
}

export { getOrCreateRouter };
