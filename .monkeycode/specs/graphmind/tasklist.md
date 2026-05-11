# GraphMind 实施任务清单

> 版本: v1.0 | 日期: 2026-05-08 | 对应需求: requirements.md v1.0

---

## Phase 0: 项目脚手架 (1 周)

### 0.1 仓库初始化
- [ ] 创建 monorepo 结构（apps/desktop, packages/shared）
- [ ] 初始化 Git 仓库 + .gitignore + .editorconfig
- [ ] 配置 ESLint + Prettier + TypeScript 严格模式
- [ ] 配置 Vitest 单元测试框架
- [ ] 配置 GitHub Actions CI（lint + type-check + test）

### 0.2 Electron + React 基础框架
- [ ] 初始化 Electron 28+ + Vite 5 + React 18 项目
- [ ] 配置 Main Process / Renderer Process / Utility Process 分离
- [ ] 配置 contextBridge IPC 通信层
- [ ] 配置 CSP 安全策略
- [ ] 集成 TailwindCSS + Radix UI + Framer Motion
- [ ] 实现 AppShell 三栏布局（Sidebar + MainContent + AgentPanel）
- [ ] 实现 Zustand 状态管理基础结构

### 0.3 Markdown 编辑器基础
- [ ] 集成 CodeMirror 6 编辑器
- [ ] 实现 .md 文件打开/编辑/保存
- [ ] 实现基础语法高亮
- [ ] 实现实时预览模式

**Phase 0 验收标准**: 可打开、编辑、保存 .md 文件，三栏布局可用

---

## Phase 1: 图谱 + RAG + 本地模型 (3 周)

### 1.1 双向链接系统 (3 天)
- [ ] 实现 `[[wiki-link]]` 语法解析器（CodeMirror 6 插件）
- [ ] 实现链接自动补全（输入 `[[` 触发）
- [ ] 实现链接点击跳转
- [ ] 实现反向引用面板（BacklinkPanel）
- [ ] 实现 YAML Frontmatter 解析

**关联需求**: FR-ED-002, FR-ED-003

### 1.2 图谱构建引擎 (5 天)
- [ ] 设计并实现 GraphNode / GraphEdge 数据模型
- [ ] 实现链接引用（link_ref）关系提取
- [ ] 实现共现标签（tag_cooccurrence）关系提取
- [ ] 实现时间顺序（temporal_seq）关系提取
- [ ] 实现图谱增量更新逻辑
- [ ] 实现 GraphData 持久化（graph.json）
- [ ] 实现 SQLite 元数据表创建与同步
- [ ] 实现文件监听服务（chokidar + 防抖批处理）

**关联需求**: FR-GR-001

### 1.3 图谱可视化 (5 天)
- [ ] 集成 Cytoscape.js 渲染器
- [ ] 实现力导向布局
- [ ] 实现节点点击 → 详情卡 + 2 跳邻居高亮
- [ ] 实现缩放/拖拽/平移交互
- [ ] 实现图谱与编辑器联动（点击节点跳转笔记）
- [ ] 实现虚拟渲染（>500 节点降级策略）
- [ ] 实现 GraphControls 控制面板

**关联需求**: FR-GR-002

### 1.4 RAG 检索流水线 (5 天)
- [ ] 实现 MarkdownChunkStrategy 分块器
- [ ] 集成 ONNX Runtime + BGE-m3 嵌入模型
- [ ] 实现 EmbeddingService（Utility Process）
- [ ] 集成 LanceDB 向量索引
- [ ] 实现 BM25 关键词检索
- [ ] 实现混合检索（Vector + BM25 + Graph）
- [ ] 实现增量索引器（IncrementalIndexer）
- [ ] 实现上下文组装逻辑（<= 4K tokens）

**关联需求**: FR-AI-002

### 1.5 本地 LLM 推理 (4 天)
- [ ] 集成 node-llama-cpp（Utility Process）
- [ ] 实现 LLM Worker（加载/推理/卸载/流式输出）
- [ ] 实现 LLMProvider 接口（local 类型）
- [ ] 实现 Agent 对话面板 UI（ChatPanel + ChatInput + MessageBubble）
- [ ] 实现流式输出渲染 + 引用标记
- [ ] 实现 CitationTooltip 引用浮层
- [ ] 实现端到端 RAG 问答流程

**关联需求**: FR-AI-001

### 1.6 WebDAV 单向备份 (3 天)
- [ ] 集成 webdav 客户端库
- [ ] 实现 WebDAV 连接配置界面
- [ ] 实现单向上传（本地 → 远端）
- [ ] 实现变更检测（mtime + etag + SHA-256）
- [ ] 实现上传进度反馈
- [ ] 连通 Nextcloud / 坚果云测试

**关联需求**: FR-SY-001

**Phase 1 验收标准**: 拖入 50 篇笔记自动生成图谱；本地模型可问答并返回引用；WebDAV 备份可用

---

## Phase 2: 同步 + Agent 工具 + 多模型 (3 周)

### 2.1 WebDAV 双向同步 (5 天)
- [ ] 实现 RemoteFileIndex 构建（PROPFIND）
- [ ] 实现 LocalFileIndex 构建
- [ ] 实现 computeSyncPlan 变更对比算法
- [ ] 实现冲突检测逻辑
- [ ] 实现 ConflictResolver UI（Diff 对比 + 4 策略按钮）
- [ ] 实现 DiffViewer 组件
- [ ] 实现同步执行器（并行传输 + 进度广播）
- [ ] 实现同步前备份（.sync-backup/）
- [ ] 实现 syncToken 持久化

**关联需求**: FR-SY-002

### 2.2 Agent 工具调用 (5 天)
- [ ] 实现 ToolRegistry 工具注册器
- [ ] 实现 graph_search 内置工具
- [ ] 实现 rag_retrieve 内置工具
- [ ] 实现 note_summarize 内置工具
- [ ] 实现 file_create 内置工具
- [ ] 实现 webdav_sync 内置工具
- [ ] 实现 ToolLogDrawer 工具日志 UI
- [ ] 实现 Agent ReAct 推理循环
- [ ] 实现工具调用超时与重试机制

**关联需求**: FR-AI-003

### 2.3 多模型路由 (4 天)
- [ ] 实现 LLMRouter（本地优先策略）
- [ ] 实现 OpenAI Provider
- [ ] 实现 Claude Provider
- [ ] 实现 Custom Provider（OpenAI 兼容接口）
- [ ] 实现模型切换 UI（TopBar/ModelSwitcher）
- [ ] 实现超时降级逻辑（30s）
- [ ] 实现模型热重载
- [ ] 实现 ConfidenceBar 置信度指示

**关联需求**: FR-AI-004

### 2.4 增量索引优化 (3 天)
- [ ] 实现基于 contentHash 的变更检测
- [ ] 实现段落级增量分块
- [ ] 实现 LanceDB 按笔记集合分区
- [ ] 实现嵌入计算批处理优化
- [ ] 实现索引状态可视化

**关联需求**: NFR-PF-003

**Phase 2 验收标准**: 双向同步可用；冲突解决 UI 可用；Agent 可调用 5 个内置工具；本地/云端模型可切换

---

## Phase 3: 优化 + 插件基础 (2 周)

### 3.1 性能调优 (4 天)
- [ ] llama.cpp 编译 AVX2/AVX512 优化
- [ ] 模型 mmap + numa 配置调优
- [ ] 模型空闲自动卸载（5min）
- [ ] 图谱虚拟渲染优化
- [ ] 内存 Profiling + 泄漏修复
- [ ] 流式输出防重排优化

**关联需求**: NFR-PF-001~006

### 3.2 主题系统 (3 天)
- [ ] 实现暗色/亮色主题切换
- [ ] 实现 Design Token 系统（CSS 变量）
- [ ] 实现系统主题跟随
- [ ] 完善组件主题适配

**关联需求**: NFR-US-002

### 3.3 插件系统基础 (4 天)
- [ ] 设计插件 API 接口（工具/视图/主题扩展点）
- [ ] 实现插件加载器（沙箱隔离）
- [ ] 实现插件注册机制
- [ ] 实现插件市场 UI 基础框架
- [ ] 编写插件开发文档

**关联需求**: FR-EX-001

### 3.4 全局搜索与快捷键 (2 天)
- [ ] 实现 CommandPalette（Ctrl+K）
- [ ] 核心操作快捷键绑定
- [ ] 快捷键自定义界面

**关联需求**: NFR-US-003

**Phase 3 验收标准**: CPU 推理占用 < 80%；暗/亮主题完整；插件可加载；全局搜索可用

---

## Phase 4: 打包发布 + 持续优化 (持续)

### 4.1 应用打包 (3 天)
- [ ] 配置 electron-builder 多平台构建
- [ ] macOS DMG 签名与公证
- [ ] Windows NSIS 安装包
- [ ] Linux Flatpak / AppImage / deb
- [ ] 自动更新机制（electron-updater）

### 4.2 端到端测试 (3 天)
- [ ] Playwright E2E 测试覆盖核心流程
- [ ] 跨平台兼容性测试
- [ ] 72h 稳定性测试
- [ ] 性能基准测试

### 4.3 文档与发布 (2 天)
- [ ] 编写用户文档（README + 使用指南）
- [ ] 编写 CONTRIBUTING.md
- [ ] 编写架构决策记录 (ADR)
- [ ] 创建 GitHub Release
- [ ] 初始化项目 Wiki

---

## 任务依赖关系

```
Phase 0 ──→ Phase 1.1 (双向链接) ──→ Phase 1.2 (图谱引擎) ──→ Phase 1.3 (图谱可视化)
         └─→ Phase 1.4 (RAG 流水线) ──→ Phase 1.5 (本地 LLM)
         └─→ Phase 1.6 (WebDAV 备份)

Phase 1 ──→ Phase 2.1 (双向同步)
         └─→ Phase 2.2 (Agent 工具) ──→ Phase 2.3 (多模型路由)
         └─→ Phase 2.4 (增量索引优化)

Phase 2 ──→ Phase 3.1 (性能调优)
         └─→ Phase 3.2 (主题系统)
         └─→ Phase 3.3 (插件系统)
         └─→ Phase 3.4 (全局搜索)

Phase 3 ──→ Phase 4 (打包发布)
```

## 里程碑

| 里程碑 | 日期 | 交付物 |
|--------|------|--------|
| **M0: 脚手架完成** | 第 1 周末 | 可运行的 Electron + React 空壳 |
| **M1: MVP Alpha** | 第 4 周末 | 编辑器 + 图谱 + 基础 RAG + WebDAV 备份 |
| **M2: MVP Beta** | 第 7 周末 | 双向同步 + Agent 工具 + 多模型路由 |
| **M3: V1 RC** | 第 9 周末 | 性能优化 + 主题 + 插件基础 |
| **M4: V1 Release** | 第 11 周末 | 多平台安装包 + 文档 + 自动更新 |
