import { describe, it, expect } from 'vitest';

describe('AppStore', () => {
  it('should export store creation function', async () => {
    const { useAppStore } = await import('./app-store');
    expect(useAppStore).toBeDefined();
    expect(typeof useAppStore.getState).toBe('function');
  });

  it('should have correct initial state', async () => {
    const { useAppStore } = await import('./app-store');
    const state = useAppStore.getState();
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.agentPanelCollapsed).toBe(true);
    expect(state.activeView).toBe('editor');
    expect(state.vaultPath).toBeNull();
  });

  it('should toggle sidebar', async () => {
    const { useAppStore } = await import('./app-store');
    const state = useAppStore.getState();
    state.toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    state.toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });
});
