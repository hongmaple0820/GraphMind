import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MainContent } from './MainContent';
import { AgentPanel } from '../agent/AgentPanel';
import { useAppStore } from '../stores/app-store';

interface AppShellProps {
  activeFile: string | null;
  onFileSelect: (filePath: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function AppShell({ activeFile, onFileSelect, sidebarCollapsed, onToggleSidebar }: AppShellProps) {
  const agentPanelCollapsed = useAppStore((s) => s.agentPanelCollapsed);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar onToggleSidebar={onToggleSidebar} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onFileSelect={onFileSelect}
          activeFile={activeFile}
        />
        <MainContent activeFile={activeFile} />
      </div>
      {!agentPanelCollapsed && <AgentPanel />}
    </div>
  );
}
