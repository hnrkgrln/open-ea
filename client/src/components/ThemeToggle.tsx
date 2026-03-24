import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('openapm-theme') as Theme) || 'system';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.setAttribute('data-theme', systemTheme);
    } else {
      root.setAttribute('data-theme', theme);
    }

    localStorage.setItem('openapm-theme', theme);
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
