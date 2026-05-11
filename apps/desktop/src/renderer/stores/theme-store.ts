import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setMode: (mode: ThemeMode) => void;
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark' as ThemeMode,
      resolvedTheme: 'dark' as const,
      setMode: (mode: ThemeMode) => {
        const resolved = resolveTheme(mode);
        document.documentElement.classList.toggle('dark', resolved === 'dark');
        document.documentElement.classList.toggle('light', resolved === 'light');
        document.documentElement.setAttribute('data-theme', resolved);
        set({ mode, resolvedTheme: resolved });
      },
    }),
    {
      name: 'graphmind-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.mode);
          state.resolvedTheme = resolved;
          document.documentElement.classList.toggle('dark', resolved === 'dark');
          document.documentElement.classList.toggle('light', resolved === 'light');
          document.documentElement.setAttribute('data-theme', resolved);
        }
      },
    },
  ),
);

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.mode === 'system') {
      state.setMode('system');
    }
  });
}
