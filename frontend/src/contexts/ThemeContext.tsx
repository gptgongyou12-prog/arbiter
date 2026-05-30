import React, { createContext, useContext, useEffect, useState } from 'react'

export interface ThemeData {
  meta?: { name: string; type?: 'skin' | 'layout' }
  branding?: { siteName?: string; logoFile?: string; faviconFile?: string }
  colors?: Record<string, string>
  shape?: Record<string, string>
  typography?: { fontSans?: string; fontMono?: string }
  effects?: { bgPattern?: string; bgPatternOpacity?: number }
  _hasLayouts?: Record<string, boolean>
  _hasIcons?: boolean
}

interface ThemeContextValue {
  theme: ThemeData | null
  assetUrl: (file: string) => string
  reload: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: null,
  assetUrl: () => '',
  reload: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeData | null>(null)
  const assetUrl = (file: string) => `/api/theme/asset/${file}`

  const loadTheme = async () => {
    try {
      const res = await fetch('/api/theme')
      const data = await res.json()
      if (data?.meta) {
        setTheme(data)
        applyTheme(data)
      } else {
        setTheme(null)
        removeThemeOverrides()
      }
    } catch {}
  }

  useEffect(() => { loadTheme() }, [])

  return (
    <ThemeContext.Provider value={{ theme, assetUrl, reload: loadTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

function removeThemeOverrides() {
  const el = document.getElementById('vault-theme-overrides')
  if (el) el.remove()
}

function applyTheme(theme: ThemeData) {
  const root = document.documentElement
  const c = theme.colors || {}

  // CSS 변수 업데이트
  const varMap: Record<string, string> = {
    '--bg-0': c.bg0 || '',
    '--bg-1': c.bg1 || '',
    '--bg-2': c.bg2 || '',
    '--bg-3': c.bg3 || '',
    '--bg-4': c.bg4 || '',
    '--text-0': c.text0 || '',
    '--text-1': c.text1 || '',
    '--text-2': c.text2 || '',
    '--muted-0': c.muted0 || '',
    '--muted-1': c.muted1 || '',
    '--muted-2': c.muted2 || '',
    '--border-0': c.border0 || '',
    '--accent-blue': c.accentBlue || '',
    '--accent-green': c.accentGreen || '',
    '--card-gradient-from': c.cardGradientFrom || '',
    '--card-gradient-to': c.cardGradientTo || '',
  }
  for (const [k, v] of Object.entries(varMap)) {
    if (v) root.style.setProperty(k, v)
  }

  // shape
  if (theme.shape?.cardRadius) root.style.setProperty('--card-border-radius', theme.shape.cardRadius)
  if (theme.shape?.buttonRadius) root.style.setProperty('--button-radius', theme.shape.buttonRadius)

  // Tailwind 하드코딩 hex 오버라이드
  const hexMap: Record<string, string | undefined> = {
    '181818': c.bg0, '161616': c.bg0,
    '191919': c.bg1, '1e1e1e': c.bg1,
    '201f1f': c.bg2,
    '232323': c.bg3,
    '262626': c.bg4,
    '353333': c.border0,
    '919191': c.text1, '9f9f9f': c.text1,
    '7c7c7c': c.text2,
    '848484': c.muted0,
    '0099bb': c.accentBlue,
    '007a94': c.accentBlue,
  }

  let css = ''
  for (const [hex, val] of Object.entries(hexMap)) {
    if (!val) continue
    const e = hex
    css += `.bg-\\[\#${e}\\]{background-color:${val}!important}\n`
    css += `.bg-\\[\#${e}\\\/\\d+\\]{background-color:${val}!important}\n`
    css += `.border-\\[\#${e}\\]{border-color:${val}!important}\n`
    css += `.text-\\[\#${e}\\]{color:${val}!important}\n`
    css += `.from-\\[\#${e}\\]{--tw-gradient-from:${val}!important}\n`
    css += `.to-\\[\#${e}\\]{--tw-gradient-to:${val}!important}\n`
    css += `.hover\\:bg-\\[\#${e}\\]:hover{background-color:${val}!important}\n`
  }

  if (c.bg0) css += `body{background-color:${c.bg0}!important}\n`

  let el = document.getElementById('vault-theme-overrides')
  if (!el) {
    el = document.createElement('style')
    el.id = 'vault-theme-overrides'
    document.head.appendChild(el)
  }
  el.textContent = css

  // 폰트 로드
  if (theme.typography?.fontSans && theme.typography.fontSans !== 'Overused Grotesk') {
    const font = theme.typography.fontSans
    const existing = document.querySelector(`link[href*="${encodeURIComponent(font)}"]`)
    if (!existing) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
    document.body.style.fontFamily = `'${font}', sans-serif`
  }

  // 파비콘
  if (theme.branding?.faviconFile) {
    const link: HTMLLinkElement = document.querySelector('link[rel="icon"]') || document.createElement('link')
    link.rel = 'icon'
    link.href = `/api/theme/asset/${theme.branding.faviconFile}`
    if (!document.head.contains(link)) document.head.appendChild(link)
  }
}
