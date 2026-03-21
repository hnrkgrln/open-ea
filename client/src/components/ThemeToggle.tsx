import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('meat-theme') as Theme) || 'system';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (t: Theme) => {
      let effectiveTheme = t;
      if (t === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      root.setAttribute('data-theme', effectiveTheme);
    };

    applyTheme(theme);
    localStorage.setItem('meat-theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  return { theme, setTheme };
};

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{ 
      display: 'flex', 
      background: 'var(--secondary)', 
      padding: '0.25rem', 
      borderRadius: 'var(--radius)',
      gap: '0.25rem'
    }}>
      <button 
        onClick={() => setTheme('light')}
        style={{ 
          height: '2rem', 
          width: '2rem', 
          padding: 0, 
          border: 'none',
          background: theme === 'light' ? 'var(--background)' : 'transparent',
          boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
        }}
        title="Light Mode"
      >
        <Sun size={16} />
      </button>
      <button 
        onClick={() => setTheme('system')}
        style={{ 
          height: '2rem', 
          width: '2rem', 
          padding: 0, 
          border: 'none',
          background: theme === 'system' ? 'var(--background)' : 'transparent',
          boxShadow: theme === 'system' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
        }}
        title="Follow System"
      >
        <Monitor size={16} />
      </button>
      <button 
        onClick={() => setTheme('dark')}
        style={{ 
          height: '2rem', 
          width: '2rem', 
          padding: 0, 
          border: 'none',
          background: theme === 'dark' ? 'var(--background)' : 'transparent',
          boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
        }}
        title="Dark Mode"
      >
        <Moon size={16} />
      </button>
    </div>
  );
};
