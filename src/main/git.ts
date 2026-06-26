import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'fs';
import { join } from 'path';

// Manage simple-git instances per repository path
const gitInstances = new Map<string, SimpleGit>();

function getGitInstance(repoPath: string): SimpleGit {
  if (!gitInstances.has(repoPath)) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
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
      await git.pull();
      return { hadConflicts: false };
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict') || msg.includes('Merge conflict')) {
        return { hadConflicts: true };
      }
      throw err;
    }
  },

  push: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    await git.push();
    return { success: true };
  },

  checkout: async (repoPath: string, branchName: string) => {
    const git = getGitInstance(repoPath);
    return await git.checkout(branchName);
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
      await git.raw(['stash', 'pop', `stash@{${index}}`]);
      return { hadConflicts: false };
    } catch (err: any) {
      // git stash pop exits with non-zero when there are conflicts
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict')) {
        return { hadConflicts: true };
      }
      throw err;
    }
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
    identity: { name: string; email: string; sshKeyPath?: string; personalAccessToken?: string }
  ) => {
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
      await git.raw(['config', '--local', '--add', 'credential.helper', '']);
      await git.raw(['config', '--local', '--add', 'credential.helper', `!f() { echo "username=token"; echo "password=${escapedToken}"; }; f`]);
    }

    return { success: true };
  }
};
