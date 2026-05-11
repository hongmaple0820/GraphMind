import { useAppStore, type NoteInfo } from '../stores/app-store';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import { GraphCanvas } from '../graph/GraphCanvas';

interface MainContentProps {
  activeNoteId: string | null;
  fileContents: Record<string, string>;
  backlinks: Record<string, string[]>;
  notes: NoteInfo[];
  onChange: (noteId: string, content: string) => void;
  onSave: (noteId: string, content: string) => void;
  onJumpToNote: (target: string) => void;
  onOpenNote: (noteId: string) => void;
}

export function MainContent({ activeNoteId, fileContents, backlinks, notes, onChange, onSave, onJumpToNote, onOpenNote }: MainContentProps) {
  const activeView = useAppStore((s) => s.activeView);
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const openTabs = useAppStore((s) => s.openTabs);
  const closeTab = useAppStore((s) => s.closeTab);
  const setActiveNote = useAppStore((s) => s.setActiveNote);

  if (activeView === 'graph') {
    return <GraphCanvas notes={notes} onNoteClick={onOpenNote} />;
  }

  if (!activeNoteId || !fileContents[activeNoteId]) {
    return (
      <main className="flex flex-1 items-center justify-center bg-surface-base">
        <EmptyState />
      </main>
    );
  }

  const content = fileContents[activeNoteId] ?? '';
  const note = notes.find((n) => n.id === activeNoteId);
  const noteBacklinks = backlinks[activeNoteId] ?? [];

  return (
    <main className="flex flex-1 flex-col bg-surface-base">
      <TabBar
        tabs={openTabs}
        activeId={activeNoteId}
        notes={notes}
        onSelect={setActiveNote}
        onClose={closeTab}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {(editorMode === 'edit' || editorMode === 'split') && (
            <div className={editorMode === 'split' ? 'w-1/2 border-r border-[var(--color-border-subtle)]' : 'flex-1'}>
              <MarkdownEditor
                value={content}
                onChange={(v) => onChange(activeNoteId, v)}
                onSave={(v) => onSave(activeNoteId, v)}
                onJumpToNote={onJumpToNote}
              />
            </div>
          )}
          {(editorMode === 'preview' || editorMode === 'split') && (
            <div className={editorMode === 'split' ? 'w-1/2' : 'flex-1'}>
              <MarkdownPreview content={content} onLinkClick={onJumpToNote} />
            </div>
          )}
          <div className="flex items-center border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
            <div className="flex flex-col gap-0.5 p-1">
              <button onClick={() => setEditorMode('edit')} className={`rounded p-1 text-xs ${editorMode === 'edit' ? 'bg-[var(--color-primary-500)]/20 text-[var(--color-primary-300)]' : 'text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)]'}`} title="Edit">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z" /></svg>
              </button>
              <button onClick={() => setEditorMode('split')} className={`rounded p-1 text-xs ${editorMode === 'split' ? 'bg-[var(--color-primary-500)]/20 text-[var(--color-primary-300)]' : 'text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)]'}`} title="Split View">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 1v14h16V1H0zm7 13H1V2h6v12zm8 0H9V2h6v12z" /></svg>
              </button>
              <button onClick={() => setEditorMode('preview')} className={`rounded p-1 text-xs ${editorMode === 'preview' ? 'bg-[var(--color-primary-500)]/20 text-[var(--color-primary-300)]' : 'text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)]'}`} title="Preview">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.7 5.3 1 8c.7 2.7 3.5 5 7 5s6.3-2.3 7-5c-.7-2.7-3.5-5-7-5zm0 8c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3zm0-5c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
              </button>
            </div>
          </div>
        </div>
        {noteBacklinks.length > 0 && (
          <BacklinkPanel backlinks={noteBacklinks} notes={notes} onOpenNote={onOpenNote} />
        )}
      </div>
      <StatusBar note={note} content={content} />
    </main>
  );
}

function TabBar({ tabs, activeId, notes, onSelect, onClose }: { tabs: string[]; activeId: string; notes: NoteInfo[]; onSelect: (id: string) => void; onClose: (id: string) => void }) {
  return (
    <div className="flex items-center border-b border-border-subtle bg-surface-raised overflow-x-auto scrollbar-thin">
      {tabs.map((tabId) => {
        const note = notes.find((n) => n.id === tabId);
        const isActive = tabId === activeId;
        return (
          <div key={tabId} className={`group flex items-center gap-1 border-r border-border-subtle px-3 py-1 text-xs cursor-pointer ${isActive ? 'bg-surface-base text-text-primary' : 'text-text-secondary hover:bg-surface-overlay/50'}`} onClick={() => onSelect(tabId)}>
            <span className="truncate max-w-[120px]">{note?.title ?? tabId}</span>
            <button onClick={(e) => { e.stopPropagation(); onClose(tabId); }} className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-surface-overlay text-text-disabled hover:text-text-primary">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 4.17L1.76.93.93 1.76 4.17 5 .93 8.24l.83.83L5 5.83l3.24 3.24.83-.83L5.83 5l3.24-3.24-.83-.83L5 4.17z" /></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BacklinkPanel({ backlinks, notes, onOpenNote }: { backlinks: string[]; notes: NoteInfo[]; onOpenNote: (id: string) => void }) {
  return (
    <aside className="w-56 border-l border-border-subtle bg-surface-raised overflow-y-auto scrollbar-thin">
      <div className="px-3 py-2 text-xs font-semibold text-text-disabled uppercase tracking-wider">Backlinks ({backlinks.length})</div>
      {backlinks.map((blId) => {
        const note = notes.find((n) => n.id === blId);
        return (
          <button key={blId} onClick={() => onOpenNote(blId)} className="flex w-full items-center gap-1.5 px-3 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-50"><path d="M4 0h5.293A1 1 0 0110 .293L13.707 4a1 1 0 01.293.707V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2z" /></svg>
            {note?.title ?? blId}
          </button>
        );
      })}
    </aside>
  );
}

function StatusBar({ note, content }: { note?: NoteInfo; content: string }) {
  const lines = content.split('\n').length;
  const words = content.split(/\s+/).filter(Boolean).length;
  return (
    <div className="flex items-center justify-between border-t border-border-subtle bg-surface-raised px-3 py-0.5 text-xs text-text-disabled">
      <div className="flex gap-3">
        {note?.tags.map((tag) => <span key={tag} className="text-primary-400">#{tag}</span>)}
      </div>
      <div className="flex gap-3">
        <span>{lines} lines</span>
        <span>{words} words</span>
        <span>{content.length} chars</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center">
      <div className="mb-4 text-primary-500/20">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" className="mx-auto">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-text-secondary">GraphMind</h2>
      <p className="mb-4 text-sm text-text-disabled">Select a note or press Ctrl+N to create one</p>
      <div className="flex flex-wrap justify-center gap-2 text-xs text-text-disabled">
        <kbd className="rounded bg-surface-overlay px-1.5 py-0.5">Ctrl+K</kbd> Search
        <kbd className="rounded bg-surface-overlay px-1.5 py-0.5">Ctrl+N</kbd> New Note
        <kbd className="rounded bg-surface-overlay px-1.5 py-0.5">Ctrl+J</kbd> Agent
      </div>
    </div>
  );
}
