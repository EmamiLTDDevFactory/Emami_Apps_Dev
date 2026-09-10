import { createContext, useContext, useEffect, useState } from 'react'

const THEME_KEY = 'timesheet-theme-v1'

export const THEMES = [
  { id: 'midnight', label: 'Midnight', icon: '🌙', description: 'Dark background, colorful accents' },
  { id: 'minimal', label: 'Minimal', icon: '⚪', description: 'Clean, a single accent everywhere' },
]

const ThemeContext = createContext(null)

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (THEMES.some((t) => t.id === saved)) return saved
  } catch {
    // fall through to default
  }
  return 'minimal'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(loadTheme)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore persistence failures (e.g. private browsing)
    }
    document.documentElement.classList.toggle('dark', theme === 'midnight')
    document.documentElement.dataset.theme = theme
  }, [theme])

  const value = { theme, setTheme, isMinimal: theme === 'minimal', isMidnight: theme === 'midnight' }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
