import { describe, it, expect } from 'vitest';
import { useThemeStore } from '../stores/theme-store';

describe('useThemeStore', () => {
  it('should have default dark mode', () => {
    const state = useThemeStore.getState();
    expect(state.mode).toBe('dark');
  });

  it('should switch to light mode', () => {
    useThemeStore.getState().setMode('light');
    expect(useThemeStore.getState().mode).toBe('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    
    useThemeStore.getState().setMode('dark');
  });

  it('should resolve system theme', () => {
    useThemeStore.getState().setMode('system');
    const resolved = useThemeStore.getState().resolvedTheme;
    expect(['dark', 'light']).toContain(resolved);
    
    useThemeStore.getState().setMode('dark');
  });
});
