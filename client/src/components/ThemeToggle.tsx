import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { readThemeChoice, storeTheme, type ThemeChoice } from '../theme';

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => {
    storeTheme(theme);
  }, [theme]);

  const toggle = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <button onClick={toggle} className="secondary" style={{ width: '2.5rem', padding: 0 }} title={`Theme: ${theme}`}>
      {theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <div style={{ fontSize: '0.7rem', fontWeight: 800 }}>Auto</div>}
    </button>
  );
};
