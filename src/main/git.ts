import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

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
  }
};
