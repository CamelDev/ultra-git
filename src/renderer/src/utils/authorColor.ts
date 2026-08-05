import React from 'react'

/**
 * Utility to calculate a deterministic color badge style for a commit author
 * based on author email or name hash.
 * Supports CSS variables so themes (night/day) adapt automatically.
 */

export interface AuthorBadgeStyle extends React.CSSProperties {
  backgroundColor: string
  borderColor: string
  color: string
}

export const getAuthorColor = (name?: string, email?: string): AuthorBadgeStyle => {
  const str = (email || name || 'unknown').toLowerCase().trim()
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    '--author-hue': `${hue}`,
    backgroundColor: `var(--author-bg, hsla(${hue}, 50%, 35%, 0.22))`,
    borderColor: `var(--author-border, hsla(${hue}, 50%, 50%, 0.35))`,
    color: `var(--author-text, hsl(${hue}, 75%, 82%))`
  } as AuthorBadgeStyle
}
