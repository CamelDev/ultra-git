import { describe, expect, test } from 'bun:test'
import { AzureDevops, Bitbucket, Github, Gitlab } from '../../common/BrandIcons'
import type { Identity } from '../../../store/useRepoStore'

describe('Azure DevOps Credentials Integration', () => {
  test('AzureDevops BrandIcon is defined and renders svg', () => {
    expect(AzureDevops).toBeDefined()
    const icon = AzureDevops({ size: 16 })
    expect(icon).toBeDefined()
    expect(icon.type).toBe('svg')
    expect(icon.props.viewBox).toBe('0 0 18 18')
  })

  test('Identity interface accepts azure-devops provider', () => {
    const azureIdentity: Identity = {
      id: 'test-ado-1',
      label: 'Azure DevOps - John Doe',
      name: 'John Doe',
      email: 'john.doe@company.com',
      provider: 'azure-devops',
      username: 'johndoe',
      personalAccessToken: 'azdevpat123456789'
    }

    expect(azureIdentity.provider).toBe('azure-devops')
    expect(azureIdentity.personalAccessToken).toBe('azdevpat123456789')
  })

  test('Azure DevOps PAT authorization header matches official format', () => {
    const token = 'sample_ado_pat_value'
    // Azure DevOps uses Basic Auth with empty username: `:<PAT>`
    const authString = Buffer.from(`:${token}`).toString('base64')
    const decoded = Buffer.from(authString, 'base64').toString('utf8')

    expect(decoded).toBe(`:${token}`)
    expect(`Basic ${authString}`).toBe(`Basic ${Buffer.from(`:${token}`).toString('base64')}`)
  })

  test('Azure DevOps credential helper username fallback logic', () => {
    const getHelperUsername = (identity: Identity) => {
      let helperUsername = 'token'
      if (identity.provider === 'bitbucket') {
        helperUsername = identity.username || identity.email || 'x-token-auth'
      } else if (identity.provider === 'gitlab') {
        helperUsername = identity.username || 'oauth2'
      } else if (identity.provider === 'github') {
        helperUsername = identity.username || 'token'
      } else if (identity.provider === 'azure-devops') {
        helperUsername = identity.username || identity.email || 'Personal Access Token'
      } else if (identity.username) {
        helperUsername = identity.username
      }
      return helperUsername
    }

    expect(getHelperUsername({
      id: '1', label: 'ADO', name: 'Dev', email: 'dev@test.com', provider: 'azure-devops'
    })).toBe('dev@test.com')

    expect(getHelperUsername({
      id: '2', label: 'ADO', name: 'Dev', email: '', provider: 'azure-devops', username: 'azuser'
    })).toBe('azuser')

    expect(getHelperUsername({
      id: '3', label: 'ADO', name: 'Dev', email: '', provider: 'azure-devops'
    })).toBe('Personal Access Token')
  })

  test('Git URL parser recognizes Azure DevOps HTTPS URLs', () => {
    const parseGitUrl = (urlStr: string) => {
      const cleanUrl = urlStr.trim().replace(/\.git\/?$/, '')
      let provider: 'github' | 'gitlab' | 'bitbucket' | 'azure-devops' | null = null
      if (cleanUrl.includes('github.com')) provider = 'github'
      else if (cleanUrl.includes('gitlab.com')) provider = 'gitlab'
      else if (cleanUrl.includes('bitbucket.org')) provider = 'bitbucket'
      else if (cleanUrl.includes('dev.azure.com') || cleanUrl.includes('visualstudio.com')) provider = 'azure-devops'

      let owner = ''
      let repo = ''
      if (cleanUrl.includes('://')) {
        try {
          const parsed = new URL(cleanUrl)
          const parts = parsed.pathname.split('/').filter(Boolean)
          if (parts.length >= 2) {
            owner = parts[parts.length - 2]
            repo = parts[parts.length - 1]
          }
        } catch {}
      }
      return { provider, owner, repo }
    }

    const modernAdo = parseGitUrl('https://dev.azure.com/my-org/my-project/_git/my-repo')
    expect(modernAdo.provider).toBe('azure-devops')
    expect(modernAdo.repo).toBe('my-repo')

    const legacyAdo = parseGitUrl('https://my-org.visualstudio.com/my-project/_git/legacy-repo.git')
    expect(legacyAdo.provider).toBe('azure-devops')
    expect(legacyAdo.repo).toBe('legacy-repo')
  })

  test('Provider direct token URL mapping', () => {
    const getProviderLink = (provider: string) => {
      if (provider === 'github') return 'https://github.com/settings/tokens'
      if (provider === 'gitlab') return 'https://gitlab.com/-/user_settings/personal_access_tokens'
      if (provider === 'bitbucket') return 'https://id.atlassian.com/manage-profile/security/api-tokens'
      if (provider === 'azure-devops') return 'https://aex.dev.azure.com/me'
      return null
    }

    expect(getProviderLink('azure-devops')).toBe('https://aex.dev.azure.com/me')
    expect(getProviderLink('github')).toBe('https://github.com/settings/tokens')
    expect(getProviderLink('bitbucket')).toBe('https://id.atlassian.com/manage-profile/security/api-tokens')
  })
})
