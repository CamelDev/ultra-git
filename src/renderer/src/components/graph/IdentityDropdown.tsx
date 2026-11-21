import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Settings } from 'lucide-react'
import type { Identity } from '../../store/useRepoStore'

export type IdentityProviderAcronym = 'SYS' | 'GH' | 'BB' | 'AD' | 'GL'

export function getProviderAcronym(provider?: Identity['provider']): IdentityProviderAcronym {
  switch (provider) {
    case 'github':
      return 'GH'
    case 'bitbucket':
      return 'BB'
    case 'azure-devops':
      return 'AD'
    case 'gitlab':
      return 'GL'
    case 'custom':
    default:
      return 'SYS'
  }
}

export interface IdentityButtonDisplay {
  label: string
  acronym: IdentityProviderAcronym
  formatted: string
  tooltip: string
}

export function getIdentityButtonDisplay(
  activeIdentity: Identity | undefined,
  isRequiredWarning = false
): IdentityButtonDisplay {
  if (!activeIdentity) {
    const label = 'Default'
    const acronym: IdentityProviderAcronym = 'SYS'
    return {
      label,
      acronym,
      formatted: `${label} (${acronym})`,
      tooltip: isRequiredWarning
        ? 'Identity required — select a Git identity'
        : 'Identity: None (system default)'
    }
  }

  const label = activeIdentity.label?.trim() || activeIdentity.name?.trim() || 'Identity'
  const acronym = getProviderAcronym(activeIdentity.provider)
  const details = activeIdentity.email
    ? `${activeIdentity.name} <${activeIdentity.email}>`
    : activeIdentity.name

  return {
    label,
    acronym,
    formatted: `${label} (${acronym})`,
    tooltip: details ? `Identity: ${label} (${details})` : `Identity: ${label}`
  }
}

export interface IdentityDropdownProps {
  identities: Identity[]
  activeIdentityId?: string
  onSelectIdentity: (identityId: string | undefined) => void
  onManageIdentities: () => void
}

export const IdentityDropdown: React.FC<IdentityDropdownProps> = ({
  identities,
  activeIdentityId,
  onSelectIdentity,
  onManageIdentities
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeIdentity = activeIdentityId
    ? identities.find((id) => id.id === activeIdentityId)
    : undefined
  const isRequiredWarning = !activeIdentity && identities.length > 1
  const display = getIdentityButtonDisplay(activeIdentity, isRequiredWarning)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (identityId: string | undefined) => {
    setIsOpen(false)
    onSelectIdentity(identityId)
  }

  const handleOpenSettings = () => {
    setIsOpen(false)
    onManageIdentities()
  }

  return (
    <div ref={containerRef} className="identity-dropdown-container">
      <button
        type="button"
        className={`identity-dropdown-trigger${isRequiredWarning ? ' is-warning' : ''}${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-testid="repo-identity-select"
        data-selected-identity={activeIdentity?.id || ''}
        data-provider-acronym={display.acronym}
        data-tooltip={display.tooltip}
      >
        {isRequiredWarning && (
          <span
            className="identity-dropdown-warning-dot"
            data-testid="identity-warning-badge"
            aria-label="Identity selection required"
          >
            *
          </span>
        )}
        <span className="identity-dropdown-label" data-testid="repo-identity-label">
          {display.label}
        </span>
        <span className="identity-dropdown-acronym" data-testid="repo-identity-acronym">
          ({display.acronym})
        </span>
        <ChevronDown
          size={12}
          className={`identity-dropdown-chevron${isOpen ? ' is-open' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="identity-dropdown-menu"
          role="listbox"
          aria-label="Git Identities"
          data-testid="repo-identity-menu"
        >
          <div className="identity-dropdown-header">
            <span className="identity-dropdown-header-title">
              Identity{isRequiredWarning ? ' · Required' : ''}
            </span>
            <button
              type="button"
              className="identity-dropdown-cog-btn"
              onClick={handleOpenSettings}
              data-testid="log-manage-identities-btn"
              data-tooltip="Manage Git Identities"
              aria-label="Manage Git Identities"
            >
              <Settings size={13} />
            </button>
          </div>

          <div className="identity-dropdown-list">
            <button
              type="button"
              role="option"
              aria-selected={!activeIdentity}
              className={`identity-dropdown-option dropdown-item-hover${!activeIdentity ? ' is-selected' : ''}`}
              onClick={() => handleSelect(undefined)}
              data-testid="identity-option-none"
            >
              <div className="identity-dropdown-option-main">
                <span className="identity-dropdown-option-name">None (system default)</span>
                <span className="identity-dropdown-option-badge">SYS</span>
              </div>
              {!activeIdentity && <Check size={12} className="identity-dropdown-check" />}
            </button>

            {identities.map((identity) => {
              const isSelected = activeIdentity?.id === identity.id
              const acronym = getProviderAcronym(identity.provider)
              return (
                <button
                  key={identity.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`identity-dropdown-option dropdown-item-hover${isSelected ? ' is-selected' : ''}`}
                  onClick={() => handleSelect(identity.id)}
                  data-testid={`identity-option-${identity.id}`}
                  data-identity-label={identity.label}
                >
                  <div className="identity-dropdown-option-content">
                    <div className="identity-dropdown-option-main">
                      <span className="identity-dropdown-option-name">{identity.label}</span>
                      <span className="identity-dropdown-option-badge">{acronym}</span>
                    </div>
                    {(identity.name || identity.email) && (
                      <span className="identity-dropdown-option-sub">
                        {identity.name}
                        {identity.email ? ` · ${identity.email}` : ''}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={12} className="identity-dropdown-check" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
