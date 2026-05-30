import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from '@tanstack/react-router'
import React from 'react'

// Export vault hooks globally for theme components
export function setupVaultCore() {
  ;(window as any).React = React
  ;(window as any).__VaultCore = {
    usePlayer: useAudioPlayer,
    useAuth,
    useNavigate,
  }
}
