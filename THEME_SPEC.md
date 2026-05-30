# Vault Theme System

Create custom themes by uploading a `.vaulttheme` file (ZIP archive) from the admin profile page.

## File Structure

```
mytheme.vaulttheme (ZIP)
├── theme.json
├── logo.svg              (optional)
├── favicon.svg           (optional)
├── bg.svg                (optional - background pattern)
├── icons/                (optional - custom icons)
│   ├── play.svg
│   ├── pause.svg
│   └── ...
└── layouts/              (optional - custom React components)
    ├── Shell.jsx         (app container)
    ├── Player.jsx        (music player)
    └── Sidebar.jsx       (navigation)
```

## theme.json Format

```json
{
  "meta": {
    "name": "Theme Name",
    "author": "Your Name",
    "description": "Short description",
    "type": "skin"  // or "layout" for custom layouts
  },
  "branding": {
    "siteName": "myapp",
    "logoFile": "logo.svg",
    "faviconFile": "favicon.svg"
  },
  "colors": {
    "bg0": "#181818",
    "bg1": "#191919",
    "bg2": "#201f1f",
    "bg3": "#232323",
    "bg4": "#262626",
    "text0": "#ffffff",
    "text1": "#919191",
    "text2": "#7c7c7c",
    "muted0": "#848484",
    "muted1": "#7b7b7b",
    "muted2": "#383838",
    "border0": "#353333",
    "accentBlue": "#0099bb",
    "accentGreen": "#00ff6a",
    "success0": "#23bd63",
    "success1": "#044221",
    "danger0": "#fe9797",
    "danger1": "#b93e3e",
    "cardGradientFrom": "#262626",
    "cardGradientTo": "#201f1f",
    "buttonBorder": "#353333",
    "buttonGradientFrom": "#353333",
    "buttonGradientTo": "#1d1d1d"
  },
  "shape": {
    "cardRadius": "24px",
    "innerCardRadius": "21px",
    "buttonRadius": "16px"
  },
  "typography": {
    "fontSans": "Pretendard",
    "fontMono": "JetBrains Mono"
  },
  "effects": {
    "bgPattern": "bg.svg",
    "bgPatternOpacity": 0.06
  }
}
```

## Colors Reference

- `bg0-bg4`: Background colors (0=main, 1-4=variants)
- `text0-2`: Text colors (0=primary, 1=secondary, 2=muted)
- `muted0-2`: Muted/disabled colors
- `border0`: Border color
- `accentBlue`: Primary accent (buttons, highlights)
- `accentGreen`: Secondary accent
- `success0/1`: Success states
- `danger0/1`: Danger/error states
- `cardGradientFrom/To`: Card background gradient
- `buttonBorder`: Button border color
- `buttonGradientFrom/To`: Button background gradient

## Layout Components (Optional)

For completely custom layouts, provide React components in `layouts/`:

### Shell.jsx
```jsx
import React from 'react'
const { useAuth } = window.__VaultCore

export default function Shell({ children }) {
  const { user } = useAuth()
  return (
    <div className="app-container">
      {/* Your custom layout */}
      {children}
    </div>
  )
}
```

### Player.jsx
```jsx
import React from 'react'
const { usePlayer } = window.__VaultCore

export default function Player() {
  const { currentTrack, isPlaying, play, pause } = usePlayer()
  return (
    <div className="custom-player">
      {/* Your custom player */}
    </div>
  )
}
```

### Sidebar.jsx
```jsx
export default function Sidebar() {
  // Your custom navigation
}
```

## Available Hooks

In layout components, access vault features via `window.__VaultCore`:

- `usePlayer()` - Audio playback control
- `useAuth()` - User authentication
- `useNavigate()` - Router navigation

### usePlayer()
```javascript
const {
  currentTrack,      // Current playing track
  isPlaying,         // Boolean
  duration,          // Milliseconds
  position,          // Current position
  play,              // () => void
  pause,             // () => void
  seek,              // (ms) => void
  next,              // () => void
  prev,              // () => void
} = usePlayer()
```

### useAuth()
```javascript
const {
  user,              // User object or null
  isAuthenticated,   // Boolean
  logout,            // () => void
} = useAuth()
```

## Examples

See the Claude Vault Theme Generator for ready-to-use themes and creation tools.

Upload themes in **Profile → Theme** (admin only).
