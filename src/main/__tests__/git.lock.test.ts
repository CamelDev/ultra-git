import { describe, test, expect } from 'bun:test';
import { isIndexLockError, withGitLockRetry, gitService } from '../git';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('git lock error utilities', () => {
  test('isIndexLockError correctly identifies lock file error messages', () => {
    expect(
      isIndexLockError(
        "fatal: Unable to create '/Users/test/repo/.git/index.lock': File exists."
      )
    ).toBe(true);

    expect(
      isIndexLockError(
        new Error(
          "Another git process seems to be running: Unable to create '.git/index.lock': File exists"
        )
      )
    ).toBe(true);

    expect(isIndexLockError('fatal: pathspec branch-a did not match')).toBe(false);
    expect(isIndexLockError(null)).toBe(false);
  });

  test('withGitLockRetry retries on transient index.lock errors and eventually succeeds', async () => {
    let attempts = 0;
    const mockGitAction = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Unable to create '/path/.git/index.lock': File exists.");
      }
      return 'success';
    };

    const result = await withGitLockRetry(mockGitAction, 3, 10);
    expect(attempts).toBe(3);
    expect(result).toBe('success');
  });

  test('withGitLockRetry fails after max retries if lock is persistent', async () => {
    let attempts = 0;
    const mockGitAction = async () => {
      attempts++;
      throw new Error("Unable to create '/path/.git/index.lock': File exists.");
    };

    expect(withGitLockRetry(mockGitAction, 2, 10)).rejects.toThrow('index.lock');
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  test('checkIndexLock and removeIndexLock manage lock files on disk', async () => {
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'temp-lock-test-'));
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });

    const lockPath = path.join(gitDir, 'index.lock');

    // Initially no lock file
    const checkBefore = await gitService.checkIndexLock(tmpDir);
    expect(checkBefore.exists).toBe(false);

    // Create mock lock file
    fs.writeFileSync(lockPath, 'lock content');
    const checkAfter = await gitService.checkIndexLock(tmpDir);
    expect(checkAfter.exists).toBe(true);
    expect(checkAfter.lockPath).toBe(lockPath);

    // Remove lock file
    const removeRes = await gitService.removeIndexLock(tmpDir);
    expect(removeRes.success).toBe(true);

    const checkFinal = await gitService.checkIndexLock(tmpDir);
    expect(checkFinal.exists).toBe(false);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
