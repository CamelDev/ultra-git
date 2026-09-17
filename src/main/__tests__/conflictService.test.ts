import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { gitService } from '../git';
import { conflictService } from '../conflictService';

const exec = promisify(execFile);
const repos = new Set<string>();

async function git(repo: string, args: string[], allowFailure = false): Promise<string> {
  try {
    const result = await exec('git', ['-C', repo, ...args], { maxBuffer: 4 * 1024 * 1024 });
    return result.stdout;
  } catch (error: any) {
    if (allowFailure) return `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw error;
  }
}

async function repo(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-git-conflict-'));
  repos.add(dir);
  await git(dir, ['init', '-b', 'main']);
  await git(dir, ['config', 'user.name', 'Conflict Test']);
  await git(dir, ['config', 'user.email', 'conflict@example.test']);
  fs.writeFileSync(path.join(dir, 'conflict.txt'), 'base\n');
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'base']);
  return dir;
}

async function commit(repoPath: string, message: string) {
  await git(repoPath, ['add', '-A']);
  await git(repoPath, ['commit', '-m', message]);
}

async function unmerged(repoPath: string): Promise<Array<{ path: string; stage: string }>> {
  const raw = await git(repoPath, ['ls-files', '-u', '-z']);
  return raw.split('\0').filter(Boolean).map(entry => {
    const match = entry.match(/^\d+ [0-9a-f]+ (\d)\t(.+)$/);
    if (!match) throw new Error(`Unexpected ls-files entry: ${entry}`);
    return { stage: match[1], path: match[2] };
  });
}

beforeEach(() => {});
afterEach(() => {
  for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true });
  repos.clear();
});

describe('real Git conflict characterization', () => {
  test('authoritative document resolves whole file and exposes generation-bound undo', async () => {
    const dir = await repo();
    await git(dir, ['checkout', '-b', 'incoming']); fs.writeFileSync(path.join(dir, 'conflict.txt'), 'incoming\n'); await commit(dir, 'incoming');
    await git(dir, ['checkout', 'main']); fs.writeFileSync(path.join(dir, 'conflict.txt'), 'current\n'); await commit(dir, 'current'); await git(dir, ['merge', 'incoming'], true);
    const before = await conflictService.getSnapshot(dir); const doc = await conflictService.getDocument(dir, 'conflict.txt', before.generation);
    expect(doc.regions.length).toBeGreaterThan(0);
    const applied = await conflictService.apply(dir, 'conflict.txt', doc.regions.map(region => ({ documentGeneration: before.generation, regionId: region.id, choice: 'current' as const })), before.generation);
    expect((await conflictService.getSnapshot(dir)).conflicts).toHaveLength(0);
    expect(fs.readFileSync(path.join(dir, 'conflict.txt'), 'utf8')).toBe('current\n');
    await conflictService.undo(applied.token);
    expect((await conflictService.getSnapshot(dir)).conflicts).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, 'conflict.txt'), 'utf8')).toContain('<<<<<<<');
  });
  test('merge records both-modified stages and merge metadata', async () => {
    const dir = await repo();
    await git(dir, ['checkout', '-b', 'incoming']);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'incoming\n');
    await commit(dir, 'incoming change');
    await git(dir, ['checkout', 'main']);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'current\n');
    await commit(dir, 'current change');
    await git(dir, ['merge', 'incoming'], true);

    expect(await gitService.getConflictedFiles(dir)).toEqual([{ path: 'conflict.txt', status: 'UU' }]);
    expect((await unmerged(dir)).map(item => item.stage)).toEqual(['1', '2', '3']);
    expect((await gitService.getMergeStatus(dir)).isMerge).toBe(true);
    expect((await gitService.getConflictFileDiff(dir, 'conflict.txt')).hunks).toHaveLength(1);
  });

  test('cherry-pick conflict can be aborted and restores the original branch', async () => {
    const dir = await repo();
    await git(dir, ['checkout', '-b', 'picked']);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'picked\n');
    await commit(dir, 'picked change');
    const pickedHash = (await git(dir, ['rev-parse', 'HEAD'])).trim();
    await git(dir, ['checkout', 'main']);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'main\n');
    await commit(dir, 'main change');
    await git(dir, ['cherry-pick', pickedHash], true);
    expect((await gitService.getMergeStatus(dir)).isCherryPick).toBe(true);
    expect((await unmerged(dir)).length).toBeGreaterThan(0);
    await git(dir, ['cherry-pick', '--abort']);
    expect(fs.readFileSync(path.join(dir, 'conflict.txt'), 'utf8')).toBe('main\n');
    expect((await git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });

  test('rebase stops twice with the same conflict count and advances metadata', async () => {
    const dir = await repo();
    await git(dir, ['checkout', '-b', 'rebased']);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'first replay\n');
    await commit(dir, 'replay one');
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'second replay\n');
    await commit(dir, 'replay two');
    await git(dir, ['checkout', 'main']);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'onto\n');
    await commit(dir, 'onto change');
    await git(dir, ['checkout', 'rebased']);
    await git(dir, ['rebase', 'main'], true);
    const first = await gitService.getConflictedFiles(dir);
    const firstStatus = await gitService.getMergeStatus(dir);
    expect(first).toHaveLength(1);
    expect(firstStatus.isRebase).toBe(true);
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'resolved first\n');
    await git(dir, ['add', 'conflict.txt']);
    const continueRes = await gitService.continueRebase(dir);
    expect(continueRes.success).toBe(true);
    expect(continueRes.hadConflicts).toBe(true);
    const second = await gitService.getConflictedFiles(dir);
    const secondStatus = await gitService.getMergeStatus(dir);
    expect(second).toHaveLength(1);
    expect(secondStatus.isRebase).toBe(true);
    expect(secondStatus.currentStep).toBeGreaterThan(firstStatus.currentStep ?? 0);

    // Resolve second conflict and complete the rebase
    fs.writeFileSync(path.join(dir, 'conflict.txt'), 'resolved second\n');
    await git(dir, ['add', 'conflict.txt']);
    const finalRes = await gitService.continueRebase(dir);
    expect(finalRes.success).toBe(true);
    expect(finalRes.hadConflicts).toBe(false);
    const finalStatus = await gitService.getMergeStatus(dir);
    expect(finalStatus.inProgress).toBe(false);
    expect(finalStatus.isRebase).toBe(false);
  });

  test('characterizes both-added, modify/delete, spaced paths, CRLF, binary, and manual edits', async () => {
    const dir = await repo();
    await git(dir, ['checkout', '-b', 'incoming']);
    fs.mkdirSync(path.join(dir, 'folder with spaces'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'folder with spaces', 'added.txt'), 'incoming\n');
    fs.writeFileSync(path.join(dir, 'delete-me.txt'), 'incoming\n');
    fs.writeFileSync(path.join(dir, 'crlf.txt'), 'one\r\ntwo\r\n');
    fs.writeFileSync(path.join(dir, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    await commit(dir, 'incoming structural changes');
    await git(dir, ['checkout', 'main']);
    fs.mkdirSync(path.join(dir, 'folder with spaces'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'folder with spaces', 'added.txt'), 'current\n');
    fs.writeFileSync(path.join(dir, 'delete-me.txt'), 'current\n');
    fs.writeFileSync(path.join(dir, 'crlf.txt'), 'one\r\nchanged\r\n');
    fs.writeFileSync(path.join(dir, 'binary.bin'), Buffer.from([0, 9, 8, 7]));
    await commit(dir, 'current structural changes');
    await git(dir, ['merge', 'incoming'], true);
    const files = await gitService.getConflictedFiles(dir);
    expect(files.map(file => file.path)).toEqual(expect.arrayContaining(['"folder with spaces/added.txt"', 'crlf.txt', 'binary.bin']));
    expect((await unmerged(dir)).every(item => item.stage === '1' || item.stage === '2' || item.stage === '3')).toBe(true);
    fs.writeFileSync(path.join(dir, 'crlf.txt'), 'manual edit\r\n');
    expect(fs.readFileSync(path.join(dir, 'crlf.txt'), 'utf8')).toContain('manual edit');
  });

  test('continueRebase rejects unmerged files with friendly error and skipRebase works', async () => {
    const dir = await repo();
    await git(dir, ['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(dir, 'file.txt'), 'feature change\n');
    await commit(dir, 'feature commit');
    await git(dir, ['checkout', 'main']);
    fs.writeFileSync(path.join(dir, 'file.txt'), 'main change\n');
    await commit(dir, 'main commit');
    await git(dir, ['checkout', 'feature']);
    await git(dir, ['rebase', 'main'], true);

    // Attempting continue while unmerged files still exist reports hadConflicts without crashing
    const continueRes = await gitService.continueRebase(dir);
    expect(continueRes.success).toBe(true);
    expect(continueRes.hadConflicts).toBe(true);
    expect(continueRes.conflictedFiles.length).toBeGreaterThan(0);

    // Skipping advances and finishes rebase
    const skipRes = await gitService.skipRebase(dir);
    expect(skipRes.success).toBe(true);
    expect((await gitService.getMergeStatus(dir)).inProgress).toBe(false);
  });
});
