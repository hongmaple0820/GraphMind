import type { IpcMain, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { notesIndex, parseCache } from './file-handlers.js';
import type { GraphNode, GraphEdge, EdgeType } from '@shared/types/graph.js';

interface StoredGraphEdge extends GraphEdge {
  createdAt?: number;
  updatedAt?: number;
}

const graphNodes = new Map<string, GraphNode>();
const graphEdges = new Map<string, GraphEdge>();
const adjacency = new Map<string, Set<string>>();
const reverseIndex = new Map<string, Set<string>>();

let graphCachePath: string | null = null;

function setGraphCachePath(vaultPath: string) {
  graphCachePath = path.join(vaultPath, '.graphmind', 'graph-cache.json');
}

async function persistGraph(): Promise<void> {
  if (!graphCachePath) return;
  try {
    const data = {
      nodes: Array.from(graphNodes.entries()),
      edges: Array.from(graphEdges.entries()),
      savedAt: Date.now(),
    };
    await fs.mkdir(path.dirname(graphCachePath), { recursive: true });
    await fs.writeFile(graphCachePath, JSON.stringify(data), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist graph cache:', err);
  }
}

async function loadGraphFromCache(): Promise<boolean> {
  if (!graphCachePath) return false;
  try {
    const raw = await fs.readFile(graphCachePath, 'utf-8');
    const data = JSON.parse(raw);
    if (data.nodes && data.edges) {
      graphNodes.clear();
      graphEdges.clear();
      adjacency.clear();
      reverseIndex.clear();
      for (const [id, node] of data.nodes) {
        graphNodes.set(id, node);
      }
      for (const [id, edge] of data.edges) {
        graphEdges.set(id, edge);
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
        adjacency.get(edge.source)!.add(id);
        if (!reverseIndex.has(edge.target)) reverseIndex.set(edge.target, new Set());
        reverseIndex.get(edge.target)!.add(id);
      }
      return true;
    }
  } catch (err) {
    console.warn('Failed to load graph cache:', err);
  }
  return false;
}

function addEdge(source: string, target: string, type: EdgeType, weight: number, metadata?: Record<string, unknown>) {
  const id = `${source}--${target}--${type}`;
  if (graphEdges.has(id)) return;

  const edge: StoredGraphEdge = {
    id,
    source,
    target,
    type,
    weight,
    metadata,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  graphEdges.set(id, edge);

  if (!adjacency.has(source)) adjacency.set(source, new Set());
  adjacency.get(source)!.add(id);

  if (!reverseIndex.has(target)) reverseIndex.set(target, new Set());
  reverseIndex.get(target)!.add(id);
}

function removeEdgesForNode(nodeId: string) {
  const toRemove: string[] = [];
  for (const [id, edge] of graphEdges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      toRemove.push(id);
    }
  }
  for (const id of toRemove) {
    graphEdges.delete(id);
    const parts = id.split('--');
    const forward = adjacency.get(parts[0]!);
    if (forward) forward.delete(id);
    const reverse = reverseIndex.get(parts[1]!);
    if (reverse) reverse.delete(id);
  }
}

function rebuildGraphFromIndex() {
  graphEdges.clear();
  adjacency.clear();
  reverseIndex.clear();

  for (const [noteId, meta] of notesIndex) {
    const node: GraphNode = {
      id: noteId,
      title: meta.title,
      filePath: meta.filePath,
      tags: meta.tags,
      frontmatter: {},
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      contentHash: '',
    };
    graphNodes.set(noteId, node);
  }

  for (const [noteId, parseResult] of parseCache) {
    for (const link of parseResult.wikiLinks) {
      const targetId = link.target.replace(/\.(md|markdown)$/, '');
      if (targetId && (graphNodes.has(targetId) || notesIndex.has(targetId))) {
        addEdge(noteId, targetId, 'link_ref', 1.0, {
          context: link.alias,
          position: { line: link.line },
        });
      }
    }

    const noteTags = new Set([
      ...(parseResult.frontmatter?.tags ?? []),
      ...parseResult.tags.map((t: { name: string }) => t.name),
    ]);
    for (const tag of noteTags) {
      for (const [otherId, otherMeta] of notesIndex) {
        if (otherId === noteId) continue;
        if (otherMeta.tags.includes(tag)) {
          addEdge(noteId!, otherId!, 'tag_cooccurrence', 0.5, { tag });
        }
      }
    }
  }

  addSemanticSimilarityEdges();

  persistGraph();
}

function addSemanticSimilarityEdges() {
  const nodeIds = Array.from(graphNodes.keys());
  const nodeTagSets = new Map<string, Set<string>>();
  for (const [id, node] of graphNodes) {
    nodeTagSets.set(id, new Set(node.tags.map((t) => t.toLowerCase())));
  }

  const SIMILARITY_THRESHOLD = 0.3;
  const MAX_SEMANTIC_EDGES_PER_NODE = 5;

  for (let i = 0; i < nodeIds.length; i++) {
    const idA = nodeIds[i]!;
    const tagsA = nodeTagSets.get(idA) ?? new Set();
    if (tagsA.size === 0) continue;

    const candidates: Array<{ id: string; similarity: number }> = [];

    for (let j = i + 1; j < nodeIds.length; j++) {
      const idB = nodeIds[j]!;
      const tagsB = nodeTagSets.get(idB) ?? new Set();
      if (tagsB.size === 0) continue;

      const intersectionSize = Array.from(tagsA).filter((t) => tagsB.has(t)).length;
      const unionSize = new Set([...tagsA, ...tagsB]).size;

      const jaccard = unionSize > 0 ? intersectionSize / unionSize : 0;

      const existingEdge = graphEdges.get(`${idA}--${idB!}--link_ref`) ?? graphEdges.get(`${idB!}--${idA}--link_ref`);
      const hasDirectLink = !!existingEdge;

      const finalSimilarity = hasDirectLink ? jaccard * 0.5 : jaccard;

      if (finalSimilarity >= SIMILARITY_THRESHOLD) {
        candidates.push({ id: idB, similarity: finalSimilarity });
      }
    }

    candidates.sort((a, b) => b.similarity - a.similarity);
    const topCandidates = candidates.slice(0, MAX_SEMANTIC_EDGES_PER_NODE);

    for (const candidate of topCandidates) {
      addEdge(idA, candidate.id, 'semantic_sim', candidate.similarity, {
        similarity: candidate.similarity,
        method: 'jaccard',
      });
    }
  }
}

export function registerGraphHandlers(ipcMain: IpcMain, _mainWindow: BrowserWindow) {
  ipcMain.handle('graph:query', async (_event, args: { nodeId?: string; query?: string; hops?: number; limit?: number }) => {
    if (args.nodeId) {
      const hops = args.hops ?? 1;
      const visited = new Set<string>();
      const queue: [string, number][] = [[args.nodeId, 0]];
      const resultNodes: GraphNode[] = [];
      const resultEdges: GraphEdge[] = [];

      while (queue.length > 0) {
        const [currentId, depth] = queue.shift()!;
        if (visited.has(currentId) || depth > hops) continue;
        visited.add(currentId);

        const node = graphNodes.get(currentId);
        if (node) resultNodes.push(node);

        const edgeIds = adjacency.get(currentId);
        if (edgeIds) {
          for (const eid of edgeIds) {
            const edge = graphEdges.get(eid);
            if (edge) {
              resultEdges.push(edge);
              if (!visited.has(edge.target)) {
                queue.push([edge.target, depth + 1]);
              }
            }
          }
        }

        const revEdgeIds = reverseIndex.get(currentId);
        if (revEdgeIds) {
          for (const eid of revEdgeIds) {
            const edge = graphEdges.get(eid);
            if (edge) {
              resultEdges.push(edge);
              if (!visited.has(edge.source)) {
                queue.push([edge.source, depth + 1]);
              }
            }
          }
        }

        if (resultNodes.length >= (args.limit ?? 50)) break;
      }

      return { nodes: resultNodes, edges: resultEdges };
    }

    if (args.query) {
      const q = args.query.toLowerCase();
      const results = Array.from(graphNodes.values()).filter(
        (n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)),
      );
      return { nodes: results.slice(0, args.limit ?? 20), edges: [] };
    }

    return { nodes: Array.from(graphNodes.values()), edges: Array.from(graphEdges.values()) };
  });

  ipcMain.handle('graph:backlinks', async (_event, args: { nodeId: string }) => {
    const edgeIds = reverseIndex.get(args.nodeId) ?? new Set();
    const edges = Array.from(edgeIds)
      .map((id) => graphEdges.get(id))
      .filter((e): e is GraphEdge => e !== undefined && e.type === 'link_ref');
    return { edges };
  });

  ipcMain.handle('graph:rebuild', async () => {
    rebuildGraphFromIndex();
    return { nodeCount: graphNodes.size, edgeCount: graphEdges.size };
  });

  ipcMain.handle('graph:load-cache', async (_event, args: { vaultPath: string }) => {
    setGraphCachePath(args.vaultPath);
    const loaded = await loadGraphFromCache();
    if (!loaded) {
      rebuildGraphFromIndex();
    }
    return { nodeCount: graphNodes.size, edgeCount: graphEdges.size, fromCache: loaded };
  });

  ipcMain.handle('graph:stats', async () => {
    return {
      nodeCount: graphNodes.size,
      edgeCount: graphEdges.size,
      edgeTypes: {
        link_ref: Array.from(graphEdges.values()).filter((e) => e.type === 'link_ref').length,
        tag_cooccurrence: Array.from(graphEdges.values()).filter((e) => e.type === 'tag_cooccurrence').length,
        semantic_sim: Array.from(graphEdges.values()).filter((e) => e.type === 'semantic_sim').length,
      },
    };
  });
}

export { graphNodes, graphEdges, adjacency, reverseIndex };

export async function handleGraphQuery(args: { nodeId?: string; query?: string; hops?: number; limit?: number }) {
  if (args.nodeId) {
    const hops = args.hops ?? 1;
    const visited = new Set<string>();
    const queue: [string, number][] = [[args.nodeId, 0]];
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];

    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;
      if (visited.has(currentId) || depth > hops) continue;
      visited.add(currentId);

      const node = graphNodes.get(currentId);
      if (node) resultNodes.push(node);

      const edgeIds = adjacency.get(currentId);
      if (edgeIds) {
        for (const eid of edgeIds) {
          const edge = graphEdges.get(eid);
          if (edge) {
            resultEdges.push(edge);
            if (!visited.has(edge.target)) queue.push([edge.target, depth + 1]);
          }
        }
      }

      const revEdgeIds = reverseIndex.get(currentId);
      if (revEdgeIds) {
        for (const eid of revEdgeIds) {
          const edge = graphEdges.get(eid);
          if (edge) {
            resultEdges.push(edge);
            if (!visited.has(edge.source)) queue.push([edge.source, depth + 1]);
          }
        }
      }

      if (resultNodes.length >= (args.limit ?? 50)) break;
    }
    return { nodes: resultNodes, edges: resultEdges };
  }

  if (args.query) {
    const q = args.query.toLowerCase();
    const results = Array.from(graphNodes.values()).filter(
      (n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)),
    );
    return { nodes: results.slice(0, args.limit ?? 20), edges: [] };
  }

  return { nodes: Array.from(graphNodes.values()), edges: Array.from(graphEdges.values()) };
}

export async function handleGetBacklinks(nodeId: string) {
  const edgeIds = reverseIndex.get(nodeId) ?? new Set();
  const edges = Array.from(edgeIds)
    .map((id) => graphEdges.get(id))
    .filter((e): e is GraphEdge => e !== undefined && e.type === 'link_ref');
  return { edges };
}
