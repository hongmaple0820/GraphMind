# GraphMind

Local-first AI-powered knowledge base with graph-driven navigation.

## Features

- **Graph-Driven Navigation**: Visualize note connections via `[[wiki-links]]` and tags using Cytoscape.js
- **AI Agent**: Chat with your knowledge base using local (llama.cpp) or cloud (OpenAI/Claude) LLMs
- **RAG Pipeline**: Hybrid search (Vector + BM25 + Graph) for context-aware answers
- **WebDAV Sync**: Bidirectional sync with conflict resolution strategies
- **Plugin System**: Extensible via sandboxed plugins with permission control
- **Theme System**: Dark/Light/System theme with CSS variable design tokens

## Tech Stack

- **Runtime**: Electron 34+ / Node.js 22+
- **Frontend**: React 18, TypeScript 5, TailwindCSS 3, CodeMirror 6, Cytoscape.js
- **State**: Zustand with persistence
- **AI**: Multi-model router (OpenAI / Claude / Local / Custom)
- **Search**: Vectra (vector) + BM25 + hybrid reranking
- **Sync**: WebDAV client library
- **Build**: Vite 6 + vite-plugin-electron

## Project Structure

```
apps/desktop/
  src/main/           Electron main process
    ipc/              IPC handlers (file/graph/agent/sync/rag/plugin)
    services/         Business logic
      agent/          AgentCore + ToolRegistry + ReAct loop
      indexer/        IncrementalIndexer (contentHash + paragraph diff)
      llm/            LLMRouter + providers (OpenAI/Claude/Local/Custom)
      plugins/        PluginRegistry + permission sandbox
      rag/            RAGService + BM25Index + HybridSearchEngine
      sync/           SyncEngine (WebDAV bidirectional)
    preload.ts        contextBridge API
    index.ts          Electron entry + auto-updater
  src/renderer/       React UI
    layout/           TopBar, Sidebar, MainContent
    editor/           CodeMirror 6 with wiki-link support
    graph/            Cytoscape.js dagre graph view
    agent/            AgentPanel with tool logs
    settings/         SettingsModal (models/sync/general)
    shared/           CommandPalette
    stores/           Zustand stores (app + theme)
packages/shared/      Shared types and parsers
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev --workspace=apps/desktop

# Run unit tests (Node)
npm test

# Run renderer component tests
npx vitest run --config vitest.renderer.config.ts

# Build all (renderer + main + preload)
npm run build --workspace=apps/desktop

# Type check
npm run typecheck --workspace=apps/desktop

# Lint
npm run lint --workspace=apps/desktop
```

## Building for Production

```bash
# Build + package for current platform
npm run electron:build --workspace=apps/desktop

# Platform-specific
npm run electron:build:mac --workspace=apps/desktop
npm run electron:build:win --workspace=apps/desktop
npm run electron:build:linux --workspace=apps/desktop
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Command Palette |
| Ctrl+J | Toggle Agent Panel |
| Ctrl+, | Settings |
| Ctrl+G | Graph View |
| Ctrl+N | New Note |

## Architecture Decisions

- **ADR-001**: Electron over Tauri - Node.js runtime needed for llama.cpp, chokidar, WebDAV
- **ADR-002**: Vectra over LanceDB - LanceDB native binding install fails; Vectra is pure JS
- **ADR-003**: JSON adjacency list over graph DB - <10K nodes, avoids external dependency
- **ADR-004**: llama.cpp server HTTP API - Process isolation over direct node binding
- **ADR-005**: CSS variables for theming - Enables runtime theme switching without rebuild

## License

MIT
