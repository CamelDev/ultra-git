import { useState, useEffect } from 'react'

export type ThemeMode = 'night' | 'day' | 'auto'

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('app-theme')
    return (saved as ThemeMode) || 'auto'
  })

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<ThemeMode>) => {
      setThemeState(e.detail)
    }
    window.addEventListener('theme-changed', handleThemeChange as EventListener)
    return () => {
      window.removeEventListener('theme-changed', handleThemeChange as EventListener)
    }
  }, [])

  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        theme === 'night' ||
        (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

      if (isDark) {
        document.documentElement.classList.remove('light-theme')
      } else {
        document.documentElement.classList.add('light-theme')
      }
    }

    updateTheme()

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => updateTheme()
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }

    return undefined
  }, [theme])

  const setTheme = (newTheme: ThemeMode) => {
    localStorage.setItem('app-theme', newTheme)
    setThemeState(newTheme)
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: newTheme }))
  }

  return { theme, setTheme }
}
