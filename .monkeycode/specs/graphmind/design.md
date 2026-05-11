# GraphMind 技术设计规格说明书

> 版本: v1.0 | 日期: 2026-05-08 | 状态: 评审中

---

## 1. 系统架构设计

### 1.1 架构总览

GraphMind 采用三层架构，基于 Electron 的多进程模型（Main Process + Renderer Process + Utility Process）实现关注点分离：

```
┌──────────────────────────────────────────────────────────────────┐
│                    Renderer Process (沙箱)                        │
│  React 18 + TypeScript + TailwindCSS + Zustand                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │  编辑器模块  │  │  图谱模块   │  │  Agent 模块 │  │  同步模块  │ │
│  │ CodeMirror6│  │ Cytoscape  │  │  Chat UI   │  │  Sync UI  │ │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘ │
│        └────────────────┴───────────────┴───────────────┘       │
│                         IPC (contextBridge)                       │
├──────────────────────────────────────────────────────────────────┤
│                    Main Process (Node.js)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │FileWatcher│ │GraphEngine│ │ AgentCore│ │SyncEngine│           │
│  │ chokidar  │ │ 构建查询   │ │ LLM Router│ │ WebDAV  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                         │
│  │Indexer   │ │ EventBus │ │ ConfigMgr│                         │
│  │ 增量索引  │ │ RxJS     │ │ 配置管理  │                         │
│  └──────────┘ └──────────┘ └──────────┘                         │
├──────────────────────────────────────────────────────────────────┤
│                    Utility Process (隔离)                         │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │ LLM Inference │  │ Embedding    │                              │
│  │ llama.cpp     │  │ ONNX Runtime │                              │
│  │ Worker Thread │  │ Worker Thread│                              │
│  └──────────────┘  └──────────────┘                              │
├──────────────────────────────────────────────────────────────────┤
│                    数据层                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Markdown │ │ Graph    │ │ Vector   │ │ SQLite   │           │
│  │ 文件系统  │ │ JSON    │ │ LanceDB  │ │ 元数据    │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 进程模型设计

| 进程 | 职责 | 技术 | 通信方式 |
|------|------|------|----------|
| **Renderer** | UI 渲染、用户交互 | React 18 + Vite | IPC invoke/handle |
| **Main** | 业务编排、文件系统、网络 | Node.js 20+ | IPC + EventBus |
| **Utility** | LLM 推理、Embedding 计算 | llama.cpp + ONNX | MessageChannel |

**进程间通信规范**：

```typescript
// IPC 通道命名规范: {domain}:{action}
// Renderer -> Main
ipcRenderer.invoke('file:read', { path: '/notes/test.md' })
ipcRenderer.invoke('graph:query', { nodeId: 'xxx', hops: 2 })
ipcRenderer.invoke('agent:chat', { message: '...', model: 'local' })
ipcRenderer.invoke('sync:start', { direction: 'bidirectional' })

// Main -> Utility (MessagePort)
const port = utilityProcess.fork('./llm-worker.js')
port.postMessage({ type: 'inference', payload: { prompt, stream: true } })
```

### 1.3 架构决策记录 (ADR)

#### ADR-001: 为什么选择 Electron 而非 Tauri

- **决策**: 采用 Electron 框架
- **背景**: 需要本地 Node.js 运行时支持 llama.cpp 绑定、文件系统监听、WebDAV 客户端
- **考量**: Tauri 包体更小但 Rust 学习曲线陡峭，且 llama.cpp Node 绑定生态更成熟
- **后果**: 安装包较大（~150MB），但开发效率高，生态丰富

#### ADR-002: 为什么选择 LanceDB 而非 Chroma/FAISS

- **决策**: 使用 LanceDB 作为嵌入式向量数据库
- **背景**: 需要 Rust 实现的高性能嵌入式向量存储，支持增量更新
- **考量**: FAISS 需要全量加载到内存；Chroma 需要独立服务进程；LanceDB 嵌入式、零配置、支持磁盘持久化
- **后果**: 向量查询性能略低于纯内存方案，但内存占用可控

#### ADR-003: 为什么图谱使用 JSON 邻接表而非图数据库

- **决策**: 使用轻量级 JSON 邻接表存储图谱数据
- **背景**: 知识图谱节点规模预计 < 10K，不需要重型图数据库
- **考量**: Neo4j 需要独立服务；内置图算法对桌面应用过重；JSON 邻接表 + 内存索引足够
- **后果**: 复杂图查询需自实现（最短路径、聚类），但避免了外部依赖

---

## 2. 核心模块详细设计

### 2.1 图谱构建引擎 (GraphEngine)

#### 2.1.1 数据模型

```typescript
interface GraphNode {
  id: string;                    // 笔记文件名（不含扩展名）
  title: string;                 // 笔记标题（首行 H1 或 Frontmatter title）
  filePath: string;              // 文件绝对路径
  tags: string[];                // 标签列表
  frontmatter: Record<string, unknown>;  // YAML 元数据
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
  contentHash: string;           // 内容 SHA-256 哈希（变更检测）
  embedding?: Float32Array;      // 语义向量（懒加载）
}

interface GraphEdge {
  id: string;                    // `${sourceId}--${targetId}--${type}`
  source: string;                // 源节点 ID
  target: string;                // 目标节点 ID
  type: EdgeType;                // 关系类型
  weight: number;                // 关系权重 0-1
  metadata?: {
    context?: string;            // 引用上下文（链接周围的文字）
    position?: { line: number; col: number };  // 链接位置
  };
}

type EdgeType = 'link_ref'       // [[双向链接]] 引用
  | 'tag_cooccurrence'           // 共现标签
  | 'temporal_seq'               // 时间顺序（同日创建）
  | 'semantic_sim';              // 语义相似（向量余弦 > 阈值）

interface GraphData {
  nodes: Map<string, GraphNode>;   // 节点索引
  edges: Map<string, GraphEdge>;   // 边索引
  adjacency: Map<string, Set<string>>;  // 邻接表 nodeId -> edgeIds
  reverseIndex: Map<string, Set<string>>;  // 反向引用 targetId -> edgeIds
}
```

#### 2.1.2 图谱构建流程

```
文件变更事件 (chokidar)
    │
    ▼
┌──────────────────────────────────────┐
│ 1. 变更检测                           │
│    比较 contentHash，跳过未变更文件      │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 2. 内容解析 (MarkdownParser)          │
│    a. 提取 [[wiki-links]] → link_ref │
│    b. 提取 #tags → tag_cooccurrence  │
│    c. 解析 YAML Frontmatter → 元数据  │
│    d. (V2) NLP 实体提取 → entity_ref  │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 3. 增量图更新                         │
│    a. 删除旧边（该文件的所有边）         │
│    b. 插入新边（解析结果）              │
│    c. 更新邻接表 + 反向索引             │
│    d. 触发 UI 事件 (graph:updated)    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 4. 持久化                             │
│    a. 写入 graph.json (debounced 5s) │
│    b. 更新 SQLite 元数据索引           │
└──────────────────────────────────────┘
```

#### 2.1.3 图查询 API

```typescript
class GraphEngine {
  getNode(id: string): GraphNode | null;
  getNeighbors(nodeId: string, hops?: number): GraphNode[];
  getEdgesBetween(source: string, target: string): GraphEdge[];
  getBacklinks(nodeId: string): GraphEdge[];
  shortestPath(from: string, to: string): string[];
  clusterNodes(algorithm: 'louvain' | 'label-prop'): Map<string, string[]>;
  search(query: string, limit?: number): GraphNode[];
  onGraphUpdate(callback: (event: GraphUpdateEvent) => void): () => void;
}
```

### 2.2 Agent 推理框架 (AgentCore)

#### 2.2.1 整体架构

```typescript
interface AgentCore {
  llmRouter: LLMRouter;
  toolRegistry: ToolRegistry;
  conversationMemory: ConversationMemory;
  ragPipeline: RAGPipeline;
}

class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private config: RouterConfig;

  async route(prompt: string, options: RouteOptions): Promise<LLMResponse> {
    // 本地优先策略
    const localProvider = this.providers.get('local');
    if (localProvider?.isAvailable()) {
      try {
        return await Promise.race([
          localProvider.complete(prompt, options),
          this.timeout(options.timeout ?? 30000)
        ]);
      } catch {
        // 本地超时/失败 → 降级云端
      }
    }
    // 降级到云端
    const cloudProvider = this.providers.get(options.fallbackProvider ?? 'openai');
    return cloudProvider.complete(prompt, options);
  }
}
```

#### 2.2.2 LLM Provider 接口

```typescript
interface LLMProvider {
  readonly id: string;
  readonly type: 'local' | 'openai' | 'claude' | 'custom';
  isAvailable(): boolean;
  complete(prompt: string, options: CompletionOptions): Promise<LLMResponse>;
  completeStream(prompt: string, options: CompletionOptions): AsyncIterable<LLMChunk>;
  getModelInfo(): ModelInfo;
  loadModel(modelPath: string, config: ModelLoadConfig): Promise<void>;
  unloadModel(): Promise<void>;
}

interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  timeout?: number;
  tools?: ToolDefinition[];
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  latency: number;
}

interface LLMChunk {
  content?: string;
  toolCall?: Partial<ToolCall>;
  done: boolean;
}
```

#### 2.2.3 本地 LLM Worker (Utility Process)

```typescript
// llm-worker.ts - 运行在 Utility Process
import { loadModel, createCompletion } from 'node-llama-cpp';

let model: LlamaModel | null = null;
let context: LlamaContext | null = null;

process.parentPort.on('message', async (msg) => {
  switch (msg.type) {
    case 'load-model': {
      model = await loadModel({
        modelPath: msg.payload.path,
        gpuLayers: 0,  // CPU-only 模式
        threads: 12,
        batchSize: 256,
        useMmap: true,
        useNuma: true,
      });
      context = await model.createContext();
      process.parentPort.postMessage({ type: 'model-loaded' });
      break;
    }
    case 'inference': {
      const stream = createCompletion(context, {
        prompt: msg.payload.prompt,
        maxTokens: msg.payload.maxTokens ?? 2048,
        temperature: msg.payload.temperature ?? 0.7,
      });
      for await (const chunk of stream) {
        process.parentPort.postMessage({
          type: 'chunk',
          id: msg.id,
          payload: { content: chunk, done: false },
        });
      }
      process.parentPort.postMessage({
        type: 'chunk',
        id: msg.id,
        payload: { done: true },
      });
      break;
    }
    case 'unload-model': {
      context?.dispose();
      model?.dispose();
      model = null;
      context = null;
      process.parentPort.postMessage({ type: 'model-unloaded' });
      break;
    }
  }
});
```

#### 2.2.4 工具注册与调用

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  duration: number;
  success: boolean;
  error?: string;
}

class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();

  register(tool: ToolHandler): void;
  unregister(name: string): void;
  getDefinitions(): ToolDefinition[];
  async execute(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

// 内置工具实现
const builtinTools: ToolHandler[] = [
  {
    name: 'graph_search',
    description: '搜索知识图谱中与查询相关的节点和关系',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        hops: { type: 'number', description: '扩展跳数', default: 1 },
        limit: { type: 'number', description: '返回数量上限', default: 10 },
      },
      required: ['query'],
    },
    execute: async (args, ctx) => {
      const nodes = ctx.graphEngine.search(args.query, args.limit);
      const neighbors = nodes.flatMap(n =>
        ctx.graphEngine.getNeighbors(n.id, args.hops)
      );
      return { nodes, neighbors };
    },
  },
  {
    name: 'rag_retrieve',
    description: '使用 RAG 混合检索从知识库中查找相关内容',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索查询' },
        topK: { type: 'number', description: '返回片段数', default: 5 },
      },
      required: ['query'],
    },
    execute: async (args, ctx) => ctx.ragPipeline.retrieve(args.query, args.topK),
  },
  {
    name: 'note_summarize',
    description: '总结指定笔记的核心内容',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: '笔记 ID' },
        maxLength: { type: 'number', description: '摘要最大长度', default: 200 },
      },
      required: ['noteId'],
    },
    execute: async (args, ctx) => {
      const node = ctx.graphEngine.getNode(args.noteId);
      if (!node) throw new Error(`Note not found: ${args.noteId}`);
      return { summary: generateSummary(node, args.maxLength) };
    },
  },
  {
    name: 'file_create',
    description: '创建新笔记文件',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题' },
        content: { type: 'string', description: '笔记内容（Markdown）' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      },
      required: ['title', 'content'],
    },
    execute: async (args, ctx) => {
      const path = await ctx.fileManager.createNote(args.title, args.content, args.tags);
      return { path, created: true };
    },
  },
  {
    name: 'webdav_sync',
    description: '触发 WebDAV 同步操作',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['upload', 'download', 'bidirectional'] },
      },
      required: ['direction'],
    },
    execute: async (args, ctx) => ctx.syncEngine.sync(args.direction),
  },
];
```

### 2.3 RAG 检索流水线 (RAGPipeline)

#### 2.3.1 流水线架构

```
用户查询
    │
    ▼
┌───────────────────────────────────┐
│ Stage 1: 意图解析                  │
│   - 查询类型分类（事实/推理/创作）   │
│   - 关键词提取                     │
│   - 查询改写（可选）                │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│ Stage 2: 混合检索（并行）           │
│   ┌─────────┐ ┌────────┐ ┌─────┐ │
│   │Vector   │ │BM25    │ │Graph│ │
│   │Top-K=20│ │Top-K=20│ │2-hop│ │
│   └────┬────┘ └───┬────┘ └──┬──┘ │
│        └──────────┴─────────┘    │
└──────────────┬────────────────────┘
               │ 合并去重
               ▼
┌───────────────────────────────────┐
│ Stage 3: 交叉重排序 (Cross-Encoder)│
│   - 精排 top-K 候选片段            │
│   - 输出 Top-N (N=5~8)            │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│ Stage 4: 上下文组装                │
│   - 拼接重排序结果                 │
│   - 图谱增强：追加 1-2 跳关联摘要   │
│   - 总长度 <= 4096 tokens          │
│   - 标注引用编号 [1][2]...         │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│ Stage 5: LLM 生成                 │
│   - System Prompt + 上下文 + 查询  │
│   - 流式输出                      │
│   - 引用标记嵌入输出               │
└───────────────────────────────────┘
```

#### 2.3.2 分块策略

```typescript
interface ChunkStrategy {
  split(content: string, metadata: ChunkMetadata): Chunk[];
}

class MarkdownChunkStrategy implements ChunkStrategy {
  private maxChunkSize = 512;   // tokens
  private overlapSize = 64;     // tokens
  private minChunkSize = 100;   // tokens

  split(content: string, metadata: ChunkMetadata): Chunk[] {
    const sections = this.parseMarkdownSections(content);
    const chunks: Chunk[] = [];

    for (const section of sections) {
      if (section.tokenCount <= this.maxChunkSize) {
        chunks.push({
          id: generateChunkId(metadata.noteId, section.heading),
          content: section.content,
          metadata: {
            ...metadata,
            heading: section.heading,
            level: section.level,
            position: section.position,
          },
        });
      } else {
        // 按段落切分，保持 overlap
        const subChunks = this.splitByParagraph(
          section, this.maxChunkSize, this.overlapSize
        );
        chunks.push(...subChunks);
      }
    }

    return chunks.filter(c => c.metadata.tokenCount >= this.minChunkSize);
  }

  private parseMarkdownSections(content: string): MarkdownSection[] {
    // 按标题层级切分：# ## ### 各为独立 section
    // 代码块（```）保持完整不切分
    // 表格保持完整不切分
  }
}

interface Chunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  noteId: string;
  noteTitle: string;
  tags: string[];
  heading?: string;
  level?: number;
  position: { startLine: number; endLine: number };
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
}
```

#### 2.3.3 嵌入模型集成

```typescript
class EmbeddingService {
  private worker: UtilityProcess | null = null;
  private model: string;

  async initialize(modelPath: string): Promise<void> {
    this.worker = utilityProcess.fork('./embedding-worker.js');
    this.model = modelPath;
    await this.sendCommand('load-model', { modelPath });
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const result = await this.sendCommand('embed', { texts });
    return result.embeddings;
  }

  async embedQuery(query: string): Promise<Float32Array> {
    const [embedding] = await this.embed([query]);
    return embedding;
  }
}

// 嵌入模型选择策略
const EMBEDDING_CONFIG = {
  default: {
    model: 'bge-m3-q8.onnx',       // 默认：BGE-m3 量化版
    dimensions: 1024,
    maxTokens: 8192,
    batchSize: 32,
  },
  lightweight: {
    model: 'bge-small-zh-q8.onnx',  // 轻量版
    dimensions: 512,
    maxTokens: 512,
    batchSize: 64,
  },
};
```

#### 2.3.4 向量索引管理

```typescript
class VectorIndex {
  private db: LanceDB;
  private table: LanceTable | null = null;

  async initialize(dbPath: string): Promise<void> {
    this.db = await lancedb.connect(dbPath);
    this.table = await this.db.openTable('chunks');
  }

  async upsertChunks(chunks: Chunk[], embeddings: Float32Array[]): Promise<void> {
    const records = chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: Array.from(embeddings[i]),
      content: chunk.content,
      metadata: chunk.metadata,
    }));

    // LanceDB 增量更新
    await this.table?.delete(`noteId = '${chunks[0].metadata.noteId}'`);
    await this.table?.add(records);
  }

  async search(queryVector: Float32Array, topK: number): Promise<SearchResult[]> {
    const results = await this.table?.search(queryVector)
      .limit(topK)
      .metricType('cosine')
      .execute();
    return results ?? [];
  }

  async deleteByNoteId(noteId: string): Promise<void> {
    await this.table?.delete(`noteId = '${noteId}'`);
  }
}
```

### 2.4 WebDAV 同步引擎 (SyncEngine)

#### 2.4.1 同步流程

```
用户触发同步
    │
    ▼
┌───────────────────────────────────┐
│ Phase 1: 远端扫描                  │
│   PROPFIND 获取文件列表 + etag     │
│   构建 RemoteFileIndex             │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│ Phase 2: 本地扫描                  │
│   读取本地文件 mtime + SHA-256     │
│   构建 LocalFileIndex              │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│ Phase 3: 变更对比                  │
│   三方对比 (local, remote, base)   │
│   分类：仅本地/仅远端/双方修改/无变更│
└──────────────┬────────────────────┘
               │
       ┌───────┴───────┐
       │               │
   无冲突            有冲突
       │               │
       ▼               ▼
┌──────────────┐ ┌──────────────────┐
│ Phase 4a:    │ │ Phase 4b:        │
│ 自动合并     │ │ 冲突决策 UI       │
│ 上传/下载    │ │ 用户选择策略       │
└──────────────┘ └──────────────────┘
       │               │
       └───────┬───────┘
               │
               ▼
┌───────────────────────────────────┐
│ Phase 5: 执行同步                  │
│   - 并行传输（线程池 4 并发）       │
│   - 进度广播                       │
│   - 完成后更新 syncToken           │
└───────────────────────────────────┘
```

#### 2.4.2 变更检测算法

```typescript
interface FileEntry {
  path: string;
  mtime: number;
  etag?: string;
  hash: string;           // SHA-256
  size: number;
}

interface SyncDecision {
  path: string;
  action: 'upload' | 'download' | 'conflict' | 'skip' | 'delete-local' | 'delete-remote';
  localEntry?: FileEntry;
  remoteEntry?: FileEntry;
  baseEntry?: FileEntry;  // 上次同步状态
}

function computeSyncPlan(
  localIndex: Map<string, FileEntry>,
  remoteIndex: Map<string, FileEntry>,
  baseIndex: Map<string, FileEntry>,  // 上次同步快照
): SyncDecision[] {
  const decisions: SyncDecision[] = [];
  const allPaths = new Set([
    ...localIndex.keys(),
    ...remoteIndex.keys(),
  ]);

  for (const path of allPaths) {
    const local = localIndex.get(path);
    const remote = remoteIndex.get(path);
    const base = baseIndex.get(path);

    if (!local && !remote) continue;

    // 新增文件（仅一侧存在）
    if (!local && remote) {
      decisions.push({ path, action: 'download', remoteEntry: remote });
      continue;
    }
    if (local && !remote) {
      decisions.push({ path, action: 'upload', localEntry: local });
      continue;
    }

    // 双方都存在
    if (local!.hash === remote!.hash) {
      decisions.push({ path, action: 'skip', localEntry: local, remoteEntry: remote });
      continue;
    }

    // 本地未修改（与 base 相同）→ 下载远端
    if (base && local!.hash === base.hash) {
      decisions.push({ path, action: 'download', localEntry: local, remoteEntry: remote });
      continue;
    }

    // 远端未修改（与 base 相同）→ 上传本地
    if (base && remote!.hash === base.hash) {
      decisions.push({ path, action: 'upload', localEntry: local, remoteEntry: remote });
      continue;
    }

    // 双方都修改 → 冲突
    decisions.push({ path, action: 'conflict', localEntry: local, remoteEntry: remote, baseEntry: base });
  }

  return decisions;
}
```

#### 2.4.3 冲突解决策略

```typescript
type ConflictStrategy =
  | 'local-wins'      // 保留本地版本，覆盖远端
  | 'remote-wins'     // 保留远端版本，覆盖本地
  | 'both-keep'       // 双保留（重命名远端文件为 .conflict 后缀）
  | 'skip';           // 跳过，不做处理

interface ConflictResolution {
  path: string;
  strategy: ConflictStrategy;
  applyToAll?: boolean;  // 是否应用于所有同类冲突
}

async function resolveConflict(
  decision: SyncDecision,
  resolution: ConflictResolution,
  syncClient: WebDAVClient,
  fileManager: FileManager,
): Promise<void> {
  // 同步前备份
  await fileManager.createBackup(decision.path, '.sync-backup/');

  switch (resolution.strategy) {
    case 'local-wins':
      await syncClient.upload(decision.path, await fileManager.read(decision.path));
      break;
    case 'remote-wins':
      const content = await syncClient.download(decision.path);
      await fileManager.write(decision.path, content);
      break;
    case 'both-keep':
      const remoteContent = await syncClient.download(decision.path);
      const conflictPath = decision.path.replace(/\.md$/, '.conflict.md');
      await fileManager.write(conflictPath, remoteContent);
      await syncClient.upload(decision.path, await fileManager.read(decision.path));
      break;
    case 'skip':
      // 不做任何操作
      break;
  }
}
```

#### 2.4.4 传输优化

```typescript
class SyncTransport {
  private concurrency = 4;
  private chunkSize = 5 * 1024 * 1024;  // 5MB 分片

  async uploadLargeFile(
    path: string,
    content: Buffer,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    if (content.length <= this.chunkSize) {
      await this.client.put(path, content);
      return;
    }

    // 分片上传
    const chunks = Math.ceil(content.length / this.chunkSize);
    for (let i = 0; i < chunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, content.length);
      const chunk = content.subarray(start, end);
      await this.client.put(`${path}.part${i}`, chunk);
      onProgress(Math.round((end / content.length) * 100));
    }

    // 合并分片（服务端需支持）或直接替换
    await this.client.put(path, content);
    // 清理分片
    for (let i = 0; i < chunks; i++) {
      await this.client.delete(`${path}.part${i}`).catch(() => {});
    }
  }

  async syncBatch(
    decisions: SyncDecision[],
    onProgress: (completed: number, total: number) => void,
  ): Promise<void> {
    const queue = new PQueue({ concurrency: this.concurrency });
    let completed = 0;

    await queue.addAll(
      decisions.map(decision => async () => {
        await this.executeDecision(decision);
        completed++;
        onProgress(completed, decisions.length);
      })
    );
  }
}
```

### 2.5 文件监听与索引管理

#### 2.5.1 文件监听服务

```typescript
class FileWatcher {
  private watcher: FSWatcher;
  private debounceMs = 500;
  private batchWindow = 2000;
  private eventBus: EventBus;

  start(vaultPath: string): void {
    this.watcher = chokidar.watch(
      ['**/*.md', '**/*.markdown'],
      {
        cwd: vaultPath,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: this.debounceMs,
          pollInterval: 100,
        },
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.sync-backup/**',
          '**/.graphmind/**',
        ],
      }
    );

    // 批量处理变更事件
    const batchedChanges = this.watcher.pipe(
      batchWithTime(this.batchWindow),
      deduplicateByPath(),
    );

    batchedChanges.on('data', (events: FileEvent[]) => {
      this.eventBus.emit('file:batch-change', events);
    });
  }
}
```

#### 2.5.2 增量索引器

```typescript
class IncrementalIndexer {
  private vectorIndex: VectorIndex;
  private embeddingService: EmbeddingService;
  private graphEngine: GraphEngine;
  private chunkStrategy: MarkdownChunkStrategy;

  async onFileChange(event: FileEvent): Promise<void> {
    switch (event.type) {
      case 'add':
      case 'change': {
        const content = await readFile(event.path);
        const hash = computeHash(content);

        // 跳过未变更文件
        if (await this.isUnchanged(event.path, hash)) return;

        // 1. 解析并更新图谱
        const parseResult = this.graphEngine.parseAndIndex(event.path, content);

        // 2. 分块 + 嵌入 + 向量索引更新
        const chunks = this.chunkStrategy.split(content, {
          noteId: parseResult.noteId,
          noteTitle: parseResult.title,
          tags: parseResult.tags,
          createdAt: parseResult.createdAt,
          updatedAt: Date.now(),
        });

        const embeddings = await this.embeddingService.embed(
          chunks.map(c => c.content)
        );
        await this.vectorIndex.upsertChunks(chunks, embeddings);

        // 3. 更新元数据
        await this.updateMetadata(event.path, hash);
        break;
      }
      case 'unlink': {
        // 删除图谱节点和向量索引
        const noteId = pathToNoteId(event.path);
        await this.graphEngine.removeNode(noteId);
        await this.vectorIndex.deleteByNoteId(noteId);
        break;
      }
    }
  }
}
```

---

## 3. 数据存储设计

### 3.1 目录结构

```
~/.graphmind/
├── config.json                 # 全局配置
├── vaults/                     # 知识库目录（每个 Vault 一个）
│   └── default/
│       ├── notes/              # Markdown 笔记文件
│       │   ├── index.md
│       │   └── project-plan.md
│       ├── .graphmind/         # 应用元数据（不纳入 WebDAV 同步）
│       │   ├── graph.json      # 图谱邻接表数据
│       │   ├── metadata.db     # SQLite 元数据
│       │   ├── vectors/        # LanceDB 向量索引
│       │   ├── embeddings/     # 嵌入模型缓存
│       │   ├── sync/           # 同步状态
│       │   │   ├── base-snapshot.json  # 上次同步快照
│       │   │   └── sync-tokens.json
│       │   └── backups/        # 冲突备份
│       └── assets/             # 附件（图片等）
├── models/                     # LLM 模型文件
│   ├── qwen2.5-7b-q4_k_m.gguf
│   └── bge-m3-q8.onnx
└── plugins/                    # 插件目录（V2+）
```

### 3.2 SQLite Schema

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  frontmatter_json TEXT,
  tags_json TEXT,
  indexed_at INTEGER,
  INDEX idx_notes_updated (updated_at DESC),
  INDEX idx_notes_title (title)
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  heading TEXT,
  level INTEGER,
  start_line INTEGER,
  end_line INTEGER,
  token_count INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  INDEX idx_chunks_note (note_id)
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  INDEX idx_edges_source (source_id),
  INDEX idx_edges_target (target_id),
  INDEX idx_edges_type (type)
);

CREATE TABLE sync_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  action TEXT NOT NULL,
  local_hash TEXT,
  remote_hash TEXT,
  resolved_by TEXT,
  timestamp INTEGER NOT NULL,
  INDEX idx_sync_path (file_path),
  INDEX idx_sync_time (timestamp DESC)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL,
  tool_calls_json TEXT,
  citations_json TEXT,
  model TEXT,
  token_usage_json TEXT,
  created_at INTEGER NOT NULL,
  INDEX idx_messages_conv (conversation_id, created_at)
);
```

### 3.3 图谱数据持久化格式

```json
{
  "version": 1,
  "updatedAt": 1715136000000,
  "nodes": {
    "project-plan": {
      "id": "project-plan",
      "title": "项目规划",
      "filePath": "/notes/project-plan.md",
      "tags": ["规划", "技术选型"],
      "frontmatter": { "priority": "high", "date": "2024-05-01" },
      "createdAt": 1714521600000,
      "updatedAt": 1715136000000,
      "contentHash": "sha256:abc123..."
    }
  },
  "edges": {
    "project-plan--tech-stack--link_ref": {
      "id": "project-plan--tech-stack--link_ref",
      "source": "project-plan",
      "target": "tech-stack",
      "type": "link_ref",
      "weight": 1.0,
      "metadata": {
        "context": "技术选型详见 [[tech-stack]]",
        "position": { "line": 12, "col": 8 }
      }
    }
  }
}
```

---

## 4. 前端架构设计

### 4.1 技术栈选型

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **框架** | React | 18.x | 生态成熟，Concurrent Mode 支持流式渲染 |
| **语言** | TypeScript | 5.x | 类型安全，IDE 支持完善 |
| **构建** | Vite | 5.x | HMR 速度极快，原生 ESM |
| **样式** | TailwindCSS | 3.x | Utility-first，Design Token 集成 |
| **组件** | Radix UI | latest | 无样式无障碍基座，灵活定制 |
| **动效** | Framer Motion | 11.x | 声明式动画，手势支持 |
| **状态** | Zustand | 4.x | 轻量，支持持久化中间件 |
| **编辑器** | CodeMirror 6 | 6.x | 性能优异，插件化架构 |
| **图谱** | Cytoscape.js | 3.x | 图算法内置，渲染性能好 |
| **异步** | RxJS | 7.x | 文件事件流、同步状态流 |

### 4.2 组件架构

```
src/
├── main/                          # Electron Main Process
│   ├── index.ts                   # 入口
│   ├── ipc/                       # IPC Handler 注册
│   │   ├── file-handlers.ts
│   │   ├── graph-handlers.ts
│   │   ├── agent-handlers.ts
│   │   └── sync-handlers.ts
│   ├── services/                  # 核心服务
│   │   ├── file-watcher.ts
│   │   ├── graph-engine.ts
│   │   ├── agent-core.ts
│   │   ├── sync-engine.ts
│   │   ├── indexer.ts
│   │   └── config-manager.ts
│   └── workers/                   # Utility Process 脚本
│       ├── llm-worker.ts
│       └── embedding-worker.ts
│
├── renderer/                      # Electron Renderer Process
│   ├── index.html
│   ├── main.tsx                   # React 入口
│   ├── App.tsx                    # 根组件
│   │
│   ├── layout/                    # 布局组件
│   │   ├── AppShell.tsx           # 三栏主布局
│   │   ├── Sidebar.tsx            # 左侧边栏
│   │   ├── TopBar.tsx             # 顶部栏
│   │   └── PanelManager.tsx       # 面板管理器
│   │
│   ├── editor/                    # 编辑器模块
│   │   ├── MarkdownEditor.tsx     # CodeMirror 包装
│   │   ├── LinkAutocomplete.tsx   # [[ 链接补全
│   │   ├── LinkPlugin.ts          # 双向链接 CM6 插件
│   │   └── BacklinkPanel.tsx      # 反向引用面板
│   │
│   ├── graph/                     # 图谱模块
│   │   ├── GraphCanvas.tsx        # Cytoscape 包装
│   │   ├── NodeCard.tsx           # 节点详情卡
│   │   ├── EdgeTooltip.tsx        # 边信息浮层
│   │   └── GraphControls.tsx      # 缩放/布局控制
│   │
│   ├── agent/                     # Agent 模块
│   │   ├── ChatPanel.tsx          # 对话面板
│   │   ├── ChatInput.tsx          # 输入框
│   │   ├── MessageBubble.tsx      # 消息气泡
│   │   ├── CitationTooltip.tsx     # 引用浮层
│   │   ├── ToolLogDrawer.tsx       # 工具日志抽屉
│   │   └── ConfidenceBar.tsx       # 置信度指示
│   │
│   ├── sync/                      # 同步模块
│   │   ├── SyncPanel.tsx          # 同步状态面板
│   │   ├── ConflictResolver.tsx   # 冲突解决弹窗
│   │   ├── DiffViewer.tsx         # Diff 对比视图
│   │   └── ProgressRing.tsx       # 环形进度
│   │
│   ├── shared/                    # 共享组件
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   ├── Tooltip.tsx
│   │   ├── VirtualList.tsx
│   │   ├── CommandPalette.tsx      # Ctrl+K 搜索
│   │   └── ThemeProvider.tsx
│   │
│   ├── hooks/                     # 自定义 Hooks
│   │   ├── useLLM.ts             # 模型状态与推理
│   │   ├── useSync.ts            # 同步状态
│   │   ├── useGraphQuery.ts      # 图谱查询
│   │   ├── useTheme.ts           # 主题切换
│   │   └── useIPC.ts             # IPC 通信封装
│   │
│   └── stores/                    # Zustand 状态
│       ├── app-store.ts          # 全局应用状态
│       ├── editor-store.ts       # 编辑器状态
│       ├── graph-store.ts        # 图谱视图状态
│       ├── agent-store.ts        # Agent 对话状态
│       └── sync-store.ts         # 同步状态
│
├── shared/                        # 共享类型与工具
│   ├── types/                     # TypeScript 类型定义
│   │   ├── graph.ts
│   │   ├── agent.ts
│   │   ├── sync.ts
│   │   └── ipc.ts
│   ├── constants/                 # 常量定义
│   └── utils/                     # 工具函数
│
└── tests/                         # 测试
    ├── unit/
    ├── integration/
    └── e2e/
```

### 4.3 状态管理设计

```typescript
// Agent Store 示例
interface AgentState {
  conversations: Map<string, Conversation>;
  activeConversationId: string | null;
  isStreaming: boolean;
  currentModel: ModelInfo;
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';

  // Actions
  sendMessage: (content: string) => Promise<void>;
  switchModel: (modelId: string) => Promise<void>;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  abortGeneration: () => void;
}

const useAgentStore = create<AgentState>()(
  persist(
    immer((set, get) => ({
      conversations: new Map(),
      activeConversationId: null,
      isStreaming: false,
      currentModel: DEFAULT_MODEL,
      modelStatus: 'idle',

      sendMessage: async (content: string) => {
        const state = get();
        const conversationId = state.activeConversationId!;
        const userMessage = createMessage('user', content);

        set(draft => {
          draft.conversations.get(conversationId)!.messages.push(userMessage);
          draft.isStreaming = true;
        });

        try {
          // RAG 检索
          const context = await ipcRenderer.invoke('agent:rag-retrieve', {
            query: content,
            conversationId,
          });

          // 流式生成
          const stream = ipcRenderer.invoke('agent:chat-stream', {
            message: content,
            context,
            model: state.currentModel.id,
          });

          let assistantContent = '';
          for await (const chunk of stream) {
            assistantContent += chunk.content;
            set(draft => {
              const conv = draft.conversations.get(conversationId)!;
              const lastMsg = conv.messages[conv.messages.length - 1];
              if (lastMsg?.role === 'assistant') {
                lastMsg.content = assistantContent;
              } else {
                conv.messages.push(createMessage('assistant', assistantContent));
              }
            });
          }
        } finally {
          set(draft => { draft.isStreaming = false; });
        }
      },

      switchModel: async (modelId: string) => {
        set(draft => { draft.modelStatus = 'loading'; });
        try {
          await ipcRenderer.invoke('agent:switch-model', { modelId });
          set(draft => {
            draft.currentModel = { id: modelId, ... };
            draft.modelStatus = 'ready';
          });
        } catch {
          set(draft => { draft.modelStatus = 'error'; });
        }
      },
    })),
    {
      name: 'graphmind-agent',
      partialize: (state) => ({
        conversations: serializeConversations(state.conversations),
        activeConversationId: state.activeConversationId,
        currentModel: state.currentModel,
      }),
    }
  )
);
```

### 4.4 Design Token 系统

```typescript
// tailwind.config.ts
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        success: {
          DEFAULT: '#10B981',
          bg: '#ECFDF5',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: '#FFFBEB',
        },
        error: {
          DEFAULT: '#EF4444',
          bg: '#FEF2F2',
        },
        surface: {
          base: '#0F172A',
          raised: '#1E293B',
          overlay: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Noto Sans SC', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      animation: {
        'ai-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'typing-cursor': 'blink 1s step-end infinite',
        'slide-up': 'slideUp 200ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
};
```

---

## 5. 性能优化设计

### 5.1 模型推理优化

| 优化项 | 方案 | 预期效果 |
|--------|------|----------|
| **量化策略** | 默认 Q4_K_M，提供 Q5_K_M 选项 | 7B 模型内存 ~4GB，推理 ~8 tok/s |
| **AVX 优化** | 编译 llama.cpp 启用 AVX2/AVX512 | 推理速度提升 30-50% |
| **线程配置** | n_threads=12（匹配 i5-12600KF 核心） | 充分利用 CPU |
| **mmap 加载** | 模型文件使用 mmap 映射 | 加载时间 < 10s |
| **自动卸载** | 空闲 5min 后卸载模型释放内存 | 空闲内存 < 500MB |
| **Worker 隔离** | 推理运行在 Utility Process | 不阻塞 UI |

### 5.2 图谱渲染优化

| 优化项 | 方案 | 预期效果 |
|--------|------|----------|
| **虚拟渲染** | >500 节点启用 WebGL 渲染 | 1000 节点 > 15fps |
| **按需加载** | 仅渲染视口内 + 1 跳邻居 | 内存可控 |
| **降频布局** | 力导向计算降频至 15fps | CPU 占用降低 |
| **静态布局** | 超大图谱切换预计算静态布局 | 流畅查看 |
| **LOD** | 远距离节点简化为点 | 渲染压力降低 |

### 5.3 内存管理策略

```
┌──────────────────────────────────────────┐
│              内存预算 (32GB)               │
├──────────────────────────────────────────┤
│  OS + Electron 基础      ~500MB          │
│  React UI                ~200MB          │
│  图谱数据 (< 10K 节点)   ~100MB          │
│  向量索引 (LanceDB)       ~300MB-1.5GB   │
│  LLM 模型 (7B Q4)        ~4GB           │
│  嵌入模型                 ~500MB         │
│  SQLite                   ~50MB          │
│  缓冲池                   ~500MB         │
├──────────────────────────────────────────┤
│  合计（推理中）            ~6-7GB         │
│  合计（空闲）             ~1-1.5GB        │
└──────────────────────────────────────────┘
```

### 5.4 索引性能优化

| 优化项 | 方案 |
|--------|------|
| **分区索引** | LanceDB 按笔记集合分区，减少扫描范围 |
| **增量更新** | 仅对变更段落重新计算 embedding |
| **批处理** | 嵌入计算 batch_size=32，减少模型调用次数 |
| **懒加载** | 向量索引按需加载分区，空闲分区卸载 |
| **缓存** | 热门查询结果缓存 5min |

---

## 6. 安全设计

### 6.1 进程沙箱

```
┌─────────────────────────────────┐
│ Renderer Process (sandbox=true) │
│ - 无 Node.js 访问               │
│ - 仅通过 contextBridge 通信      │
│ - CSP 限制外部资源加载            │
├─────────────────────────────────┤
│ Main Process                     │
│ - 文件系统访问受限于 Vault 目录   │
│ - IPC 通道白名单校验              │
├─────────────────────────────────┤
│ Utility Process                  │
│ - 模型推理隔离                    │
│ - 无网络访问权限                  │
│ - 无文件系统写权限                │
└─────────────────────────────────┘
```

### 6.2 数据安全

| 安全项 | 实现方案 |
|--------|----------|
| **本地存储** | Vault 数据存储于用户目录，应用无远程上传行为 |
| **WebDAV 凭据** | 使用 keytar 存储至系统 Keychain |
| **加密密钥** | AES-256-GCM 密钥由系统 Keychain 管理，不明文落盘 |
| **IPC 安全** | contextBridge 白名单模式，禁止暴露 Node API |
| **CSP** | 限制 script-src 为 self，禁止 eval/inline |
| **插件沙箱** | V2 阶段使用 VM2 或 worker_threads 隔离 |

---

## 7. 测试策略

### 7.1 测试分层

| 层级 | 工具 | 覆盖范围 | 运行频率 |
|------|------|----------|----------|
| **单元测试** | Vitest | 纯函数、工具类、数据模型 | 每次提交 |
| **集成测试** | Vitest + Electron | IPC 通信、服务编排 | 每次合并 |
| **E2E 测试** | Playwright + Electron | 用户核心流程 | 每日构建 |
| **性能测试** | 自定义 benchmark | 推理延迟、渲染帧率、内存 | 每周 |

### 7.2 关键测试场景

```typescript
// 图谱构建集成测试
describe('GraphEngine', () => {
  it('should build graph from wiki-links', async () => {
    await vault.create('note-a.md', 'Link to [[note-b]]');
    await vault.create('note-b.md', 'Link to [[note-a]]');
    await graphEngine.waitForIndex();

    const neighbors = graphEngine.getNeighbors('note-a', 1);
    expect(neighbors).toContainEqual(expect.objectContaining({ id: 'note-b' }));

    const backlinks = graphEngine.getBacklinks('note-a');
    expect(backlinks).toHaveLength(1);
  });

  it('should incrementally update on file change', async () => {
    await vault.create('note-c.md', 'Content');
    await graphEngine.waitForIndex();
    const node = graphEngine.getNode('note-c');
    expect(node).toBeDefined();

    await vault.update('note-c.md', 'Updated with [[note-d]]');
    await graphEngine.waitForIndex();

    const edges = graphEngine.getEdgesBetween('note-c', 'note-d');
    expect(edges).toHaveLength(1);
  });
});

// WebDAV 同步测试
describe('SyncEngine', () => {
  it('should detect and resolve conflicts', async () => {
    const local = createFileEntry('test.md', hashA, mtime1);
    const remote = createFileEntry('test.md', hashB, mtime2);
    const base = createFileEntry('test.md', hashA, mtime0);

    const plan = computeSyncPlan(
      new Map([['test.md', local]]),
      new Map([['test.md', remote]]),
      new Map([['test.md', base]]),
    );

    expect(plan[0].action).toBe('conflict');
  });
});
```

---

## 8. 部署与构建

### 8.1 构建配置

```typescript
// electron-builder.yml
appId: com.graphmind.desktop
productName: GraphMind
directories:
  output: dist
  buildResources: resources
files:
  - dist/main/**/*
  - dist/renderer/**/*
  - dist/shared/**/*
  - node_modules/**/*
extraResources:
  - from: resources/bin
    to: bin
    filter:
      - llama-server*
mac:
  target:
    - dmg
    - zip
  category: public.app-category.productivity
  hardenedRuntime: true
win:
  target:
    - nsis
    - portable
  artifactName: ${name}-${version}-setup.${ext}
linux:
  target:
    - flatpak
    - AppImage
    - deb
  category: Office
```

### 8.2 CI/CD 流水线

```
Push / PR
    │
    ▼
┌──────────────┐
│ Lint + Type  │
│ Check        │
│ ESLint + tsc │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Unit Tests   │
│ Vitest       │
│ Coverage >80%│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Build        │
│ Vite + tsc   │
│ electron-    │
│ builder      │
└──────┬───────┘
       │
       ▼ (仅 main 分支)
┌──────────────┐
│ E2E Tests    │
│ Playwright   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Release      │
│ GitHub       │
│ Release      │
└──────────────┘
```

---

## 9. 技术选型总览

| 领域 | 技术 | 版本 | 许可证 | 选型理由 |
|------|------|------|--------|----------|
| 桌面框架 | Electron | 28+ | MIT | 跨平台，Node.js 生态 |
| 前端框架 | React | 18+ | MIT | 生态成熟，Concurrent Mode |
| 类型系统 | TypeScript | 5+ | Apache-2.0 | 类型安全 |
| 构建工具 | Vite | 5+ | MIT | HMR 极速 |
| CSS 方案 | TailwindCSS | 3+ | MIT | Utility-first |
| UI 基座 | Radix UI | latest | MIT | 无障碍优先 |
| 动效 | Framer Motion | 11+ | MIT | 声明式动画 |
| 状态管理 | Zustand | 4+ | MIT | 轻量，中间件丰富 |
| 编辑器 | CodeMirror 6 | 6+ | MIT | 性能优异 |
| 图谱渲染 | Cytoscape.js | 3+ | MIT | 算法内置 |
| 异步流 | RxJS | 7+ | Apache-2.0 | 事件流处理 |
| 向量数据库 | LanceDB | latest | Apache-2.0 | 嵌入式，零配置 |
| 本地推理 | llama.cpp (node-llama-cpp) | latest | MIT | GGUF 支持，CPU 优化 |
| 嵌入模型 | ONNX Runtime | latest | MIT | 跨平台推理 |
| WebDAV 客户端 | webdav | 4+ | MIT | 标准协议实现 |
| 文件监听 | chokidar | 3+ | MIT | 跨平台稳定 |
| 数据库 | better-sqlite3 | 11+ | MIT | 嵌入式，同步 API |
| 密钥管理 | keytar | latest | MIT | 系统 Keychain 绑定 |
| 打包 | electron-builder | 24+ | MIT | 多平台构建 |
