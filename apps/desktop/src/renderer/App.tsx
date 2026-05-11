import { useEffect, useState, useCallback } from 'react';
import { useAppStore, type NoteInfo } from './stores/app-store';
import { useThemeStore } from './stores/theme-store';
import { Sidebar } from './layout/Sidebar';
import { TopBar } from './layout/TopBar';
import { MainContent } from './layout/MainContent';
import { AgentPanel } from './agent/AgentPanel';
import { CommandPalette } from './shared/CommandPalette';
import { SettingsModal } from './settings/SettingsModal';

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
  const initTheme = useThemeStore((s) => s.setMode);
  const themeMode = useThemeStore((s) => s.mode);

  useEffect(() => {
    initTheme(themeMode);

    const initVault = async () => {
      try {
        const config = await (window as any).graphmind?.getConfig();
        if (config?.vaultPath) {
          setVaultPath(config.vaultPath);
        }
      } catch {}
    };
    initVault();

    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, []);

  const indexVault = useCallback(async () => {
    if (!(window as any).graphmind || !vaultPath) return;
    setIsIndexing(true);
    try {
      const noteList: NoteInfo[] = await (window as any).graphmind.file.indexVault(vaultPath);
      setNotes(noteList);
    } finally {
      setIsIndexing(false);
    }
  }, [vaultPath, setNotes]);

  useEffect(() => {
    if (vaultPath) indexVault();
  }, [vaultPath, indexVault]);

  const loadNoteContent = useCallback(async (noteId: string) => {
    if (!(window as any).graphmind) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    try {
      const { content } = await (window as any).graphmind.file.read(note.filePath);
      setFileContents((prev) => ({ ...prev, [noteId]: content }));

      const bl = await (window as any).graphmind.graph.getBacklinks(noteId);
      const blIds = (bl.edges ?? []).map((e: any) => e.source);
      setBacklinks((prev) => ({ ...prev, [noteId]: blIds }));
    } catch {}
  }, [notes]);

  useEffect(() => {
    if (activeNoteId) loadNoteContent(activeNoteId);
  }, [activeNoteId, loadNoteContent]);

  const handleNoteChange = useCallback((noteId: string, content: string) => {
    setFileContents((prev) => ({ ...prev, [noteId]: content }));
  }, []);

  const handleNoteSave = useCallback(async (noteId: string, content: string) => {
    if (!(window as any).graphmind) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    try {
      await (window as any).graphmind.file.write(note.filePath, content);
    } catch {}
  }, [notes]);

  const handleJumpToNote = useCallback((target: string) => {
    const exists = notes.some((n) => n.id === target);
    if (exists) {
      openNote(target);
    }
  }, [notes, openNote]);

  const handleCreateNote = useCallback(async (title: string) => {
    if (!(window as any).graphmind || !vaultPath) return;
    try {
      const result = await (window as any).graphmind.file.create(vaultPath, title);
      await indexVault();
      openNote(result.noteId);
      setFileContents((prev) => ({ ...prev, [result.noteId]: `# ${title}\n\n` }));
    } catch {}
  }, [vaultPath, indexVault, openNote]);

  const handleSelectVault = useCallback(async () => {
    // In Electron, this would open a folder picker dialog
    // For now, use default documents path
    const config = await (window as any).graphmind?.getConfig();
    if (config?.vaultPath) {
      setVaultPath(config.vaultPath);
    }
  }, [setVaultPath]);

  return (
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
      <CommandPalette />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
