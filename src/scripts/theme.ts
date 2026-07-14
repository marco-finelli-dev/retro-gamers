type ThemePreference = 'dark' | 'light' | 'system'
type ResolvedTheme = 'dark' | 'light'
type ThemeLanguage = 'it' | 'en'

const STORAGE_KEY = 'rg-theme'

const getSystemTheme = (): ResolvedTheme => {
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }

  return 'dark'
}

const getStoredPreference = (): ThemePreference => {
  const stored = window.localStorage.getItem(STORAGE_KEY)

  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored
  }

  return 'system'
}

const resolveTheme = (preference: ThemePreference): ResolvedTheme => {
  if (preference === 'system') {
    return getSystemTheme()
  }

  return preference
}

const getThemeIcon = (preference: ThemePreference) => {
  if (preference === 'dark') {
    return '☾'
  }

  if (preference === 'light') {
    return '☀'
  }

  return '◐'
}

const getDocumentLanguage = (): ThemeLanguage =>
  document.documentElement.lang === 'en' ? 'en' : 'it'

const getThemeLabel = (preference: ThemePreference) => {
  const isEnglish = getDocumentLanguage() === 'en'

  if (preference === 'dark') {
    return isEnglish
      ? 'Dark theme active. Click to switch to the light theme.'
      : 'Tema scuro attivo. Clicca per passare al tema chiaro.'
  }

  if (preference === 'light') {
    return isEnglish
      ? 'Light theme active. Click to follow the system settings.'
      : 'Tema chiaro attivo. Clicca per seguire le impostazioni di sistema.'
  }

  return isEnglish
    ? 'Automatic theme active. Click to switch to the dark theme.'
    : 'Tema automatico attivo. Clicca per passare al tema scuro.'
}

const applyTheme = (preference: ThemePreference) => {
  const resolvedTheme = resolveTheme(preference)

  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.dataset.themePreference = preference

  window.localStorage.setItem(STORAGE_KEY, preference)

  document
    .querySelectorAll<HTMLButtonElement>('[data-theme-choice]')
    .forEach((button) => {
      const isActive = button.dataset.themeChoice === preference

      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', String(isActive))
    })

  document
    .querySelectorAll<HTMLElement>('[data-theme-icon]')
    .forEach((icon) => {
      icon.textContent = getThemeIcon(preference)
    })

  document
    .querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')
    .forEach((button) => {
      button.setAttribute('aria-label', getThemeLabel(preference))
      button.setAttribute('title', getThemeLabel(preference))
    })
}

const initTheme = () => {
  const preference = getStoredPreference()

  applyTheme(preference)

  document
    .querySelectorAll<HTMLButtonElement>('[data-theme-choice]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const choice = button.dataset.themeChoice

        if (choice === 'dark' || choice === 'light' || choice === 'system') {
          applyTheme(choice)
        }
      })
    })

  document
    .querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const currentPreference = getStoredPreference()

        const nextPreference: ThemePreference =
          currentPreference === 'dark'
            ? 'light'
            : currentPreference === 'light'
              ? 'system'
              : 'dark'

        applyTheme(nextPreference)
      })
    })

  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => {
      const currentPreference = getStoredPreference()

      if (currentPreference === 'system') {
        applyTheme('system')
      }
    })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme)
} else {
  initTheme()
}
