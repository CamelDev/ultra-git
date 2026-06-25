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
    return await git.log({ maxCount });
  },

  fetch: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.fetch();
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
  }
};
