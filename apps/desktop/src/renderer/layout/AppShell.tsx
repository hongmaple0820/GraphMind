import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MainContent } from './MainContent';
import { AgentPanel } from '../agent/AgentPanel';
import { useAppStore } from '../stores/app-store';

interface AppShellProps {
  isIndexing?: boolean;
  onOpenSettings?: () => void;
  onCreateNote: (title: string) => void;
  onSelectVault: () => void;
  activeNoteId: string | null;
  fileContents: Record<string, string>;
  backlinks: Record<string, string[]>;
  notes: ReturnType<typeof useAppStore.getState>['notes'];
  onChange: (noteId: string, content: string) => void;
  onSave: (noteId: string, content: string) => void;
  onJumpToNote: (target: string) => void;
  onOpenNote: (noteId: string) => void;
}

export function AppShell({ isIndexing, onOpenSettings, onCreateNote, onSelectVault, activeNoteId, fileContents, backlinks, notes, onChange, onSave, onJumpToNote, onOpenNote }: AppShellProps) {
  const agentPanelCollapsed = useAppStore((s) => s.agentPanelCollapsed);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar isIndexing={isIndexing} onOpenSettings={onOpenSettings} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onCreateNote={onCreateNote} onSelectVault={onSelectVault} />
        <MainContent
          activeNoteId={activeNoteId}
          fileContents={fileContents}
          backlinks={backlinks}
          notes={notes}
          onChange={onChange}
          onSave={onSave}
          onJumpToNote={onJumpToNote}
          onOpenNote={onOpenNote}
        />
      </div>
      {!agentPanelCollapsed && <AgentPanel />}
    </div>
  );
}