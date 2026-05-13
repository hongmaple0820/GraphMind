export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  duration: number;
  success: boolean;
  error?: string;
}

export interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}

export interface ToolContext {
  graphEngine: { query: (args: unknown) => Promise<unknown>; getBacklinks: (nodeId: string) => Promise<unknown> };
  fileManager: { read: (path: string) => Promise<string>; write: (path: string, content: string) => Promise<void>; create: (vaultPath: string, title: string, content?: string) => Promise<unknown> };
  notesIndex: Map<string, { id: string; title: string; filePath: string; tags: string[] }>;
  parseCache: Map<string, { wikiLinks: Array<{ target: string; alias?: string }>; tags: Array<{ name: string }>; title: string }>;
  vaultPath: string;
  syncManager?: { startSync: (direction: string) => Promise<unknown>; getStatus: () => Promise<unknown> };
}

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(tool: ToolHandler): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  async execute(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const handler = this.tools.get(name);
    if (!handler) return { toolName: name, args, result: null, duration: 0, success: false, error: `Unknown tool: ${name}` };

    const start = Date.now();
    try {
      const result = await handler.execute(args, context);
      return { toolName: name, args, result, duration: Date.now() - start, success: true };
    } catch (err) {
      return { toolName: name, args, result: null, duration: Date.now() - start, success: false, error: String(err) };
    }
  }
}

const graphSearchTool: ToolHandler = {
  name: 'graph_search',
  description: 'Search the knowledge graph for nodes related to a query. Returns matching notes and their connections.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (title or tag)' },
      hops: { type: 'number', description: 'Number of hops to expand (default: 1)', default: 1 },
      limit: { type: 'number', description: 'Max results (default: 10)', default: 10 },
    },
    required: ['query'],
  },
  async execute(args, ctx) {
    const result = await ctx.graphEngine.query({ query: args.query as string, hops: args.hops as number ?? 1, limit: args.limit as number ?? 10 });
    return result;
  },
};

const ragRetrieveTool: ToolHandler = {
  name: 'rag_retrieve',
  description: 'Retrieve relevant content from the knowledge base using keyword and tag matching.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      topK: { type: 'number', description: 'Number of results (default: 5)', default: 5 },
    },
    required: ['query'],
  },
  async execute(args, ctx) {
    const q = (args.query as string).toLowerCase();
    const results: Array<{ noteId: string; title: string; tags: string[]; relevance: string }> = [];

    for (const [id, meta] of ctx.notesIndex) {
      const titleMatch = meta.title.toLowerCase().includes(q);
      const tagMatch = meta.tags.some((t) => t.toLowerCase().includes(q));
      const parseResult = ctx.parseCache.get(id);
      const contentMatch = parseResult?.wikiLinks.some((l) => l.target.toLowerCase().includes(q));

      if (titleMatch || tagMatch || contentMatch) {
        results.push({
          noteId: id,
          title: meta.title,
          tags: meta.tags,
          relevance: titleMatch ? 'title' : tagMatch ? 'tag' : 'content-link',
        });
      }
      if (results.length >= (args.topK as number ?? 5)) break;
    }

    return { results, total: results.length };
  },
};

const noteSummarizeTool: ToolHandler = {
  name: 'note_summarize',
  description: 'Summarize the content of a specific note.',
  parameters: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: 'Note ID to summarize' },
    },
    required: ['noteId'],
  },
  async execute(args, ctx) {
    const noteId = args.noteId as string;
    const meta = ctx.notesIndex.get(noteId);
    if (!meta) throw new Error(`Note not found: ${noteId}`);

    const content = await ctx.fileManager.read(meta.filePath);
    const lines = content.split('\n');
    const headings = lines.filter((l) => l.startsWith('#')).slice(0, 10);
    const wordCount = content.split(/\s+/).length;

    return {
      noteId,
      title: meta.title,
      tags: meta.tags,
      wordCount,
      headings,
      firstParagraph: lines.find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))?.slice(0, 200) ?? '',
    };
  },
};

const fileCreateTool: ToolHandler = {
  name: 'file_create',
  description: 'Create a new note file in the vault.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'Note content (Markdown)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
    },
    required: ['title', 'content'],
  },
  async execute(args, ctx) {
    const tags = ((args.tags as string[] | undefined) ?? []).map((t: string) => `#${t}`).join(' ');
    const frontmatter = tags ? `---\ntags: [${(args.tags as string[] | undefined)?.join(', ') ?? ''}]\n---\n\n` : '';
    const content = `${frontmatter}# ${args.title as string}\n\n${args.content as string}`;
    const result = await ctx.fileManager.create(ctx.vaultPath, args.title as string, content);
    return { ...result as Record<string, unknown>, created: true };
  },
};

const listNotesTool: ToolHandler = {
  name: 'list_notes',
  description: 'List all notes in the vault, optionally filtered by tag.',
  parameters: {
    type: 'object',
    properties: {
      tag: { type: 'string', description: 'Filter by tag (optional)' },
      limit: { type: 'number', description: 'Max results (default: 20)', default: 20 },
    },
  },
  async execute(args, ctx) {
    let notes = Array.from(ctx.notesIndex.values());
    if (args.tag) {
      const tag = (args.tag as string).toLowerCase();
      notes = notes.filter((n) => n.tags.some((t) => t.toLowerCase().includes(tag)));
    }
    return { notes: notes.slice(0, (args.limit as number) ?? 20).map((n) => ({ id: n.id, title: n.title, tags: n.tags })), total: notes.length };
  },
};

const tagSearchTool: ToolHandler = {
  name: 'tag_search',
  description: 'Search notes by tags. Returns notes that contain any of the specified tags, along with related tags.',
  parameters: {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags to search for' },
      matchAll: { type: 'boolean', description: 'If true, notes must have ALL tags. If false, ANY tag matches (default: false)', default: false },
      limit: { type: 'number', description: 'Max results (default: 20)', default: 20 },
    },
    required: ['tags'],
  },
  async execute(args, ctx) {
    const searchTags = (args.tags as string[]).map((t) => t.toLowerCase());
    const matchAll = (args.matchAll as boolean) ?? false;

    const matching = Array.from(ctx.notesIndex.values()).filter((n) => {
      const noteTags = n.tags.map((t) => t.toLowerCase());
      return matchAll
        ? searchTags.every((st) => noteTags.some((nt) => nt.includes(st)))
        : searchTags.some((st) => noteTags.some((nt) => nt.includes(st)));
    });

    const relatedTags = new Map<string, number>();
    for (const note of matching) {
      for (const tag of note.tags) {
        if (!searchTags.includes(tag.toLowerCase())) {
          relatedTags.set(tag, (relatedTags.get(tag) ?? 0) + 1);
        }
      }
    }

    const topRelated = Array.from(relatedTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      notes: matching.slice(0, (args.limit as number) ?? 20).map((n) => ({ id: n.id, title: n.title, tags: n.tags })),
      totalMatches: matching.length,
      relatedTags: topRelated,
    };
  },
};

const webdavSyncTool: ToolHandler = {
  name: 'webdav_sync',
  description: 'Trigger WebDAV sync to upload/download notes. Use this when the user asks to sync, backup, or push notes to the cloud.',
  parameters: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['upload', 'download', 'bidirectional'], description: 'Sync direction (default: bidirectional)', default: 'bidirectional' },
    },
  },
  async execute(args, ctx) {
    if (!ctx.syncManager) {
      return { success: false, error: 'WebDAV sync is not configured. Please configure it in Settings (Ctrl+,) under the Sync tab.' };
    }

    try {
      const direction = (args.direction as string) ?? 'bidirectional';
      const result = await ctx.syncManager.startSync(direction);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const builtinTools: ToolHandler[] = [
  graphSearchTool,
  ragRetrieveTool,
  noteSummarizeTool,
  fileCreateTool,
  listNotesTool,
  tagSearchTool,
  webdavSyncTool,
];
