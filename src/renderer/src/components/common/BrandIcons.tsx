import React from 'react'

export interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
}

export const Github: React.FC<BrandIconProps> = ({ size = 16, style, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
)

export const Gitlab: React.FC<BrandIconProps> = ({ size = 16, style, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}
    {...props}
  >
    <path d="m22 13.29-1.33-4.11a1.27 1.27 0 0 0-2.4 0L17 13.29" />
    <path d="M2 13.29l1.33-4.11a1.27 1.27 0 0 1 2.4 0L7 13.29" />
    <path d="m12 21 10-7.71L20.67 9.18a1.27 1.27 0 0 0-2.4 0L17 13.29H7L5.73 9.18a1.27 1.27 0 0 0-2.4 0L2 13.29 12 21z" />
  </svg>
)

export const Bitbucket: React.FC<BrandIconProps> = ({ size = 16, style, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    style={{ flexShrink: 0, ...style }}
    {...props}
  >
    <path d="M22.3 3.4c-.2-.4-.6-.7-1-.7H2.7c-.5 0-.9.3-1 .7L.1 19.3c-.1.5.1 1 .5 1.3.3.3.7.4 1.1.4h18.6c.4 0 .8-.2 1-.6l2.1-15.6c.1-.5-.1-1-.4-1.4zM15.4 15H8.6l-1-6.8h8.8l-1 6.8z" />
  </svg>
)
