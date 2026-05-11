export interface GraphNode {
  id: string;
  title: string;
  filePath: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  contentHash: string;
  embedding?: Float32Array;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  metadata?: EdgeMetadata;
}

export type EdgeType = 'link_ref' | 'tag_cooccurrence' | 'temporal_seq' | 'semantic_sim';

export interface EdgeMetadata {
  context?: string;
  position?: { line: number; col: number };
}

export interface GraphData {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  adjacency: Map<string, Set<string>>;
  reverseIndex: Map<string, Set<string>>;
}

export interface GraphUpdateEvent {
  type: 'node-added' | 'node-updated' | 'node-removed' | 'edge-added' | 'edge-removed';
  nodeId?: string;
  edgeId?: string;
  timestamp: number;
}
