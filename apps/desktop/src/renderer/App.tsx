import { useEffect, useState, useCallback } from 'react';
import { useAppStore, type NoteInfo } from './stores/app-store';
import { useThemeStore } from './stores/theme-store';
import { Sidebar } from './layout/Sidebar';
import { TopBar } from './layout/TopBar';
import { MainContent } from './layout/MainContent';
import { AgentPanel } from './agent/AgentPanel';
import { CommandPalette } from './shared/CommandPalette';
import { SettingsModal } from './settings/SettingsModal';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { gmApi, gmSelectVault, gmOnVaultChanged } from './lib/api';

export function App() {
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [backlinks, setBacklinks] = useState<Record<string, string[]>>({});
  const [isIndexing, setIsIndexing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const vaultPath = useAppStore((s) => s.vaultPath);
  const activeNoteId = useAppStore((s) => s.activeNoteId);
  const setNotes = useAppStore((s) => s.setNotes);
  const setVaultPath = useAppStore((s) => s.setVaultPath);
  const openNote = useAppStore((s) => s.openNote);
  const notes = useAppStore((s) => s.notes);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const initTheme = useThemeStore((s) => s.setMode);
  const themeMode = useThemeStore((s) => s.mode);

  useEffect(() => {
    initTheme(themeMode);

    const initVault = async () => {
      try {
        const config = await gmApi('config')?.call('get') as Record<string, unknown> | undefined;
        if (config?.vaultPath) {
          setVaultPath(config.vaultPath as string);
        }
      } catch (err) {
        console.warn('Failed to load initial config:', err);
      }
    };
    initVault();

    const unsubscribe = gmOnVaultChanged((vp) => {
      setVaultPath(vp);
    });

    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => {
      window.removeEventListener('keydown', handleKeyboard);
      unsubscribe();
    };
  }, []);

  const indexVault = useCallback(async () => {
    const api = gmApi('file');
    if (!api || !vaultPath) return;
    setIsIndexing(true);
    try {
      const noteList = await api.call('indexVault', vaultPath) as NoteInfo[];
      setNotes(noteList);
    } catch (err) {
      console.warn('Failed to index vault:', err);
    } finally {
      setIsIndexing(false);
    }
  }, [vaultPath, setNotes]);

  useEffect(() => {
    if (vaultPath) indexVault();
  }, [vaultPath, indexVault]);

  const loadNoteContent = useCallback(async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    try {
      const fileApi = gmApi('file');
      const graphApi = gmApi('graph');
      if (!fileApi || !graphApi) return;

      const result = await fileApi.call('read', note.filePath) as { content: string };
      setFileContents((prev) => ({ ...prev, [noteId]: result.content }));

      const bl = await graphApi.call('getBacklinks', noteId) as { edges: Array<{ source: string }> };
      const blIds = (bl.edges ?? []).map((e) => e.source);
      setBacklinks((prev) => ({ ...prev, [noteId]: blIds }));
    } catch (err) {
      console.warn('Failed to load note content:', err);
    }
  }, [notes]);

  useEffect(() => {
    if (activeNoteId) loadNoteContent(activeNoteId);
  }, [activeNoteId, loadNoteContent]);

  const handleNoteChange = useCallback((noteId: string, content: string) => {
    setFileContents((prev) => ({ ...prev, [noteId]: content }));
  }, []);

  const handleNoteSave = useCallback(async (noteId: string, content: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    try {
      const fileApi = gmApi('file');
      if (!fileApi) return;
      await fileApi.call('write', note.filePath, content);
    } catch (err) {
      console.warn('Failed to save note:', err);
    }
  }, [notes]);

  const handleJumpToNote = useCallback((target: string) => {
    const exists = notes.some((n) => n.id === target);
    if (exists) openNote(target);
  }, [notes, openNote]);

  const handleCreateNote = useCallback(async (title: string) => {
    if (!vaultPath) return;
    try {
      const fileApi = gmApi('file');
      if (!fileApi) return;
      const result = await fileApi.call('create', vaultPath, title) as { noteId: string };
      await indexVault();
      openNote(result.noteId);
      setFileContents((prev) => ({ ...prev, [result.noteId]: `# ${title}\n\n` }));
    } catch (err) {
      console.warn('Failed to create note:', err);
    }
  }, [vaultPath, indexVault, openNote]);

  const handleSelectVault = useCallback(async () => {
    try {
      const result = await gmSelectVault();
      if (result.vaultPath) {
        setVaultPath(result.vaultPath);
      }
    } catch (err) {
      console.warn('Failed to select vault:', err);
    }
  }, [setVaultPath]);

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base">
        <TopBar isIndexing={isIndexing} onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar onCreateNote={handleCreateNote} onSelectVault={handleSelectVault} />
          <MainContent
            activeNoteId={activeNoteId}
            fileContents={fileContents}
            backlinks={backlinks}
            notes={notes}
            onChange={handleNoteChange}
            onSave={handleNoteSave}
            onJumpToNote={handleJumpToNote}
            onOpenNote={openNote}
          />
        </div>
        <AgentPanel />
        <CommandPalette onCreateNote={handleCreateNote} onOpenSettings={() => setSettingsOpen(true)} />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </ErrorBoundary>
  );
}