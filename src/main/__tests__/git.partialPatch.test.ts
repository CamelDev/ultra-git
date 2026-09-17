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
})
