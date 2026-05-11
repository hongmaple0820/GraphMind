export interface IpcChannel {
  domain: string;
  action: string;
}

export type IpcHandler<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export interface FileReadInput {
  path: string;
}

export interface FileReadOutput {
  content: string;
  encoding: string;
}

export interface FileWriteInput {
  path: string;
  content: string;
  encoding?: string;
}

export interface FileWriteOutput {
  success: boolean;
}

export interface GraphQueryInput {
  nodeId?: string;
  query?: string;
  hops?: number;
  limit?: number;
}

export interface GraphQueryOutput {
  nodes: unknown[];
  edges: unknown[];
}

export interface AgentChatInput {
  message: string;
  conversationId?: string;
  model?: string;
}

export interface AgentChatStreamChunk {
  content?: string;
  done: boolean;
  citations?: unknown[];
}

export interface SyncStartInput {
  direction: 'upload' | 'download' | 'bidirectional';
}

export interface SyncStartOutput {
  syncId: string;
}
