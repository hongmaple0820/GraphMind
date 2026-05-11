import { useState, useMemo } from 'react';
import { useAppStore, type NoteInfo } from '../stores/app-store';

interface SidebarProps {
  onCreateNote: (title: string) => void;
  onSelectVault: () => void;
}

export function Sidebar({ onCreateNote, onSelectVault }: SidebarProps) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const activeNoteId = useAppStore((s) => s.activeNoteId);
  const notes = useAppStore((s) => s.notes);
  const starredNotes = useAppStore((s) => s.starredNotes);
  const recentNotes = useAppStore((s) => s.recentNotes);
  const openNote = useAppStore((s) => s.openNote);
  const toggleStar = useAppStore((s) => s.toggleStar);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedSections, setExpandedSections] = useState({ files: true, starred: true, recent: true, tags: true });

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredNotes = useMemo(() => {
    if (!searchFilter) return notes;
    const q = searchFilter.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [notes, searchFilter]);

  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const starredNoteList = notes.filter((n) => starredNotes.includes(n.id));
  const recentNoteList = recentNotes
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is NoteInfo => n !== undefined)
    .slice(0, 10);

  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [showNewNote, setShowNewNote] = useState(false);

  const handleCreate = () => {
    if (newNoteTitle.trim()) {
      onCreateNote(newNoteTitle.trim());
      setNewNoteTitle('');
      setShowNewNote(false);
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 flex-col items-center border-r border-border-subtle bg-surface-raised py-2 gap-1">
        <button className="sidebar-icon-btn" onClick={() => openNote(activeNoteId ?? '')} title="Files">
          <FileIcon />
        </button>
        <button className="sidebar-icon-btn" title="Starred">
          <StarIcon filled={false} />
        </button>
        <button className="sidebar-icon-btn" title="Tags">
          <TagIcon />
        </button>
        <div className="flex-1" />
        <button className="sidebar-icon-btn" onClick={() => setShowNewNote(true)} title="New Note">
          <PlusIcon />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 flex-col border-r border-border-subtle bg-surface-raised">
      <div className="p-2">
        <div className="flex items-center gap-1.5 rounded-md bg-surface-overlay/50 px-2 py-1">
          <SearchIconSmall />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs text-text-disabled">VAULT</span>
        <div className="flex gap-1">
          <button onClick={() => setShowNewNote(!showNewNote)} className="sidebar-action-btn" title="New Note">
            <PlusIcon />
          </button>
          <button onClick={onSelectVault} className="sidebar-action-btn" title="Open Vault">
            <FolderIcon />
          </button>
        </div>
      </div>

      {showNewNote && (
        <div className="mx-2 mb-1 flex items-center gap-1 rounded bg-surface-overlay/50 px-2 py-1">
          <input
            type="text"
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNewNote(false); }}
            placeholder="Note title..."
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled focus:outline-none"
            autoFocus
          />
          <button onClick={handleCreate} className="text-xs text-primary-400 hover:text-primary-300">Create</button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
        {starredNoteList.length > 0 && (
          <SidebarSection title="Starred" expanded={expandedSections.starred} onToggle={() => toggleSection('starred')}>
            {starredNoteList.map((note) => (
              <NoteItem key={note.id} note={note} active={note.id === activeNoteId} onClick={() => openNote(note.id)} onStar={() => toggleStar(note.id)} starred />
            ))}
          </SidebarSection>
        )}

        <SidebarSection title="Files" expanded={expandedSections.files} onToggle={() => toggleSection('files')}>
          {filteredNotes.map((note) => (
            <NoteItem key={note.id} note={note} active={note.id === activeNoteId} onClick={() => openNote(note.id)} onStar={() => toggleStar(note.id)} starred={starredNotes.includes(note.id)} />
          ))}
          {filteredNotes.length === 0 && <p className="px-2 py-1 text-xs text-text-disabled">No notes found</p>}
        </SidebarSection>

        {allTags.length > 0 && (
          <SidebarSection title="Tags" expanded={expandedSections.tags} onToggle={() => toggleSection('tags')}>
            <div className="flex flex-wrap gap-1 px-1.5">
              {allTags.map(([tag, count]) => (
                <span key={tag} className="cursor-pointer rounded bg-surface-overlay/80 px-1.5 py-0.5 text-xs text-text-secondary hover:bg-primary-500/20 hover:text-primary-300" onClick={() => setSearchFilter(tag)}>
                  #{tag} <span className="text-text-disabled">({count})</span>
                </span>
              ))}
            </div>
          </SidebarSection>
        )}
      </nav>

      <div className="border-t border-border-subtle px-3 py-1.5 text-xs text-text-disabled">
        {notes.length} notes
      </div>
    </aside>
  );
}

function SidebarSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <button onClick={onToggle} className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-disabled hover:text-text-secondary">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <path d="M3 1l5 4-5 4z" />
        </svg>
        {title}
      </button>
      {expanded && children}
    </div>
  );
}

function NoteItem({ note, active, onClick, onStar, starred }: { note: NoteInfo; active: boolean; onClick: () => void; onStar: () => void; starred: boolean }) {
  return (
    <div className={`group flex items-center gap-1.5 rounded px-2 py-0.5 text-sm cursor-pointer ${active ? 'bg-primary-500/20 text-primary-300' : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'}`} onClick={onClick}>
      <FileIconSmall />
      <span className="flex-1 truncate">{note.title || note.id}</span>
      <button onClick={(e) => { e.stopPropagation(); onStar(); }} className={`opacity-0 group-hover:opacity-100 ${starred ? 'opacity-100 text-warning' : 'text-text-disabled hover:text-warning'}`}>
        <StarIconSmall filled={starred} />
      </button>
    </div>
  );
}

function FileIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0110 .293L13.707 4a1 1 0 01.293.707V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2z" /></svg>; }
function FileIconSmall() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 opacity-50"><path d="M4 0h5.293A1 1 0 0110 .293L13.707 4a1 1 0 01.293.707V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2z" /></svg>; }
function StarIcon({ filled }: { filled: boolean }) { return <svg width="16" height="16" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2.2 4.6L15 6.3l-3.5 3.4.8 4.9L8 12.3 3.7 14.6l.8-4.9L1 6.3l4.8-.7z" /></svg>; }
function StarIconSmall({ filled }: { filled: boolean }) { return <svg width="12" height="12" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2.2 4.6L15 6.3l-3.5 3.4.8 4.9L8 12.3 3.7 14.6l.8-4.9L1 6.3l4.8-.7z" /></svg>; }
function TagIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 012.5 1h3.879a1.5 1.5 0 011.06.44l6.122 6.12a1.5 1.5 0 010 2.122l-4.622 4.622a1.5 1.5 0 01-2.122 0L.44 8.44A1.5 1.5 0 010 7.38V2.5z" /></svg>; }
function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" /></svg>; }
function FolderIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" /></svg>; }
function SearchIconSmall() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-text-disabled"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" /></svg>; }
