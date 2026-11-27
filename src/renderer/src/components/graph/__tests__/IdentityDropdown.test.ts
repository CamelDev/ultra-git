import { describe, expect, it } from 'bun:test'
import { getIdentityButtonDisplay, getProviderAcronym } from '../IdentityDropdown'
import type { Identity } from '../../../store/useRepoStore'

describe('IdentityDropdown helpers', () => {
  describe('getProviderAcronym', () => {
    it('maps each git provider to its compact acronym', () => {
      expect(getProviderAcronym('github')).toBe('GH')
      expect(getProviderAcronym('bitbucket')).toBe('BB')
      expect(getProviderAcronym('azure-devops')).toBe('AD')
      expect(getProviderAcronym('gitlab')).toBe('GL')
      expect(getProviderAcronym('custom')).toBe('SYS')
      expect(getProviderAcronym(undefined)).toBe('SYS')
    })
  })

  describe('getIdentityButtonDisplay', () => {
    it('formats system default when no identity is active', () => {
      const display = getIdentityButtonDisplay(undefined)
      expect(display.label).toBe('Default')
      expect(display.acronym).toBe('SYS')
      expect(display.formatted).toBe('Default (SYS)')
      expect(display.tooltip).toBe('Identity: None (system default)')
    })

    it('formats active identity with provider acronym and rich tooltip', () => {
      const githubIdentity: Identity = {
        id: 'id-gh',
        label: 'CamelDev',
        name: 'InTheLoop.pro',
        email: 'human@intheloop.pro',
        provider: 'github'
      }
      const display = getIdentityButtonDisplay(githubIdentity)
      expect(display.label).toBe('CamelDev')
      expect(display.acronym).toBe('GH')
      expect(display.formatted).toBe('CamelDev (GH)')
      expect(display.tooltip).toBe('Identity: CamelDev (InTheLoop.pro <human@intheloop.pro>)')
    })

    it('falls back to identity name when label is blank', () => {
      const azureIdentity: Identity = {
        id: 'id-ad',
        label: '   ',
        name: 'Enterprise User',
        email: 'user@corp.com',
        provider: 'azure-devops'
      }
      const display = getIdentityButtonDisplay(azureIdentity)
      expect(display.label).toBe('Enterprise User')
      expect(display.acronym).toBe('AD')
      expect(display.formatted).toBe('Enterprise User (AD)')
    })

    it('formats Bitbucket identity with BB acronym', () => {
      const bbIdentity: Identity = {
        id: 'id-bb',
        label: 'Bitbucket - bb_camel',
        name: 'Bitbucket Camel',
        email: 'bb@example.com',
        provider: 'bitbucket'
      }
      const display = getIdentityButtonDisplay(bbIdentity)
      expect(display.acronym).toBe('BB')
      expect(display.formatted).toBe('Bitbucket - bb_camel (BB)')
    })
  })
})
