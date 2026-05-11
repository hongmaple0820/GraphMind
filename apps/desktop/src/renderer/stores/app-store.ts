import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NoteInfo {
  id: string;
  title: string;
  filePath: string;
  tags: string[];
  updatedAt: number;
  createdAt: number;
}

interface AppState {
  sidebarCollapsed: boolean;
  agentPanelCollapsed: boolean;
  activeView: 'editor' | 'graph';
  editorMode: 'edit' | 'split' | 'preview';
  vaultPath: string | null;
  activeNoteId: string | null;
  notes: NoteInfo[];
  recentNotes: string[];
  starredNotes: string[];
  openTabs: string[];
  searchQuery: string;
  commandPaletteOpen: boolean;
  theme: 'dark' | 'light';

  toggleSidebar: () => void;
  toggleAgentPanel: () => void;
  setActiveView: (view: 'editor' | 'graph') => void;
  setEditorMode: (mode: 'edit' | 'split' | 'preview') => void;
  setVaultPath: (path: string) => void;
  setActiveNote: (noteId: string | null) => void;
  setNotes: (notes: NoteInfo[]) => void;
  openNote: (noteId: string) => void;
  closeTab: (noteId: string) => void;
  toggleStar: (noteId: string) => void;
  addToRecent: (noteId: string) => void;
  setSearchQuery: (q: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      agentPanelCollapsed: true,
      activeView: 'editor',
      editorMode: 'edit',
      vaultPath: null,
      activeNoteId: null,
      notes: [],
      recentNotes: [],
      starredNotes: [],
      openTabs: [],
      searchQuery: '',
      commandPaletteOpen: false,
      theme: 'dark',

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleAgentPanel: () => set((s) => ({ agentPanelCollapsed: !s.agentPanelCollapsed })),
      setActiveView: (view) => set({ activeView: view }),
      setEditorMode: (mode) => set({ editorMode: mode }),
      setVaultPath: (path) => set({ vaultPath: path }),
      setActiveNote: (noteId) => set({ activeNoteId: noteId }),

      setNotes: (notes) => {
        set({ notes });
        (window as any).__graphmind_note_names__ = notes.map((n) => n.id);
      },

      openNote: (noteId) => {
        const { openTabs, recentNotes } = get();
        const newTabs = openTabs.includes(noteId) ? openTabs : [...openTabs, noteId];
        const newRecent = [noteId, ...recentNotes.filter((n) => n !== noteId)].slice(0, 20);
        set({ activeNoteId: noteId, openTabs: newTabs, recentNotes: newRecent });
      },

      closeTab: (noteId) => {
        const { openTabs, activeNoteId } = get();
        const newTabs = openTabs.filter((t) => t !== noteId);
        let newActive = activeNoteId;
        if (activeNoteId === noteId) {
          const idx = openTabs.indexOf(noteId);
          newActive = newTabs[Math.min(idx, newTabs.length - 1)] ?? null;
        }
        set({ openTabs: newTabs, activeNoteId: newActive });
      },

      toggleStar: (noteId) => {
        const { starredNotes } = get();
        set({
          starredNotes: starredNotes.includes(noteId)
            ? starredNotes.filter((n) => n !== noteId)
            : [...starredNotes, noteId],
        });
      },

      addToRecent: (noteId) => {
        const { recentNotes } = get();
        set({ recentNotes: [noteId, ...recentNotes.filter((n) => n !== noteId)].slice(0, 20) });
      },

      setSearchQuery: (q) => set({ searchQuery: q }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'graphmind-app',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        agentPanelCollapsed: state.agentPanelCollapsed,
        activeView: state.activeView,
        vaultPath: state.vaultPath,
        recentNotes: state.recentNotes,
        starredNotes: state.starredNotes,
        openTabs: state.openTabs,
        theme: state.theme,
      }),
    },
  ),
);
