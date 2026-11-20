import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { gitService, parseWorktreeListPorcelain } from '../git';

function removeDirSafe(dir: string) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Ignore transient Windows file-handle cleanup errors in temp dir
  }
}

describe('parseWorktreeListPorcelain', () => {
  it('parses main, detached, locked (with/without reason), and prunable worktrees', () => {
    const raw = [
      'worktree C:/DEV/ultra-git',
      'HEAD c49d6f114045efe8cd94b1ea7bec352fa3eeee4b',
      'branch refs/heads/main',
      '',
      'worktree C:/Users/Kamil/orca/workspaces/.orca-preparing/6900-abc',
      'HEAD ec6587eb9fd00fa71721d287b2516d0dab1de546',
      'detached',
      'locked orca-create-preparation:v1:6900',
      '',
      'worktree C:/Users/Kamil/temp/old-wt',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/feature/old',
      'locked',
      'prunable gitdir file points to non-existent location',
      ''
    ].join('\r\n');

    const result = parseWorktreeListPorcelain(raw);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      path: 'C:/DEV/ultra-git',
      branch: 'main',
      hash: 'c49d6f114045efe8cd94b1ea7bec352fa3eeee4b'
    });

    expect(result[1]).toEqual({
      path: 'C:/Users/Kamil/orca/workspaces/.orca-preparing/6900-abc',
      branch: '(detached HEAD)',
      hash: 'ec6587eb9fd00fa71721d287b2516d0dab1de546',
      locked: true,
      lockReason: 'orca-create-preparation:v1:6900'
    });

    expect(result[2]).toEqual({
      path: 'C:/Users/Kamil/temp/old-wt',
      branch: 'feature/old',
      hash: '1111111111111111111111111111111111111111',
      locked: true,
      prunable: true,
      prunableReason: 'gitdir file points to non-existent location'
    });
  });

  it('returns empty array for empty output', () => {
    expect(parseWorktreeListPorcelain('')).toEqual([]);
  });
});

describe('gitService worktree operations', () => {
  const baseTmp = path.join(process.cwd(), '.tmp-test-git-worktrees');
  let baseDir: string;
  let repoDir: string;

  beforeEach(async () => {
    fs.mkdirSync(baseTmp, { recursive: true });
    baseDir = fs.mkdtempSync(path.join(baseTmp, 'run-'));
    repoDir = path.join(baseDir, 'main-repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const git = simpleGit(repoDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n');
    await git.add('README.md');
    await git.commit('Initial commit');
  });

  afterEach(() => {
    removeDirSafe(baseDir);
  });

  afterAll(() => {
    removeDirSafe(baseTmp);
  });

  it('lists locked status and removes a clean worktree without force', async () => {
    const wtClean = path.join(baseDir, 'wt-clean');
    await gitService.addWorktree(repoDir, wtClean, 'feature/clean');

    const before = await gitService.getWorktrees(repoDir);
    expect(before).toHaveLength(2);
    expect(before[1].branch).toBe('feature/clean');
    expect(before[1].locked).toBeUndefined();

    await gitService.removeWorktree(repoDir, wtClean, false);

    const after = await gitService.getWorktrees(repoDir);
    expect(after).toHaveLength(1);
    expect(fs.existsSync(wtClean)).toBe(false);
  });

  it('fails without force on a dirty worktree and succeeds with force=true', async () => {
    const wtDirty = path.join(baseDir, 'wt-dirty');
    await gitService.addWorktree(repoDir, wtDirty, 'feature/dirty');
    fs.writeFileSync(path.join(wtDirty, 'untracked.txt'), 'dirty');

    await expect(gitService.removeWorktree(repoDir, wtDirty, false)).rejects.toThrow();

    await gitService.removeWorktree(repoDir, wtDirty, true);

    const after = await gitService.getWorktrees(repoDir);
    expect(after).toHaveLength(1);
    expect(fs.existsSync(wtDirty)).toBe(false);
  });

  it('detects locked worktree, fails without force, and removes it with force=true', async () => {
    const wtLocked = path.join(baseDir, 'wt-locked');
    await gitService.addWorktree(repoDir, wtLocked, 'feature/locked');

    const git = simpleGit(repoDir);
    await git.raw(['worktree', 'lock', '--reason', 'orca-create-preparation:v1', wtLocked]);

    const listed = await gitService.getWorktrees(repoDir);
    const lockedEntry = listed.find((w) => w.branch === 'feature/locked');
    expect(lockedEntry?.locked).toBe(true);
    expect(lockedEntry?.lockReason).toBe('orca-create-preparation:v1');

    await expect(gitService.removeWorktree(repoDir, wtLocked, false)).rejects.toThrow();

    await gitService.removeWorktree(repoDir, wtLocked, true);

    const after = await gitService.getWorktrees(repoDir);
    expect(after).toHaveLength(1);
    expect(fs.existsSync(wtLocked)).toBe(false);
  });

  it('force-removes a locked worktree whose directory was already deleted on disk', async () => {
    const wtMissing = path.join(baseDir, 'wt-missing');
    await gitService.addWorktree(repoDir, wtMissing, 'feature/missing');

    const git = simpleGit(repoDir);
    await git.raw(['worktree', 'lock', '--reason', 'stale-lock', wtMissing]);
    removeDirSafe(wtMissing);
    expect(fs.existsSync(wtMissing)).toBe(false);

    const listed = await gitService.getWorktrees(repoDir);
    const missingEntry = listed.find((w) => w.branch === 'feature/missing');
    expect(missingEntry?.locked).toBe(true);

    await gitService.removeWorktree(repoDir, wtMissing, true);

    const after = await gitService.getWorktrees(repoDir);
    expect(after).toHaveLength(1);
  });
});
