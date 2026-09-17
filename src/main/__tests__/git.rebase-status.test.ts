import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import simpleGit from 'simple-git';
import { gitService, parseRebaseMetadata } from '../git';

describe('gitService rebase and merge status', () => {
  let tmpDir: string;
  let gitDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-git-rebase-test-'));
    await simpleGit(tmpDir).init();
    gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('parses rebase-merge metadata through a pure seam', () => {
    expect(parseRebaseMetadata({
      end: '3\n', done: 'pick abc1234 First commit\npick def5678 Second commit\n',
      msg: 'BE-12203: Middle name comparator\n\nDetailed message', headName: 'refs/heads/feature/comparator\n'
    })).toEqual({ currentStep: 2, totalSteps: 3, currentCommitSubject: 'BE-12203: Middle name comparator', branchName: 'feature/comparator' });
  });

  test('parses rebase-apply metadata through the same seam', () => {
    expect(parseRebaseMetadata({ next: '1\n', last: '2\n', msg: 'Apply patch step 1\n' })).toEqual({ currentStep: 1, totalSteps: 2, currentCommitSubject: 'Apply patch step 1', branchName: undefined });
  });

  test('getMergeStatus parses rebase-merge progress and metadata', async () => {
    const rebaseMergeDir = path.join(gitDir, 'rebase-merge');
    fs.mkdirSync(rebaseMergeDir, { recursive: true });
    fs.writeFileSync(path.join(rebaseMergeDir, 'end'), '3\n');
    fs.writeFileSync(path.join(rebaseMergeDir, 'done'), 'pick abc1234 First commit\npick def5678 Second commit\n');
    fs.writeFileSync(path.join(rebaseMergeDir, 'msg'), 'BE-12203: Middle name comparator\n\nDetailed message');
    fs.writeFileSync(path.join(rebaseMergeDir, 'head-name'), 'refs/heads/feature/comparator\n');

    const res = await gitService.getMergeStatus(tmpDir);
    expect(res.inProgress).toBe(true);
    expect(res.isRebase).toBe(true);
    expect(res.currentStep).toBe(2);
    expect(res.totalSteps).toBe(3);
    expect(res.currentCommitSubject).toBe('BE-12203: Middle name comparator');
    expect(res.branchName).toBe('feature/comparator');
  });

  test('getMergeStatus parses rebase-apply progress and metadata', async () => {
    const rebaseApplyDir = path.join(gitDir, 'rebase-apply');
    fs.mkdirSync(rebaseApplyDir, { recursive: true });
    fs.writeFileSync(path.join(rebaseApplyDir, 'next'), '1\n');
    fs.writeFileSync(path.join(rebaseApplyDir, 'last'), '2\n');
    fs.writeFileSync(path.join(rebaseApplyDir, 'msg'), 'Apply patch step 1\n');

    const res = await gitService.getMergeStatus(tmpDir);
    expect(res.inProgress).toBe(true);
    expect(res.isRebase).toBe(true);
    expect(res.currentStep).toBe(1);
    expect(res.totalSteps).toBe(2);
    expect(res.currentCommitSubject).toBe('Apply patch step 1');
  });

  test('getMergeStatus parses MERGE_HEAD and MERGE_MSG', async () => {
    fs.writeFileSync(path.join(gitDir, 'MERGE_HEAD'), '1234567890abcdef\n');
    fs.writeFileSync(path.join(gitDir, 'MERGE_MSG'), 'Merge branch \'develop\' into main\n');

    const res = await gitService.getMergeStatus(tmpDir);
    expect(res.inProgress).toBe(true);
    expect(res.isMerge).toBe(true);
    expect(res.currentCommitSubject).toBe('Merge branch \'develop\' into main');
  });

  test('getMergeStatus parses CHERRY_PICK_HEAD', async () => {
    fs.writeFileSync(path.join(gitDir, 'CHERRY_PICK_HEAD'), 'fedcba0987654321\n');
    fs.writeFileSync(path.join(gitDir, 'MERGE_MSG'), 'fix: cherry picked commit\n');

    const res = await gitService.getMergeStatus(tmpDir);
    expect(res.inProgress).toBe(true);
    expect(res.isCherryPick).toBe(true);
    expect(res.currentCommitSubject).toBe('fix: cherry picked commit');
  });
});
