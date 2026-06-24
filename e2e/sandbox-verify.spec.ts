import { test, expect } from '@playwright/test';
import { GitSandbox } from './helpers/git-sandbox';
import fs from 'fs';

test('GitSandbox initializes and performs operations correctly', async () => {
  const sandbox = new GitSandbox();
  
  // 1. Verify sandbox directory is created on constructor call
  expect(fs.existsSync(sandbox.dir)).toBe(true);

  // 2. Initialize the Git repository
  await sandbox.init();

  // 3. Verify the initial commit occurred
  const log = await sandbox.git.log();
  expect(log.total).toBe(1);
  expect(log.latest?.message).toBe('Initial commit');

  // 4. Verify local-only config setting safety
  const localName = await sandbox.git.getConfig('user.name', 'local');
  expect(localName.value).toBe('Test User');

  // 5. Verify commit creation helper
  await sandbox.createCommit('test-file.txt', 'hello from sandbox', 'Verify commit creation');
  const logAfterCommit = await sandbox.git.log();
  expect(logAfterCommit.total).toBe(2);
  expect(logAfterCommit.latest?.message).toBe('Verify commit creation');

  // 6. Verify branch creation helper
  await sandbox.createBranch('test-branch');
  const status = await sandbox.git.status();
  expect(status.current).toBe('test-branch');

  // 7. Verify stash creation helper
  await sandbox.createStash('Verify stash creation');
  const stashList = await sandbox.git.stashList();
  expect(stashList.total).toBe(1);

  // 8. Clean up and verify directory destruction
  const dirPath = sandbox.dir;
  await sandbox.destroy();
  expect(fs.existsSync(dirPath)).toBe(false);
});
