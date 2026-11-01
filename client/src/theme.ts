export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'openea-theme';

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f8f9fa',
  dark: '#1a1b1e',
};

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage can be blocked. Fall through to the system preference.
  }
  return 'system';
}

export function resolvedTheme(choice: ThemeChoice = readThemeChoice()): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(choice: ThemeChoice = readThemeChoice()): ResolvedTheme {
  const resolved = resolvedTheme(choice);
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  return resolved;
}

export function storeTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // The attribute still updates for this page.
  }
  applyTheme(choice);
}

/** Re-apply while the choice is system. An explicit light or dark choice stays put. */
export function watchSystemTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    applyTheme();
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
