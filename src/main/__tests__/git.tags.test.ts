import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import {
  gitService,
  parseRemoteTagsOutput,
  parseLocalTagsOutput,
  classifyTagSyncStatus
} from '../git';

function removeDirSafe(dir: string) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Ignore transient Windows file-handle cleanup errors in temp dir
  }
}

describe('Tag Sync Parsing & Classification', () => {
  it('parseRemoteTagsOutput parses lightweight and annotated tags without peeled ^{} duplicates', () => {
    const raw = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/v1.0.0',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v1.0.0^{}',
      'cccccccccccccccccccccccccccccccccccccccc\trefs/tags/v2.0.0',
      'dddddddddddddddddddddddddddddddddddddddd\trefs/heads/main',
      ''
    ].join('\r\n');

    const map = parseRemoteTagsOutput(raw);
    expect(map.size).toBe(2);
    expect(map.get('v1.0.0')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(map.get('v2.0.0')).toBe('cccccccccccccccccccccccccccccccccccccccc');
  });

  it('parseLocalTagsOutput parses for-each-ref output', () => {
    const raw = [
      'v1.0.0\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'v2.0.0\tcccccccccccccccccccccccccccccccccccccccc'
    ].join('\n');

    const map = parseLocalTagsOutput(raw);
    expect(map.size).toBe(2);
    expect(map.get('v1.0.0')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(map.get('v2.0.0')).toBe('cccccccccccccccccccccccccccccccccccccccc');
  });

  it('classifyTagSyncStatus separates synced, unpushed, and diverged tags', () => {
    const local = new Map<string, string>([
      ['v1.0.0', '1111111'],
      ['v1.1.0', '2222222'],
      ['v2.0.0', '3333333']
    ]);
    const remote = new Map<string, string>([
      ['v1.0.0', '1111111'], // synced
      ['v1.1.0', '9999999']  // diverged (different OID)
      // v2.0.0 missing on remote -> unpushed
    ]);

    const result = classifyTagSyncStatus(local, remote);
    expect(result.unpushed).toEqual(['v2.0.0']);
    expect(result.diverged).toEqual(['v1.1.0']);
  });
});

describe('Git Service Tag Sync, Per-Tag Push, and Remote Sync', () => {
  let rootDir: string;
  let bareRemoteDir: string;
  let localRepoDir: string;
  let otherCloneDir: string;

  beforeEach(async () => {
    const baseTmp = path.join(process.cwd(), '.tmp-test-git-tags');
    fs.mkdirSync(baseTmp, { recursive: true });
    rootDir = fs.mkdtempSync(path.join(baseTmp, 'run-'));
    bareRemoteDir = path.join(rootDir, 'remote.git');
    localRepoDir = path.join(rootDir, 'local');
    otherCloneDir = path.join(rootDir, 'other');

    fs.mkdirSync(bareRemoteDir, { recursive: true });
    await simpleGit(bareRemoteDir).init(true);

    fs.mkdirSync(localRepoDir, { recursive: true });
    const localGit = simpleGit(localRepoDir);
    await localGit.init();
    await localGit.addConfig('user.name', 'Test User');
    await localGit.addConfig('user.email', 'test@example.com');
    await localGit.addConfig('core.autocrlf', 'false');
    await localGit.branch(['-M', 'main']);

    fs.writeFileSync(path.join(localRepoDir, 'README.md'), '# Commit 1\n');
    await localGit.add('.');
    await localGit.commit('Initial commit');
    await localGit.addRemote('origin', bareRemoteDir);
    await localGit.raw(['push', '-u', 'origin', 'main']);

    // Second commit
    fs.writeFileSync(path.join(localRepoDir, 'README.md'), '# Commit 2\n');
    await localGit.add('.');
    await localGit.commit('Second commit');
    await localGit.raw(['push', 'origin', 'main']);

    // Clone into another working copy to simulate remote tag changes
    await simpleGit(rootDir).clone(bareRemoteDir, otherCloneDir);
    const otherGit = simpleGit(otherCloneDir);
    await otherGit.addConfig('user.name', 'Other User');
    await otherGit.addConfig('user.email', 'other@example.com');
  });

  afterEach(() => {
    removeDirSafe(rootDir);
  });

  afterAll(() => {
    removeDirSafe(path.join(process.cwd(), '.tmp-test-git-tags'));
  });

  it('detects diverged tags and pushes only unpushed tags without failing on diverged ones', async () => {
    const localGit = simpleGit(localRepoDir);
    const otherGit = simpleGit(otherCloneDir);

    const commits = (await localGit.raw(['rev-list', '--reverse', 'HEAD'])).trim().split(/\r?\n/);
    const commit1 = commits[0];
    const commit2 = commits[1];

    // Create synced tag v1.0.0 on commit1 and push it
    await gitService.createTag(localRepoDir, 'v1.0.0', commit1);
    await gitService.pushTag(localRepoDir, 'v1.0.0');

    // Create tag v1.1.0 locally on commit1, while remote has v1.1.0 on commit2 (diverged!)
    await gitService.createTag(localRepoDir, 'v1.1.0', commit1);
    await otherGit.tag(['v1.1.0', commit2]);
    await otherGit.raw(['push', 'origin', 'refs/tags/v1.1.0']);

    // Create a brand new unpushed tag v2.0.0 locally on commit2
    await gitService.createTag(localRepoDir, 'v2.0.0', commit2);

    const statusBefore = await gitService.getTagSyncStatus(localRepoDir);
    expect(statusBefore.unpushed).toEqual(['v2.0.0']);
    expect(statusBefore.diverged).toEqual(['v1.1.0']);

    // pushTags should succeed and push ONLY v2.0.0, skipping diverged v1.1.0
    const pushRes = await gitService.pushTags(localRepoDir);
    expect(pushRes.pushed).toEqual(['v2.0.0']);
    expect(pushRes.diverged).toEqual(['v1.1.0']);

    // Verify v2.0.0 is now on remote, while v1.1.0 is still diverged
    const statusAfterPush = await gitService.getTagSyncStatus(localRepoDir);
    expect(statusAfterPush.unpushed).toEqual([]);
    expect(statusAfterPush.diverged).toEqual(['v1.1.0']);

    // Syncing v1.1.0 from remote should update local v1.1.0 to commit2 and clear divergence
    await gitService.syncTagFromRemote(localRepoDir, 'v1.1.0');
    const localTagOid = (await localGit.raw(['rev-parse', 'refs/tags/v1.1.0'])).trim();
    expect(localTagOid).toBe(commit2);

    const statusAfterSync = await gitService.getTagSyncStatus(localRepoDir);
    expect(statusAfterSync.unpushed).toEqual([]);
    expect(statusAfterSync.diverged).toEqual([]);
  });

  it('pushTag pushes only the requested tag and leaves other unpushed tags local', async () => {
    await gitService.createTag(localRepoDir, 'v1.0.0');
    await gitService.createTag(localRepoDir, 'v2.0.0');

    await gitService.pushTag(localRepoDir, 'v1.0.0');

    const status = await gitService.getTagSyncStatus(localRepoDir);
    expect(status.unpushed).toEqual(['v2.0.0']);
    expect(status.diverged).toEqual([]);
  });
});
