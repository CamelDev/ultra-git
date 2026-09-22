import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import simpleGit from 'simple-git'
import { partialPatchService, PartialPatchError } from '../partialPatchService'

describe('ordinary partial patch transactions', () => {
  let repo = ''
  beforeEach(async () => {
    const root = path.join(process.cwd(), '.tmp-test-git-partial')
    fs.mkdirSync(root, { recursive: true }); repo = fs.mkdtempSync(path.join(root, 'case-'))
    const git = simpleGit(repo); await git.init(); await git.addConfig('user.name', 'Test'); await git.addConfig('user.email', 'test@example.com')
    fs.writeFileSync(path.join(repo, 'file.txt'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n')
    await git.add('file.txt'); await git.commit('initial')
  })
  afterEach(() => { if (repo && fs.existsSync(repo)) fs.rmSync(repo, { recursive: true, force: true }) })

  test('stages the exact selected hunk and supports Undo/Redo', async () => {
    const file = path.join(repo, 'file.txt'); fs.writeFileSync(file, 'one changed\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven changed\ntwelve\n')
    const diff = await partialPatchService.getPartialDiff(repo, 'file.txt', 'stage')
    expect(diff.hunks.length).toBe(2)
    const first = diff.hunks[0]
    const tx = await partialPatchService.apply(repo, 'stage', [{ path: 'file.txt', hunkId: first.id, generation: diff.generation }], diff.generation)
    expect((await simpleGit(repo).diff(['--cached']))).toContain('one changed')
    expect((await simpleGit(repo).diff(['--cached']))).not.toContain('five changed')
    await partialPatchService.undo(tx.transactionId)
    expect((await simpleGit(repo).diff(['--cached']))).toBe('')
    await partialPatchService.redo(tx.transactionId)
    expect((await simpleGit(repo).diff(['--cached']))).toContain('one changed')
  })

  test('rejects stale selections without mutation', async () => {
    const file = path.join(repo, 'file.txt'); fs.writeFileSync(file, 'one changed\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n')
    const diff = await partialPatchService.getPartialDiff(repo, 'file.txt', 'stage')
    fs.writeFileSync(file, 'one changed again\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n')
    await expect(partialPatchService.apply(repo, 'stage', [{ path: 'file.txt', hunkId: diff.hunks[0].id, generation: diff.generation }], diff.generation)).rejects.toBeInstanceOf(PartialPatchError)
    expect((await simpleGit(repo).diff(['--cached']))).toBe('')
  })

  test('stages only selected changed lines using canonical line identities', async () => {
    const file = path.join(repo, 'file.txt'); fs.writeFileSync(file, 'one changed\ntwo\nthree changed\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n')
    const diff = await partialPatchService.getPartialDiff(repo, 'file.txt', 'stage')
    const hunk = diff.hunks[0]
    const changed = hunk.lines.findIndex(line => line.startsWith('+'))
    expect(changed).toBeGreaterThanOrEqual(0)
    const tx = await partialPatchService.apply(repo, 'stage', [{ path: 'file.txt', hunkId: hunk.id, lineIds: [hunk.lineIds![changed]], generation: diff.generation }], diff.generation)
    const staged = await simpleGit(repo).diff(['--cached'])
    expect(staged).toContain('+one changed')
    expect(staged).not.toContain('+three changed')
    await partialPatchService.undo(tx.transactionId)
  })

  test('stages the final hunk in a multi-hunk file without trailing empty line corruption', async () => {
    const file = path.join(repo, 'file.txt')
    fs.writeFileSync(file, 'one changed\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven changed\ntwelve\n')
    const diff = await partialPatchService.getPartialDiff(repo, 'file.txt', 'stage')
    expect(diff.hunks.length).toBe(2)
    const lastHunk = diff.hunks[1]
    // The last hunk must not end with an invalid empty string line
    expect(lastHunk.lines[lastHunk.lines.length - 1]).not.toBe('')
    const tx = await partialPatchService.apply(repo, 'stage', [{ path: 'file.txt', hunkId: lastHunk.id, generation: diff.generation }], diff.generation)
    const staged = await simpleGit(repo).diff(['--cached'])
    expect(staged).toContain('eleven changed')
    expect(staged).not.toContain('one changed')
    await partialPatchService.undo(tx.transactionId)
    expect((await simpleGit(repo).diff(['--cached']))).toBe('')
  })

  test('stages a single hunk in a YAML file matching production failure scenario', async () => {
    const yamlPath = path.join(repo, 'values.yaml')
    const beforeYaml = [
      'api2suite:',
      '  replicaCount: 2',
      '  image:',
      '    repository: app/test',
      '    pullPolicy: Always',
      '',
      'basicAuth:',
      '  authServiceUrl: "https://auth-staging.example.com"',
      '',
      'oauth2Proxy:',
      '  enabled: false',
      '  redirectUrl: https://app.example.com/oauth2/callback',
      '',
      'flightApi:',
      '  port: 8080'
    ].join('\n') + '\n'

    const afterYaml = [
      'api2suite:',
      '  replicaCount: 2',
      '  image:',
      '    repository: app/test',
      '    pullPolicy: Always',
      '',
      '# Added comment explaining auth gate',
      'basicAuth:',
      '  authServiceUrl: ""',
      '',
      '# New configuration for OAuth proxy',
      'oauth2Proxy:',
      '  enabled: true',
      '  clientId: "test-client-id-12345"',
      '  redirectUrl: https://app.example.com/oauth2/callback',
      '',
      'flightApi:',
      '  port: 8080'
    ].join('\n') + '\n'

    fs.writeFileSync(yamlPath, beforeYaml)
    const git = simpleGit(repo)
    await git.add('values.yaml')
    await git.commit('initial yaml')

    fs.writeFileSync(yamlPath, afterYaml)
    const diff = await partialPatchService.getPartialDiff(repo, 'values.yaml', 'stage')
    expect(diff.hunks.length).toBe(1)
    const hunk = diff.hunks[0]
    expect(hunk.lines[hunk.lines.length - 1]).not.toBe('')

    // Stage the hunk
    const tx = await partialPatchService.apply(repo, 'stage', [{ path: 'values.yaml', hunkId: hunk.id, generation: diff.generation }], diff.generation)
    const staged = await git.diff(['--cached'])
    expect(staged).toContain('+  enabled: true')
    expect(staged).toContain('+  clientId: "test-client-id-12345"')

    // Unstage the hunk
    const unstageDiff = await partialPatchService.getPartialDiff(repo, 'values.yaml', 'unstage')
    await partialPatchService.apply(repo, 'unstage', [{ path: 'values.yaml', hunkId: unstageDiff.hunks[0].id, generation: unstageDiff.generation }], unstageDiff.generation)
    expect(await git.diff(['--cached'])).toBe('')
  })

  test('stages hunks in CRLF formatted files', async () => {
    const crlfPath = path.join(repo, 'crlf.txt')
    fs.writeFileSync(crlfPath, 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n')
    const git = simpleGit(repo)
    await git.add('crlf.txt')
    await git.commit('crlf initial')

    fs.writeFileSync(crlfPath, 'line 1\r\nline 2 mod\r\nline 3\r\nline 4 mod\r\nline 5\r\n')
    const diff = await partialPatchService.getPartialDiff(repo, 'crlf.txt', 'stage')
    expect(diff.hunks.length).toBe(1)
    const tx = await partialPatchService.apply(repo, 'stage', [{ path: 'crlf.txt', hunkId: diff.hunks[0].id, generation: diff.generation }], diff.generation)
    const staged = await git.diff(['--cached'])
    expect(staged).toContain('line 2 mod')
    await partialPatchService.undo(tx.transactionId)
  })

  test('stages hunks in files without trailing newline at EOF', async () => {
    const eofPath = path.join(repo, 'eof.txt')
    fs.writeFileSync(eofPath, 'first\nsecond')
    const git = simpleGit(repo)
    await git.add('eof.txt')
    await git.commit('eof initial')

    fs.writeFileSync(eofPath, 'first\nsecond modified')
    const diff = await partialPatchService.getPartialDiff(repo, 'eof.txt', 'stage')
    expect(diff.hunks.length).toBe(1)
    const tx = await partialPatchService.apply(repo, 'stage', [{ path: 'eof.txt', hunkId: diff.hunks[0].id, generation: diff.generation }], diff.generation)
    const staged = await git.diff(['--cached'])
    expect(staged).toContain('+second modified')
    await partialPatchService.undo(tx.transactionId)
  })
})

