export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'both-keep' | 'skip';

export interface FileEntry {
  path: string;
  mtime: number;
  etag?: string;
  hash: string;
  size: number;
}

export interface SyncDecision {
  path: string;
  action: SyncAction;
  localEntry?: FileEntry;
  remoteEntry?: FileEntry;
  baseEntry?: FileEntry;
}

export type SyncAction = 'upload' | 'download' | 'conflict' | 'skip' | 'delete-local' | 'delete-remote';

export interface ConflictResolution {
  path: string;
  strategy: ConflictStrategy;
  applyToAll?: boolean;
}

export interface SyncProgress {
  phase: 'scanning' | 'comparing' | 'uploading' | 'downloading' | 'resolving' | 'done';
  completed: number;
  total: number;
  currentFile?: string;
}

export interface WebDAVConfig {
  url: string;
  username: string;
  password?: string;
  remotePath: string;
}
