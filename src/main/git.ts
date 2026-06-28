import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'fs';
import { join, resolve } from 'path';

export interface ConflictedFile {
  path: string;
  status: 'UU' | 'AA' | 'DD' | 'AU' | 'UA' | 'DU' | 'UD';
}

export interface ConflictHunk {
  ours: string;
  base: string;
  theirs: string;
  startLine: number; // 1-indexed line where <<<<<<< begins
}

// Manage simple-git instances per repository path
const gitInstances = new Map<string, SimpleGit>();

function getGitInstance(repoPath: string): SimpleGit {
  if (!gitInstances.has(repoPath)) {
    const options: any = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
      unsafe: {
        allowUnsafeCredentialHelper: true
      }
    };
    gitInstances.set(repoPath, simpleGit(options));
  }
  return gitInstances.get(repoPath)!;
}

export const gitService = {
  status: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.status();
  },

  log: async (repoPath: string, maxCount = 50) => {
    const git = getGitInstance(repoPath);
    
    let trackingBranch: string | null = null;
    try {
      const statusResult = await git.status();
      trackingBranch = statusResult.tracking || null;
    } catch (e) {
      console.warn('Failed to get tracking branch in git.log', e);
    }

    let logResult;
    const aheadSet = new Set<string>();
    const behindSet = new Set<string>();

    if (trackingBranch) {
      try {
        const [aheadRaw, behindRaw] = await Promise.all([
          git.raw(['rev-list', `${trackingBranch}..HEAD`]),
          git.raw(['rev-list', `HEAD..${trackingBranch}`])
        ]);

        aheadRaw.split('\n').forEach(h => {
          const trimmed = h.trim();
          if (trimmed) aheadSet.add(trimmed);
        });

        behindRaw.split('\n').forEach(h => {
          const trimmed = h.trim();
          if (trimmed) behindSet.add(trimmed);
        });

        // Combined log of HEAD and remote-tracking branch
        logResult = await git.log([
          'HEAD',
          trackingBranch,
          `--max-count=${maxCount}`
        ]);
      } catch (err) {
        console.warn('Failed to get tracking branches log, falling back to HEAD log', err);
        logResult = await git.log({ maxCount });
      }
    } else {
      logResult = await git.log({ maxCount });
    }

    // Attach status to each commit
    const all = logResult.all.map((commit: any) => {
      const hash = commit.hash;
      let syncStatus: 'local-only' | 'remote-only' | 'pushed' = 'pushed';
      if (aheadSet.has(hash)) {
        syncStatus = 'local-only';
      } else if (behindSet.has(hash)) {
        syncStatus = 'remote-only';
      }
      return {
        ...commit,
        syncStatus
      };
    });

    return {
      ...logResult,
      all
    };
  },

  fetch: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.fetch();
  },

  pull: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    try {
      await git.pull(undefined, undefined, { '--no-edit': null, '--no-rebase': null });
      return { hadConflicts: false };
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict') || msg.includes('Merge conflict')) {
        return { hadConflicts: true };
      }
      throw err;
    }
  },

  push: async (repoPath: string, force?: boolean, remote?: string, branch?: string, setUpstream?: boolean) => {
    const git = getGitInstance(repoPath);
    const options: any = {};
    if (force) {
      options['--force'] = null;
    }
    if (setUpstream) {
      options['--set-upstream'] = null;
    }

    if (remote && branch) {
      await git.push(remote, branch, options);
    } else {
      await git.push(undefined, undefined, options);
    }
    return { success: true };
  },

  getRemotes: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.getRemotes(true);
  },

  addRemote: async (repoPath: string, name: string, url: string) => {
    const git = getGitInstance(repoPath);
    await git.addRemote(name, url);
    return { success: true };
  },

  checkout: async (repoPath: string, branchName: string) => {
    const git = getGitInstance(repoPath);
    return await git.checkout(branchName);
  },

  createBranch: async (repoPath: string, branchName: string, startPoint?: string) => {
    console.log('[gitService.createBranch] called with:', { repoPath, branchName, startPoint });
    const git = getGitInstance(repoPath);
    if (startPoint) {
      console.log(`[gitService.createBranch] Creating branch ${branchName} from startPoint: ${startPoint}`);
      return await git.checkoutBranch(branchName, startPoint);
    }
    console.log(`[gitService.createBranch] Creating branch ${branchName} from HEAD`);
    return await git.checkoutLocalBranch(branchName);
  },

  deleteBranch: async (repoPath: string, branchName: string, force?: boolean) => {
    const git = getGitInstance(repoPath);
    const args = ['branch', force ? '-D' : '-d', branchName];
    await git.raw(args);
    return { success: true };
  },

  renameBranch: async (repoPath: string, oldName: string, newName: string) => {
    const git = getGitInstance(repoPath);
    await git.raw(['branch', '-m', oldName, newName]);
    return { success: true };
  },

  getBranches: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    const summary = await git.branch();
    const local: Array<{ name: string; ahead: number; behind: number }> = [];
    const remote: string[] = [];
    
    const branchStatusMap = new Map<string, { ahead: number; behind: number }>();
    try {
      const trackingRaw = await git.raw(['for-each-ref', '--format=%(refname:short) %(upstream:track)', 'refs/heads/']);
      const lines = trackingRaw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const spaceIdx = trimmed.indexOf(' ');
        const name = spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx).trim();
        const track = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1).trim();
        
        let ahead = 0;
        let behind = 0;
        if (track) {
          const aheadMatch = track.match(/ahead\s+(\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          const behindMatch = track.match(/behind\s+(\d+)/);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }
        branchStatusMap.set(name, { ahead, behind });
      }
    } catch (e) {
      console.warn('Failed to fetch ahead/behind counts for local branches', e);
    }

    summary.all.forEach(name => {
      if (name.startsWith('remotes/')) {
        const cleanName = name.replace(/^remotes\//, '');
        if (!cleanName.endsWith('/HEAD')) {
          remote.push(cleanName);
        }
      } else {
        const status = branchStatusMap.get(name) || { ahead: 0, behind: 0 };
        local.push({
          name,
          ahead: status.ahead,
          behind: status.behind
        });
      }
    });

    // Sort local and remote branches alphabetically
    local.sort((a, b) => a.name.localeCompare(b.name));
    remote.sort((a, b) => a.localeCompare(b));

    return {
      current: summary.current,
      local,
      remote
    };
  },

  getCommitFiles: async (repoPath: string, commitHash: string) => {
    const git = getGitInstance(repoPath);
    // Uses git show --name-status to identify changed files and their status
    const result = await git.show(['--name-status', '--pretty=format:', commitHash]);
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
    const files: Array<{ status: string, path: string, oldPath?: string }> = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const rawStatus = parts[0];
      const status = rawStatus.charAt(0);
      if (status === 'R' && parts.length >= 3) {
        files.push({
          status,
          oldPath: parts[1],
          path: parts[2]
        });
      } else {
        files.push({
          status,
          path: parts[1]
        });
      }
    }
    return files;
  },

  getCommitFileDiff: async (
    repoPath: string,
    commitHash: string,
    filePath: string,
    oldPath?: string,
    status?: string
  ) => {
    const git = getGitInstance(repoPath);
    let before = '';
    let after = '';

    if (status !== 'D') {
      try {
        after = await git.show([`${commitHash}:${filePath}`]);
      } catch (e) {
        console.warn(`Could not get content for ${filePath} at ${commitHash}`, e);
      }
    }

    if (status !== 'A') {
      try {
        const parentResult = await git.raw(['rev-list', '--parents', '-n', '1', commitHash]);
        const parents = parentResult.trim().split(/\s+/).slice(1);
        if (parents.length > 0) {
          const parentHash = parents[0];
          const pathBefore = oldPath || filePath;
          before = await git.show([`${parentHash}:${pathBefore}`]);
        }
      } catch (e) {
        console.warn(`Could not get parent content for ${filePath} at ${commitHash}`, e);
      }
    }

    const isBinaryString = (str: string) => {
      for (let i = 0; i < Math.min(str.length, 1000); i++) {
        if (str.charCodeAt(i) === 0) return true;
      }
      return false;
    };

    const isBinary = isBinaryString(before) || isBinaryString(after);

    return { 
      before: isBinary ? '' : before, 
      after: isBinary ? '' : after, 
      isBinary 
    };
  },

  add: async (repoPath: string, filePath: string) => {
    const git = getGitInstance(repoPath);
    return await git.add(filePath);
  },

  reset: async (repoPath: string, filePath: string) => {
    const git = getGitInstance(repoPath);
    return await git.reset(['--', filePath]);
  },

  resetToCommit: async (repoPath: string, commitHash: string, mode: 'hard' | 'soft') => {
    const git = getGitInstance(repoPath);
    return await git.reset([`--${mode}`, commitHash]);
  },

  squashCommits: async (repoPath: string, commitHash: string, message: string) => {
    const git = getGitInstance(repoPath);
    
    // Safety check: check if the working tree has uncommitted changes
    const status = await git.status();
    if (status.files.length > 0) {
      throw new Error('Cannot squash with uncommitted changes. Please stash or commit them first.');
    }

    // Find the parent of commitHash
    let parentHash = '';
    try {
      const parentRaw = await git.raw(['rev-parse', `${commitHash}^`]);
      parentHash = parentRaw.trim();
    } catch (err) {
      throw new Error('Target commit has no parent (it may be the initial commit) and cannot be squashed.');
    }

    // Soft reset to the parent of the target commit
    await git.reset(['--soft', parentHash]);

    // Commit with the new squash message
    await git.commit(message);
  },

  addAll: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.add('.');
  },

  resetAll: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.reset(['HEAD']);
  },

  commit: async (repoPath: string, message: string) => {
    const git = getGitInstance(repoPath);
    return await git.commit(message);
  },

  stashAll: async (repoPath: string, message?: string) => {
    const git = getGitInstance(repoPath);
    const args = ['stash', 'push', '--include-untracked'];
    if (message) {
      args.push('-m', message);
    }
    await git.raw(args);
  },

  stashList: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    const result = await git.raw(['stash', 'list', '--format=%gd|%gs|%ci']);
    if (!result.trim()) return [];
    return result
      .trim()
      .split('\n')
      .map((line) => {
        const parts = line.split('|');
        const ref = parts[0]?.trim() || '';
        const message = parts[1]?.trim() || '';
        const date = parts[2]?.trim() || '';
        const indexMatch = ref.match(/stash@\{(\d+)\}/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;
        return { index, ref, message, date };
      });
  },

  stashPop: async (repoPath: string, index: number) => {
    const git = getGitInstance(repoPath);
    try {
      const result = await git.raw(['stash', 'pop', `stash@{${index}}`]);
      const status = await git.status();
      const hadConflicts = status.conflicted.length > 0;
      return { hadConflicts };
    } catch (err: any) {
      console.warn('gitService.stashPop: error caught:', err.message);
      // git stash pop exits with non-zero when there are conflicts
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict')) {
        return { hadConflicts: true };
      }
      try {
        const status = await git.status();
        if (status.conflicted.length > 0) {
          return { hadConflicts: true };
        }
      } catch (e) {}
      throw err;
    }
  },

  stashDrop: async (repoPath: string, index: number) => {
    const git = getGitInstance(repoPath);
    await git.raw(['stash', 'drop', `stash@{${index}}`]);
    return { success: true };
  },

  getStashFiles: async (repoPath: string, index: number) => {
    const git = getGitInstance(repoPath);
    const stashRef = `stash@{${index}}`;
    const files: Array<{ status: string; path: string; oldPath?: string; isUntracked?: boolean }> = [];

    // 1. Get modified/staged files (diff between parent 1 and the stash commit)
    try {
      const res = await git.raw(['diff', '--name-status', `${stashRef}^1`, stashRef]);
      const lines = res.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;
        const rawStatus = parts[0];
        const status = rawStatus.charAt(0);
        if (status === 'R' && parts.length >= 3) {
          files.push({
            status,
            oldPath: parts[1],
            path: parts[2]
          });
        } else {
          files.push({
            status,
            path: parts[1]
          });
        }
      }
    } catch (e) {
      console.warn(`Could not get diff for ${stashRef}`, e);
    }

    // 2. Check untracked files (in parent 3, if it exists)
    try {
      // Check if parent 3 exists
      await git.raw(['cat-file', '-t', `${stashRef}^3`]);
      // If it exists, diff between parent 1 and parent 3 to find added files
      const res3 = await git.raw(['diff', '--name-status', `${stashRef}^1`, `${stashRef}^3`]);
      const lines3 = res3.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines3) {
        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;
        const rawStatus = parts[0];
        const status = rawStatus.charAt(0);
        const filePath = status === 'R' && parts.length >= 3 ? parts[2] : parts[1];
        if (!files.some((f) => f.path === filePath)) {
          if (status === 'R' && parts.length >= 3) {
            files.push({
              status,
              oldPath: parts[1],
              path: parts[2],
              isUntracked: true
            });
          } else {
            files.push({
              status,
              path: filePath,
              isUntracked: true
            });
          }
        }
      }
    } catch (e) {
      // Parent 3 doesn't exist
    }

    return files;
  },

  getStashFileDiff: async (
    repoPath: string,
    index: number,
    filePath: string,
    oldPath?: string,
    status?: string,
    isUntracked?: boolean
  ) => {
    const git = getGitInstance(repoPath);
    const stashRef = `stash@{${index}}`;
    let before = '';
    let after = '';

    if (isUntracked) {
      try {
        after = await git.show([`${stashRef}^3:${filePath}`]);
      } catch (e) {
        console.warn(`Could not get content for untracked ${filePath} at ${stashRef}^3`, e);
      }
    } else {
      if (status !== 'D') {
        try {
          after = await git.show([`${stashRef}:${filePath}`]);
        } catch (e) {
          console.warn(`Could not get content for ${filePath} at ${stashRef}`, e);
        }
      }
      if (status !== 'A') {
        try {
          const pathBefore = oldPath || filePath;
          before = await git.show([`${stashRef}^1:${pathBefore}`]);
        } catch (e) {
          console.warn(`Could not get parent content for ${filePath} at ${stashRef}^1`, e);
        }
      }
    }

    const isBinaryString = (str: string) => {
      for (let i = 0; i < Math.min(str.length, 1000); i++) {
        if (str.charCodeAt(i) === 0) return true;
      }
      return false;
    };

    const isBinary = isBinaryString(before) || isBinaryString(after);

    return {
      before: isBinary ? '' : before,
      after: isBinary ? '' : after,
      isBinary
    };
  },

  getActiveFileDiff: async (
    repoPath: string,
    filePath: string,
    isStaged: boolean,
    oldPath?: string
  ) => {
    const git = getGitInstance(repoPath);
    let before = '';
    let after = '';

    if (isStaged) {
      // Staged file diff: before is HEAD version, after is Index version
      try {
        before = await git.show([`HEAD:${oldPath || filePath}`]);
      } catch (e) {
        before = '';
      }
      try {
        after = await git.show([`:${filePath}`]);
      } catch (e) {
        after = '';
      }
    } else {
      // Unstaged file diff: before is Index version (or HEAD if not in index), after is Working Tree version
      try {
        before = await git.show([`:${filePath}`]);
      } catch (e) {
        try {
          before = await git.show([`HEAD:${filePath}`]);
        } catch (e2) {
          before = '';
        }
      }
      try {
        const fullPath = join(repoPath, filePath);
        after = await fs.promises.readFile(fullPath, 'utf8');
      } catch (e) {
        after = '';
      }
    }

    const isBinaryString = (str: string) => {
      for (let i = 0; i < Math.min(str.length, 1000); i++) {
        if (str.charCodeAt(i) === 0) return true;
      }
      return false;
    };

    const isBinary = isBinaryString(before) || isBinaryString(after);

    return { 
      before: isBinary ? '' : before, 
      after: isBinary ? '' : after, 
      isBinary 
    };
  },

  setRepositoryIdentity: async (
    repoPath: string,
    identity: {
      name: string;
      email: string;
      sshKeyPath?: string;
      personalAccessToken?: string;
      username?: string;
      provider?: string;
    }
  ) => {
    if (process.env.ULTRA_GIT_TESTING === 'true' && resolve(repoPath) === resolve(process.cwd())) {
      console.log(`git.ts: Skipping git configuration modification for main workspace CWD repository: ${repoPath}`);
      return { success: true };
    }

    const git = getGitInstance(repoPath);
    if (identity.name) {
      await git.addConfig('user.name', identity.name, false, 'local');
    } else {
      try {
        await git.raw(['config', '--local', '--unset-all', 'user.name']);
      } catch (e: any) {
        console.error('git.ts: Failed to unset user.name:', e.message);
      }
    }

    if (identity.email) {
      await git.addConfig('user.email', identity.email, false, 'local');
    } else {
      try {
        await git.raw(['config', '--local', '--unset-all', 'user.email']);
      } catch (e: any) {
        console.error('git.ts: Failed to unset user.email:', e.message);
      }
    }

    if (identity.sshKeyPath) {
      const normalizedPath = identity.sshKeyPath.replace(/\\/g, '/');
      await git.addConfig('core.sshCommand', `ssh -i "${normalizedPath}" -o IdentitiesOnly=yes`, false, 'local');
    } else {
      try {
        await git.raw(['config', '--local', '--unset-all', 'core.sshCommand']);
      } catch (e: any) {
        console.error('git.ts: Failed to unset core.sshCommand:', e.message);
      }
    }

    try {
      await git.raw(['config', '--local', '--unset-all', 'credential.helper']);
    } catch (e: any) {
      // Ignore if not set
    }

    if (identity.personalAccessToken) {
      const escapedToken = identity.personalAccessToken.replace(/"/g, '\\"');
      let helperUsername = 'token';
      if (identity.provider === 'bitbucket') {
        helperUsername = identity.username || identity.email || 'x-token-auth';
      } else if (identity.provider === 'gitlab') {
        helperUsername = identity.username || 'oauth2';
      } else if (identity.provider === 'github') {
        helperUsername = identity.username || 'token';
      } else if (identity.username) {
        helperUsername = identity.username;
      }
      await git.raw(['config', '--local', '--add', 'credential.helper', '']);
      await git.raw(['config', '--local', '--add', 'credential.helper', `!f() { echo "username=${helperUsername}"; echo "password=${escapedToken}"; }; f`]);
    }

    return { success: true };
  },

  merge: async (
    repoPath: string,
    sourceBranch: string,
    strategy: 'merge' | 'no-ff' | 'squash' = 'merge'
  ) => {
    const git = getGitInstance(repoPath);
    const args: string[] = ['merge'];
    if (strategy === 'no-ff') {
      args.push('--no-ff');
    } else if (strategy === 'squash') {
      args.push('--squash');
    }
    args.push('--no-edit', sourceBranch);
    try {
      await git.raw(args);
      return { hadConflicts: false, conflictedFiles: [] as ConflictedFile[] };
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
        const conflictedFiles = await gitService.getConflictedFiles(repoPath);
        return { hadConflicts: true, conflictedFiles };
      }
      throw err;
    }
  },

  rebase: async (repoPath: string, ontoBranch: string) => {
    const git = getGitInstance(repoPath);
    try {
      await git.rebase([ontoBranch]);
      return { hadConflicts: false, conflictedFiles: [] as ConflictedFile[] };
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict')) {
        const conflictedFiles = await gitService.getConflictedFiles(repoPath);
        return { hadConflicts: true, conflictedFiles };
      }
      throw err;
    }
  },

  abortMerge: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    await git.raw(['merge', '--abort']);
    return { success: true };
  },

  abortRebase: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    await git.raw(['rebase', '--abort']);
    return { success: true };
  },

  continueRebase: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    await git.raw(['rebase', '--continue']);
    return { success: true };
  },

  getConflictedFiles: async (repoPath: string): Promise<ConflictedFile[]> => {
    const git = getGitInstance(repoPath);
    // --porcelain=v1 gives XY STATUS lines, UU = both modified conflict
    const raw = await git.raw(['status', '--porcelain=v1']);
    const files: ConflictedFile[] = [];
    for (const line of raw.split('\n')) {
      if (line.length < 3) continue;
      const xy = line.substring(0, 2);
      const path = line.substring(3).trim();
      const conflictCodes = ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'];
      if (conflictCodes.includes(xy)) {
        files.push({ path, status: xy as ConflictedFile['status'] });
      }
    }
    return files;
  },

  getConflictFileDiff: async (repoPath: string, filePath: string) => {
    const fullPath = join(repoPath, filePath);
    let raw = '';
    try {
      raw = await fs.promises.readFile(fullPath, 'utf8');
    } catch (e) {
      return { raw: '', hunks: [] as ConflictHunk[] };
    }
    const hunks: ConflictHunk[] = [];
    const lines = raw.split('\n');
    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('<<<<<<<')) {
        const startLine = i + 1; // 1-indexed
        const oursLines: string[] = [];
        const baseLines: string[] = [];
        const theirsLines: string[] = [];
        let section: 'ours' | 'base' | 'theirs' = 'ours';
        i++;
        while (i < lines.length) {
          if (lines[i].startsWith('=======')) {
            section = 'theirs';
            i++;
            continue;
          }
          if (lines[i].startsWith('|||||||')) {
            // diff3 style — skip base section marker
            section = 'base';
            i++;
            continue;
          }
          if (lines[i].startsWith('>>>>>>>')) {
            i++;
            break;
          }
          if (section === 'ours') oursLines.push(lines[i]);
          else if (section === 'base') baseLines.push(lines[i]);
          else theirsLines.push(lines[i]);
          i++;
        }
        hunks.push({
          ours: oursLines.join('\n'),
          base: baseLines.join('\n'),
          theirs: theirsLines.join('\n'),
          startLine
        });
      } else {
        i++;
      }
    }
    return { raw, hunks };
  },

  resolveConflict: async (
    repoPath: string,
    filePath: string,
    resolvedContent: string
  ) => {
    const fullPath = join(repoPath, filePath);
    await fs.promises.writeFile(fullPath, resolvedContent, 'utf8');
    // Stage the resolved file
    const git = getGitInstance(repoPath);
    await git.add(filePath);
    return { success: true };
  },

  getMergeStatus: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    let gitDir: string;
    try {
      gitDir = (await git.raw(['rev-parse', '--git-dir'])).trim();
    } catch (e) {
      gitDir = '.git';
    }
    const gitResolvedPath = resolve(repoPath, gitDir);
    const mergeHeadPath = join(gitResolvedPath, 'MERGE_HEAD');
    const rebaseApplyPath = join(gitResolvedPath, 'rebase-apply');
    const rebaseMergePath = join(gitResolvedPath, 'rebase-merge');
    const cherryPickHeadPath = join(gitResolvedPath, 'CHERRY_PICK_HEAD');

    let isMerge = false;
    let isRebase = false;
    let isCherryPick = false;
    try { await fs.promises.access(mergeHeadPath); isMerge = true; } catch { /* not a merge */ }
    try { await fs.promises.access(rebaseApplyPath); isRebase = true; } catch { /* not rebase-apply */ }
    try { await fs.promises.access(rebaseMergePath); isRebase = true; } catch { /* not rebase-merge */ }
    try { await fs.promises.access(cherryPickHeadPath); isCherryPick = true; } catch { /* not a cherry-pick */ }

    return { isMerge, isRebase, isCherryPick, inProgress: isMerge || isRebase || isCherryPick };
  },

  getTags: async (repoPath: string): Promise<string[]> => {
    const git = getGitInstance(repoPath);
    try {
      const result = await git.raw(['tag', '--sort=-creatordate']);
      return result.split('\n').map(t => t.trim()).filter(Boolean);
    } catch (e) {
      console.error('getTags failed, falling back to basic tags listing:', e);
      const tags = await git.tags();
      return tags.all;
    }
  },

  createTag: async (repoPath: string, tagName: string): Promise<void> => {
    const git = getGitInstance(repoPath);
    await git.addTag(tagName);
  },

  pushTags: async (repoPath: string, remote?: string): Promise<void> => {
    const git = getGitInstance(repoPath);
    await git.push(remote || 'origin', { '--tags': null });
  },

  deleteTag: async (repoPath: string, tagName: string, deleteRemote?: boolean, remote?: string): Promise<void> => {
    const git = getGitInstance(repoPath);
    await git.tag(['-d', tagName]);
    if (deleteRemote) {
      await git.raw(['push', remote || 'origin', '--delete', tagName]);
    }
  },

  getWorktrees: async (repoPath: string): Promise<Array<{ path: string; branch: string; hash: string }>> => {
    const git = getGitInstance(repoPath);
    try {
      const output = await git.raw(['worktree', 'list', '--porcelain']);
      const worktrees: Array<{ path: string; branch: string; hash: string }> = [];
      const lines = output.split('\n');
      
      let currentWorktree: any = null;
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree && currentWorktree.path) {
            if (!currentWorktree.branch) currentWorktree.branch = '(detached HEAD)';
            worktrees.push(currentWorktree);
          }
          currentWorktree = { path: line.substring(9).trim(), branch: '', hash: '' };
        } else if (line.startsWith('HEAD ')) {
          if (currentWorktree) currentWorktree.hash = line.substring(5).trim();
        } else if (line.startsWith('branch ')) {
          let branchName = line.substring(7).trim();
          if (branchName.startsWith('refs/heads/')) {
            branchName = branchName.substring(11);
          }
          if (currentWorktree) currentWorktree.branch = branchName;
        }
      }
      if (currentWorktree && currentWorktree.path) {
        if (!currentWorktree.branch) currentWorktree.branch = '(detached HEAD)';
        worktrees.push(currentWorktree);
      }
      return worktrees;
    } catch (e) {
      console.error('Error fetching worktrees:', e);
      return [];
    }
  },

  addWorktree: async (repoPath: string, newPath: string, branch: string, baseBranch?: string): Promise<void> => {
    const git = getGitInstance(repoPath);
    const summary = await git.branch();
    const localBranches = summary.all.filter(b => !b.startsWith('remotes/'));
    const branchExistsLocally = localBranches.includes(branch);

    if (branchExistsLocally) {
      await git.raw(['worktree', 'add', newPath, branch]);
    } else {
      const cmd = ['worktree', 'add', '-b', branch, newPath];
      if (baseBranch) {
        cmd.push(baseBranch);
      }
      await git.raw(cmd);
    }
  },

  removeWorktree: async (repoPath: string, targetPath: string): Promise<void> => {
    const git = getGitInstance(repoPath);
    await git.raw(['worktree', 'remove', targetPath]);
  },

  getBranchCommits: async (repoPath: string, branchName: string, maxCount = 100) => {
    const git = getGitInstance(repoPath);
    const logResult = await git.log([branchName, `--max-count=${maxCount}`]);
    return logResult.all;
  },

  cherryPick: async (repoPath: string, commitHash: string) => {
    const git = getGitInstance(repoPath);
    try {
      await git.raw(['cherry-pick', commitHash]);
      return { success: true };
    } catch (err: any) {
      console.warn('gitService.cherryPick: error caught:', err.message);
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict') || msg.includes('Cherry-pick is not possible')) {
        return { success: false, error: 'Conflicts detected during cherry-pick. Please resolve conflicts or abort.', hadConflicts: true };
      }
      return { success: false, error: err.message || 'Cherry-pick failed' };
    }
  },

  abortCherryPick: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    await git.raw(['cherry-pick', '--abort']);
    return { success: true };
  },

  continueCherryPick: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    await git.raw(['-c', 'core.editor=true', 'cherry-pick', '--continue']);
    return { success: true };
  }
};
