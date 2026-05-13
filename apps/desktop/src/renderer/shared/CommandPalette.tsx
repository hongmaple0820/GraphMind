import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '../stores/app-store';
import { useThemeStore } from '../stores/theme-store';
import { gmApi } from '../lib/api';

interface Command {
  id: string;
  label: string;
  icon: string;
  detail?: string;
  shortcut?: string;
  category: 'navigation' | 'note' | 'view' | 'setting' | 'search';
  action: () => void;
}

interface CommandPaletteProps {
  onCreateNote?: (title: string) => void;
  onOpenSettings?: () => void;
}

export function CommandPalette({ onCreateNote, onOpenSettings }: CommandPaletteProps) {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const openNote = useAppStore((s) => s.openNote);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const toggleAgentPanel = useAppStore((s) => s.toggleAgentPanel);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const notes = useAppStore((s) => s.notes);
  const vaultPath = useAppStore((s) => s.vaultPath);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
        setQuery('');
        setSelectedIndex(0);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setOpen(true);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'new-note', label: 'New Note', icon: '+', shortcut: 'Ctrl+N', category: 'note', action: () => {
        const title = window.prompt('Note title:');
        if (title) onCreateNote?.(title);
        setOpen(false);
      }},
      { id: 'graph-view', label: 'Switch to Graph View', icon: 'G', shortcut: 'Ctrl+G', category: 'view', action: () => { setActiveView('graph'); setOpen(false); } },
      { id: 'editor-view', label: 'Switch to Editor View', icon: 'E', category: 'view', action: () => { setActiveView('editor'); setOpen(false); } },
      { id: 'toggle-agent', label: 'Toggle Agent Panel', icon: 'AI', shortcut: 'Ctrl+J', category: 'view', action: () => { toggleAgentPanel(); setOpen(false); } },
      { id: 'toggle-sidebar', label: 'Toggle Sidebar', icon: 'S', category: 'view', action: () => { toggleSidebar(); setOpen(false); } },
      { id: 'theme-dark', label: 'Theme: Dark', icon: 'D', category: 'setting', action: () => { useThemeStore.getState().setMode('dark'); setOpen(false); } },
      { id: 'theme-light', label: 'Theme: Light', icon: 'L', category: 'setting', action: () => { useThemeStore.getState().setMode('light'); setOpen(false); } },
      { id: 'theme-system', label: 'Theme: System', icon: 'PC', category: 'setting', action: () => { useThemeStore.getState().setMode('system'); setOpen(false); } },
      { id: 'settings', label: 'Open Settings', icon: 'G', shortcut: 'Ctrl+,', category: 'setting', action: () => { onOpenSettings?.(); setOpen(false); } },
      { id: 'sync', label: 'Sync with WebDAV', icon: 'S', category: 'setting', action: () => {
        if (vaultPath) gmApi('sync')?.call('start', 'bidirectional');
        setOpen(false);
      }},
      { id: 'reindex', label: 'Re-index Vault', icon: 'I', category: 'setting', action: () => {
        if (vaultPath) gmApi('file')?.call('indexVault', vaultPath);
        setOpen(false);
      }},
      { id: 'rag-search', label: 'RAG Search...', icon: 'R', category: 'search', action: () => {
        const q = window.prompt('Search your knowledge base:');
        if (q) gmApi('rag')?.call('query', { query: q, vaultPath: vaultPath ?? '' });
        setOpen(false);
      }},
    ];

    const noteCommands: Command[] = notes.map((n) => ({
      id: `note-${n.id}`,
      label: n.title || n.id,
      icon: 'D',
      detail: n.tags.length > 0 ? n.tags.slice(0, 3).join(', ') : undefined,
      category: 'note' as const,
      action: () => { openNote(n.id); setOpen(false); },
    }));

    return [...base, ...noteCommands];
  }, [notes, setOpen, setActiveView, toggleAgentPanel, toggleSidebar, openNote, vaultPath, onCreateNote, onOpenSettings]);

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 20);
    const q = query.toLowerCase();
    return commands
      .filter((c) => c.label.toLowerCase().includes(q) || (c.detail ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  }, [filtered, selectedIndex]);

  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    note: 'Notes',
    view: 'View',
    setting: 'Settings',
    search: 'Search',
  };

  let lastCategory = '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative w-full max-w-lg rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--color-text-disabled)]">
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, commands, actions..."
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)] focus:outline-none"
          />
          <div className="flex items-center gap-1">
            <kbd className="rounded bg-[var(--color-surface-overlay)] px-1.5 py-0.5 text-xs text-[var(--color-text-disabled)]">Up/Down</kbd>
            <kbd className="rounded bg-[var(--color-surface-overlay)] px-1.5 py-0.5 text-xs text-[var(--color-text-disabled)]">Enter</kbd>
            <kbd className="rounded bg-[var(--color-surface-overlay)] px-1.5 py-0.5 text-xs text-[var(--color-text-disabled)]">Esc</kbd>
          </div>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1 scrollbar-thin">
          {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-[var(--color-text-disabled)]">No results found</p>}
          {filtered.map((cmd, idx) => {
            const showCategory = cmd.category !== lastCategory;
            lastCategory = cmd.category;
            return (
              <div key={cmd.id}>
                {showCategory && (
                  <div className="px-3 py-1 text-xs font-medium text-[var(--color-text-disabled)] uppercase tracking-wider">
                    {categoryLabels[cmd.category] || cmd.category}
                  </div>
                )}
                <button
                  onClick={cmd.action}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    idx === selectedIndex
                      ? 'bg-[var(--color-primary-500)/20] text-[var(--color-primary-300)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--color-surface-overlay)]/80 text-xs text-[var(--color-text-disabled)]">{cmd.icon}</span>
                  <span className="flex-1 text-left truncate">{cmd.label}</span>
                  {cmd.detail && <span className="text-xs text-[var(--color-text-disabled)] truncate">{cmd.detail}</span>}
                  {cmd.shortcut && <kbd className="text-xs text-[var(--color-text-disabled)]">{cmd.shortcut}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
