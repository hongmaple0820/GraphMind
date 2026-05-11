# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [代码结构|代码模式|代码生成|构建方法|测试方法|依赖关系|环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

[GraphMind 技术设计项目初始化]
- Date: 2026-05-08
- Context: 用户要求为 GraphMind 完整项目设计方案编写技术方案
- Category: 代码结构
- Instructions:
  - 项目名称: GraphMind - 本地优先 AI 知识库
  - 技术栈: Electron + React 18 + TypeScript + TailwindCSS
  - 核心特性: 图谱驱动/Agent 智能/WebDAV 同步/本地优先
  - 架构分层: 表现层(Renderer) / 业务层(Main Process) / AI与数据层

[GraphMind 项目构建与开发知识]
- Date: 2026-05-08
- Context: Agent 在执行 Phase 0 脚手架搭建时发现
- Category: 构建方法
- Instructions:
  - Monorepo 结构: apps/desktop + packages/shared，npm workspaces 管理
  - 构建命令: 根目录 npm run dev/build/lint/typecheck/test
  - Vite 配置: root 指向 src/renderer，build 输出到 dist/renderer
  - 测试框架: Vitest，覆盖 src 目录下所有 .test.ts/.spec.ts 文件
  - CodeMirror 6 导入注意: HighlightStyle 从 @codemirror/language 导入，tags 从 @lezer/highlight 导入
  - Zustand persist 在 Node 测试环境无 localStorage 会产生警告但不影响功能

[GraphMind 代码结构知识]
- Date: 2026-05-08
- Context: Agent 在执行 Phase 0 脚手架搭建时发现
- Category: 代码结构
- Instructions:
  - apps/desktop/src/main/ - Electron Main Process（IPC handlers + services + workers）
  - apps/desktop/src/renderer/ - React UI（layout/editor/graph/agent/sync/shared/hooks/stores）
  - apps/desktop/src/main/preload.ts - contextBridge 暴露 graphmind API
  - packages/shared/src/types/ - 共享类型定义（graph/agent/sync/ipc）
  - IPC 通道命名规范: {domain}:{action}，如 file:read, graph:query

[GraphMind Phase 2-3 开发知识]
- Date: 2026-05-10
- Context: Agent 在执行 Phase 2-3 开发时发现
- Category: 代码结构|构建方法|依赖关系
- Instructions:
  - Tailwind CSS 变量化后 @apply 不支持带 / 透明度语法的类名，需用 CSS 原生写法替代
  - 暗色/亮色主题通过 data-theme 属性切换，Tailwind darkMode 配置为 ['class', '[data-theme="dark"]']
  - Vite manualChunks 分包: vendor-react / vendor-codemirror / vendor-codemirror-langs / vendor-cytoscape / vendor-zustand
  - BM25 中文分词使用 bigram (相邻2字组合) 策略，非真正 NLP 分词
  - vectra 替代 LanceDB: LanceDB 原生绑定安装失败，vectra 是纯 JS 本地向量索引替代
  - electron-store 用于持久化同步配置 (WebDAV credentials)
  - incrementalIndexer 位于 services/indexer/，路径需 6 层 ../../../../../../ 到 packages/shared
  - IPC handlers 模式: 每个 domain 独立文件，register 函数接收 (ipcMain, mainWindow)
  - 当前已注册 7 个 IPC domain: file/graph/agent/sync/rag/plugin/config
  - 19 个单元测试全部通过，Vite 构建成功
