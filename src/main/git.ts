import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'fs';
import { join, resolve } from 'path';
import { execFile } from 'child_process';

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

// ---------------------------------------------------------------------------
// Smart Pull types (see docs/smart-pull-design.md)
// ---------------------------------------------------------------------------

export type PullDirtyKind = 'clean' | 'untracked-only' | 'tracked-dirty';

export type PullBlocker =
  | 'NO_UPSTREAM'
  | 'MERGE_IN_PROGRESS'
  | 'REBASE_IN_PROGRESS'
  | 'CHERRY_PICK_IN_PROGRESS'
  | 'FETCH_FAILED';

/** Result of the read-only pre-pull analysis. */
export interface PullPlan {
  ok: boolean;
  blocker?: PullBlocker;
  upstream?: string;
  ahead: number;
  behind: number;
  canFastForward: boolean;
  diverged: boolean;
  dirtyKind: PullDirtyKind;
  /** Tracked files with staged and/or unstaged changes. */
  changedFiles: string[];
  untrackedFiles: string[];
  /** Files the incoming upstream commits will touch. */
  incomingFiles: string[];
  /** (changed ∪ untracked) ∩ incoming — files that make a plain pull fail. */
  overlappingFiles: string[];
  hasStaged: boolean;
  needsStash: boolean;
  detail?: string;
}

export type PullStrategy = 'merge' | 'rebase' | 'ff-only';

export interface SmartPullOptions {
  strategy?: PullStrategy;
  /** Stash local changes before the pull and re-apply (pop) afterwards. */
  stash?: boolean;
  stashIncludeUntracked?: boolean;
  prune?: boolean;
}

export type PullResultStatus =
  | 'up-to-date'
  | 'success'
  | 'merge-conflicts'
  | 'stash-pop-conflicts'
  | 'failed';

export type PullErrorCode =
  | 'NO_UPSTREAM'
  | 'UNRELATED_HISTORIES'
  | 'FF_ONLY_DIVERGED'
  | 'DIRTY_OVERLAP'
  | 'AUTH'
  | 'NETWORK'
  | 'STASH_FAILED'
  | 'UNKNOWN';

export interface PullResult {
  status: PullResultStatus;
  errorCode?: PullErrorCode;
  conflictedFiles?: ConflictedFile[];
  /** A pre-pull stash exists that was NOT cleanly re-applied. */
  stashedChanges: boolean;
  stashRef?: string;
  /** Strategy that was in effect when the result was produced (for abort). */
  strategy?: PullStrategy;
  detail?: string;
}

/** Stash message prefix used to identify auto-stashes created by Smart Pull. */
export const SMART_PULL_STASH_MESSAGE = 'ultra-git: auto-stash before pull';

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

/**
 * Helper to check if an error is an index.lock collision from Git.
 */
export function isIndexLockError(err: any): boolean {
  if (!err) return false;
  const message = typeof err === 'string' ? err : (err.message || String(err));
  return (
    message.includes("index.lock': File exists") ||
    (message.includes('Unable to create') && message.includes('index.lock'))
  );
}

/**
 * Retries a Git operation if it fails due to an index.lock contention error.
 */
export async function withGitLockRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 250
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt <= maxRetries && isIndexLockError(err)) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[gitService] index.lock collision encountered. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'bmp', 'svg', 'gif', 'webp', 'ico', 'avif']);

const getImageMimeType = (filePath: string): string | null => {
  const ext = filePath.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'bmp': return 'image/bmp';
    case 'ico': return 'image/x-icon';
    case 'avif': return 'image/avif';
    default: return null;
  }
};

const getGitBuffer = (repoPath: string, args: string[]): Promise<Buffer | null> => {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: repoPath, encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve(null);
      } else {
        resolve(stdout);
      }
    });
  });
};

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

    // Build refs for the log command (HEAD + optional tracking branch)
    const logRefs = trackingBranch ? ['HEAD', trackingBranch] : ['HEAD'];

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

    // Fetch parent hashes separately (simple-git default format omits %P)
    // Output: "<hash> <parent1> <parent2> ..." one per line
    const parentMap = new Map<string, string>();
    try {
      const parentRaw = await git.raw([
        'log',
        '--format=%H %P',
        `--max-count=${maxCount}`,
        ...logRefs,
      ]);
      parentRaw.trim().split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 1 && parts[0]) {
          parentMap.set(parts[0], parts.slice(1).join(' '));
        }
      });
    } catch (e) {
      console.warn('Failed to fetch parent hashes for graph', e);
    }

    // Attach syncStatus + parents to each commit
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
        syncStatus,
        parents: parentMap.get(hash) || '',
      };
    });

    return {
      ...logResult,
      all
    };
  },

  fetch: async (repoPath: string) => {
    const git = getGitInstance(repoPath);
    return await git.fetch({ '--prune': null });
  },

  pull: async (repoPath: string, prune = true) => {
    const git = getGitInstance(repoPath);
    try {
      const options: any = { '--no-edit': null, '--no-rebase': null };
      if (prune) {
        options['--prune'] = null;
      }
      await git.pull(undefined, undefined, options);
      return { hadConflicts: false };
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.includes('CONFLICT') || msg.includes('conflict') || msg.includes('Merge conflict')) {
        return { hadConflicts: true };
      }
      throw err;
    }
  },

  /**
   * Read-only pre-pull analysis (Smart Pull phase 1).
   * Fetches, then computes ahead/behind, working-tree state and — crucially —
   * the overlap between uncommitted changes and files touched by incoming
   * upstream commits. The renderer uses this to offer state-aware options
   * instead of letting `git pull` fail with a raw error.
   */
  pullPreflight: async (repoPath: string): Promise<PullPlan> => {
    const git = getGitInstance(repoPath);
    const emptyPlan = (overrides: Partial<PullPlan>): PullPlan => ({
      ok: false,
      ahead: 0,
      behind: 0,
      canFastForward: false,
      diverged: false,
      dirtyKind: 'clean',
      changedFiles: [],
      untrackedFiles: [],
      incomingFiles: [],
      overlappingFiles: [],
      hasStaged: false,
      needsStash: false,
      ...overrides
    });

    // 1. An operation already in progress blocks pulling entirely.
    try {
      const mergeStatus = await gitService.getMergeStatus(repoPath);
      if (mergeStatus.isMerge) return emptyPlan({ blocker: 'MERGE_IN_PROGRESS' });
      if (mergeStatus.isRebase) return emptyPlan({ blocker: 'REBASE_IN_PROGRESS' });
      if (mergeStatus.isCherryPick) return emptyPlan({ blocker: 'CHERRY_PICK_IN_PROGRESS' });
    } catch (e) {
      console.warn('pullPreflight: failed to read merge status', e);
    }

    // 2. Resolve the upstream tracking branch.
    let upstream = '';
    try {
      upstream = (await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim();
    } catch (e) {
      return emptyPlan({ blocker: 'NO_UPSTREAM' });
    }

    // 3. Fetch so the remote-tracking ref is current (best effort).
    try {
      await git.fetch({ '--prune': null });
    } catch (err: any) {
      return emptyPlan({ blocker: 'FETCH_FAILED', upstream, detail: err?.message || String(err) });
    }

    // 4. Ahead/behind relative to upstream.
    let ahead = 0;
    let behind = 0;
    try {
      const countsRaw = await git.raw(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
      const parts = countsRaw.trim().split(/\s+/);
      ahead = parseInt(parts[0] || '0', 10) || 0;
      behind = parseInt(parts[1] || '0', 10) || 0;
    } catch (e) {
      console.warn('pullPreflight: failed to compute ahead/behind', e);
    }

    // 5. Fast-forward is possible iff we have no local commits the upstream
    //    lacks (HEAD is an ancestor of upstream ⟺ ahead === 0).
    //    NOTE: not implemented via `merge-base --is-ancestor` because
    //    simple-git's raw() resolves instead of throwing on exit code 1.
    const canFastForward = ahead === 0;

    // 6. Working-tree state (staged / unstaged / untracked).
    const changedSet = new Set<string>();
    const untrackedFiles: string[] = [];
    let hasStaged = false;
    try {
      const statusResult = await git.status();
      for (const f of statusResult.files as Array<{ path: string; index: string; working_dir: string }>) {
        if (f.index === '?' || f.working_dir === '?') {
          untrackedFiles.push(f.path);
          continue;
        }
        if (f.index !== ' ') hasStaged = true;
        changedSet.add(f.path);
      }
    } catch (e) {
      console.warn('pullPreflight: failed to read status', e);
    }

    // 7. Files the incoming upstream commits will touch (since merge-base).
    let incomingFiles: string[] = [];
    if (behind > 0) {
      try {
        const diffRaw = await git.raw(['diff', '--name-only', `HEAD...${upstream}`]);
        incomingFiles = diffRaw.split('\n').map(l => l.trim()).filter(Boolean);
      } catch (e) {
        console.warn('pullPreflight: failed to diff incoming changes', e);
      }
    }

    const incomingSet = new Set(incomingFiles);
    const overlappingFiles = [...changedSet, ...untrackedFiles].filter(p => incomingSet.has(p));
    const dirtyKind: PullDirtyKind =
      changedSet.size > 0 ? 'tracked-dirty' : untrackedFiles.length > 0 ? 'untracked-only' : 'clean';

    return {
      ok: true,
      upstream,
      ahead,
      behind,
      canFastForward,
      diverged: ahead > 0 && behind > 0,
      dirtyKind,
      changedFiles: [...changedSet],
      untrackedFiles,
      incomingFiles,
      overlappingFiles,
      hasStaged,
      needsStash: overlappingFiles.length > 0
    };
  },

  /**
   * Orchestrated pull (Smart Pull phase 3): optional app-managed autostash
   * (stash → pull → pop) with a chosen integration strategy and typed,
   * step-attributed results. Never throws for expected git outcomes.
   */
  smartPull: async (repoPath: string, options?: SmartPullOptions): Promise<PullResult> => {
    const git = getGitInstance(repoPath);
    const opts: Required<SmartPullOptions> = {
      strategy: options?.strategy ?? 'merge',
      stash: options?.stash ?? false,
      stashIncludeUntracked: options?.stashIncludeUntracked ?? true,
      prune: options?.prune ?? true
    };

    // Upstream must exist.
    let upstream = '';
    try {
      upstream = (await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim();
    } catch (e) {
      return { status: 'failed', errorCode: 'NO_UPSTREAM', stashedChanges: false, strategy: opts.strategy };
    }

    // Refresh remote-tracking refs, then check whether there is anything to do.
    try {
      await git.fetch(opts.prune ? { '--prune': null } : {});
    } catch (e) {
      // Non-fatal: the pull itself will surface a proper typed error below.
      console.warn('smartPull: fetch before pull failed (continuing)', e);
    }
    let behind = 0;
    try {
      const countsRaw = await git.raw(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
      behind = parseInt(countsRaw.trim().split(/\s+/)[1] || '0', 10) || 0;
    } catch (e) {
      console.warn('smartPull: failed to compute behind count', e);
    }
    if (behind === 0) {
      return { status: 'up-to-date', stashedChanges: false, strategy: opts.strategy };
    }

    // Step 1: stash local changes (app-managed autostash).
    let stashed = false;
    if (opts.stash) {
      try {
        const args = ['stash', 'push'];
        if (opts.stashIncludeUntracked) args.push('--include-untracked');
        args.push('-m', SMART_PULL_STASH_MESSAGE);
        const out = await git.raw(args);
        // git prints "No local changes to save" and creates nothing in that case.
        stashed = !out.includes('No local changes to save');
      } catch (err: any) {
        return {
          status: 'failed',
          errorCode: 'STASH_FAILED',
          stashedChanges: false,
          strategy: opts.strategy,
          detail: err?.message || String(err)
        };
      }
    }

    // Restores the pre-pull stash after a failed pull step (best effort).
    // Returns true when the stash could NOT be cleanly restored and still exists.
    const restoreStash = async (): Promise<boolean> => {
      if (!stashed) return false;
      try {
        const popRes = await gitService.stashPop(repoPath, 0);
        if (popRes.hadConflicts) return true;
        stashed = false;
      } catch (e) {
        console.warn('smartPull: failed to restore pre-pull stash after error', e);
        return true; // stash still exists
      }
      return false;
    };

    // Step 2: pull with the chosen integration strategy.
    const pullArgs = ['pull', '--no-edit'];
    if (opts.strategy === 'rebase') pullArgs.push('--rebase');
    else if (opts.strategy === 'ff-only') pullArgs.push('--ff-only');
    else pullArgs.push('--no-rebase');
    if (opts.prune) pullArgs.push('--prune');

    // IMPORTANT: simple-git's raw() RESOLVES (does not throw) when git exits
    // with code 1 — which is exactly how merge/rebase conflicts and dirty-tree
    // refusals report themselves. Classify from BOTH the output text and the
    // repository state, not only from thrown errors.
    let pullOutput = '';
    let pullError: any = null;
    try {
      pullOutput = await git.raw(pullArgs);
    } catch (err: any) {
      pullError = err;
    }
    const msg: string = [pullError?.message, pullOutput].filter(Boolean).join('\n');

    if (msg.includes('Not possible to fast-forward') || msg.includes('non-fast-forward') || msg.includes('divergent branches')) {
      const stillStashed = await restoreStash();
      return { status: 'failed', errorCode: 'FF_ONLY_DIVERGED', stashedChanges: stillStashed, stashRef: stillStashed ? 'stash@{0}' : undefined, strategy: opts.strategy, detail: msg };
    }
    if (msg.includes('unrelated histories')) {
      const stillStashed = await restoreStash();
      return { status: 'failed', errorCode: 'UNRELATED_HISTORIES', stashedChanges: stillStashed, stashRef: stillStashed ? 'stash@{0}' : undefined, strategy: opts.strategy, detail: msg };
    }
    if (msg.includes('would be overwritten')) {
      // Safety net — preflight should have caught this.
      const stillStashed = await restoreStash();
      return { status: 'failed', errorCode: 'DIRTY_OVERLAP', stashedChanges: stillStashed, stashRef: stillStashed ? 'stash@{0}' : undefined, strategy: opts.strategy, detail: msg };
    }

    // Merge/rebase conflicts: repo is left in MERGING/REBASING state.
    // The pre-pull stash is intentionally NOT popped onto a conflicted tree.
    let conflicted = /CONFLICT|Merge conflict|Automatic merge failed|could not apply|Resolve all conflicts/i.test(msg);
    if (!conflicted) {
      try {
        const mergeStatus = await gitService.getMergeStatus(repoPath);
        conflicted = mergeStatus.inProgress;
      } catch (e) { /* ignore */ }
    }
    if (!conflicted) {
      try {
        const statusAfter = await git.status();
        conflicted = statusAfter.conflicted.length > 0;
      } catch (e) { /* ignore */ }
    }
    if (conflicted) {
      const conflictedFiles = await gitService.getConflictedFiles(repoPath);
      return {
        status: 'merge-conflicts',
        conflictedFiles,
        stashedChanges: stashed,
        stashRef: stashed ? 'stash@{0}' : undefined,
        strategy: opts.strategy,
        detail: msg
      };
    }

    if (pullError) {
      if (/Authentication failed|Permission denied|could not read (Username|Password)|Repository not found/i.test(msg)) {
        const stillStashed = await restoreStash();
        return { status: 'failed', errorCode: 'AUTH', stashedChanges: stillStashed, stashRef: stillStashed ? 'stash@{0}' : undefined, strategy: opts.strategy, detail: msg };
      }
      if (/Could not resolve host|Connection refused|Failed to connect|Operation timed out|Timeout|network|unable to access/i.test(msg)) {
        const stillStashed = await restoreStash();
        return { status: 'failed', errorCode: 'NETWORK', stashedChanges: stillStashed, stashRef: stillStashed ? 'stash@{0}' : undefined, strategy: opts.strategy, detail: msg };
      }
      const stillStashed = await restoreStash();
      return { status: 'failed', errorCode: 'UNKNOWN', stashedChanges: stillStashed, stashRef: stillStashed ? 'stash@{0}' : undefined, strategy: opts.strategy, detail: msg };
    }

    // Step 3: re-apply stashed changes on top of the pulled state.
    if (stashed) {
      try {
        const popRes = await gitService.stashPop(repoPath, 0);
        if (popRes.hadConflicts) {
          // git keeps the stash on a conflicted pop — nothing is lost.
          const conflictedFiles = await gitService.getConflictedFiles(repoPath);
          return {
            status: 'stash-pop-conflicts',
            conflictedFiles,
            stashedChanges: true,
            stashRef: 'stash@{0}',
            strategy: opts.strategy
          };
        }
        stashed = false;
      } catch (err: any) {
        // Pop failed entirely (e.g. an untracked file from the stash now exists
        // in the pulled tree: "could not restore untracked files from stash").
        // git keeps the stash — the pull succeeded, only the re-apply needs
        // manual attention. Report it as a re-apply conflict.
        const conflictedFiles = await gitService.getConflictedFiles(repoPath);
        return {
          status: 'stash-pop-conflicts',
          conflictedFiles,
          stashedChanges: true,
          stashRef: 'stash@{0}',
          strategy: opts.strategy,
          detail: err?.message || String(err)
        };
      }
    }

    return { status: 'success', stashedChanges: false, strategy: opts.strategy };
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

  checkIndexLock: async (repoPath: string) => {
    const lockPath = join(repoPath, '.git', 'index.lock');
    try {
      if (fs.existsSync(lockPath)) {
        const stats = fs.statSync(lockPath);
        return {
          exists: true,
          lockPath,
          mtimeMs: stats.mtimeMs,
          ageSeconds: (Date.now() - stats.mtimeMs) / 1000
        };
      }
    } catch (err) {
      console.warn('Failed to check index.lock stats:', err);
    }
    return { exists: false, lockPath };
  },

  removeIndexLock: async (repoPath: string) => {
    const lockPath = join(repoPath, '.git', 'index.lock');
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.log(`[gitService.removeIndexLock] Successfully removed ${lockPath}`);
        return { success: true };
      }
      return { success: true, message: 'Lock file did not exist' };
    } catch (err: any) {
      console.error(`[gitService.removeIndexLock] Failed to remove ${lockPath}:`, err);
      return { success: false, error: err.message || String(err) };
    }
  },

  checkout: async (repoPath: string, branchName: string) => {
    const git = getGitInstance(repoPath);
    return await withGitLockRetry(() => git.checkout(branchName));
  },

  createBranch: async (repoPath: string, branchName: string, startPoint?: string) => {
    console.log('[gitService.createBranch] called with:', { repoPath, branchName, startPoint });
    const git = getGitInstance(repoPath);
    return await withGitLockRetry(() => {
      if (startPoint) {
        console.log(`[gitService.createBranch] Creating branch ${branchName} from startPoint: ${startPoint}`);
        return git.checkoutBranch(branchName, startPoint);
      }
      console.log(`[gitService.createBranch] Creating branch ${branchName} from HEAD`);
      return git.checkoutLocalBranch(branchName);
    });
  },

  deleteBranch: async (repoPath: string, branchName: string, force?: boolean) => {
    const git = getGitInstance(repoPath);
    const args = ['branch', force ? '-D' : '-d', branchName];
    await git.raw(args);
    return { success: true };
  },

  renameBranch: async (repoPath: string, oldName: string, newName: string) => {
    const git = getGitInstance(repoPath);
    try {
      await git.raw(['branch', '-m', oldName, newName]);
      return { success: true };
    } catch (err: any) {
      const cleanOld = oldName.replace(/^remotes\//, '');
      const slashIdx = cleanOld.indexOf('/');
      if (slashIdx !== -1) {
        const remote = cleanOld.substring(0, slashIdx);
        const oldRemoteBranch = cleanOld.substring(slashIdx + 1);
        const newRemoteBranch = newName.startsWith(remote + '/') ? newName.substring(remote.length + 1) : newName;
        
        try {
          await git.raw(['push', remote, `refs/remotes/${cleanOld}:refs/heads/${newRemoteBranch}`]);
          await git.raw(['push', remote, '--delete', oldRemoteBranch]);
          await git.raw(['fetch', remote, '--prune']);
        } catch {
          try {
            await git.raw(['update-ref', `refs/remotes/${remote}/${newRemoteBranch}`, `refs/remotes/${cleanOld}`]);
            await git.raw(['update-ref', '-d', `refs/remotes/${cleanOld}`]);
          } catch {
            throw err;
          }
        }
        return { success: true };
      }
      throw err;
    }
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
    const mime = getImageMimeType(filePath);

    if (mime) {
      let before = '';
      let after = '';

      if (status !== 'D') {
        const buf = await getGitBuffer(repoPath, ['show', `${commitHash}:${filePath}`]);
        if (buf) {
          after = mime === 'image/svg+xml' ? buf.toString('utf8') : `data:${mime};base64,${buf.toString('base64')}`;
        }
      }

      if (status !== 'A') {
        try {
          const parentResult = await git.raw(['rev-list', '--parents', '-n', '1', commitHash]);
          const parents = parentResult.trim().split(/\s+/).slice(1);
          if (parents.length > 0) {
            const parentHash = parents[0];
            const pathBefore = oldPath || filePath;
            const buf = await getGitBuffer(repoPath, ['show', `${parentHash}:${pathBefore}`]);
            if (buf) {
              before = mime === 'image/svg+xml' ? buf.toString('utf8') : `data:${mime};base64,${buf.toString('base64')}`;
            }
          }
        } catch (e) {
          console.warn(`Could not get parent image content for ${filePath} at ${commitHash}`, e);
        }
      }

      return {
        before,
        after,
        isBinary: mime !== 'image/svg+xml'
      };
    }

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

  add: async (repoPath: string, filePath: string | string[]) => {
    const git = getGitInstance(repoPath);
    return await git.add(filePath);
  },

  reset: async (repoPath: string, filePath: string | string[]) => {
    const git = getGitInstance(repoPath);
    const files = Array.isArray(filePath) ? filePath : [filePath];
    return await git.reset(['--', ...files]);
  },

  applyPatch: async (
    repoPath: string,
    patch: string,
    options?: { cached?: boolean; reverse?: boolean }
  ) => {
    const runGitApply = (extraArgs: string[] = []): Promise<string> => {
      return new Promise((resolve, reject) => {
        const args = ['apply', '--whitespace=nowarn', '--recount', '--unidiff-zero', ...extraArgs];
        if (options?.cached) args.push('--cached');
        if (options?.reverse) args.push('--reverse');
        args.push('-');

        const child = execFile('git', args, { cwd: repoPath }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout);
          }
        });

        child.stdin?.write(patch);
        child.stdin?.end();
      });
    };

    try {
      return await runGitApply();
    } catch (err: any) {
      // Retry with --ignore-whitespace (handles whitespace and line endings)
      try {
        return await runGitApply(['--ignore-whitespace']);
      } catch (retryErr: any) {
        try {
          return await runGitApply(['--ignore-space-change']);
        } catch (retryErr2: any) {
          throw new Error(retryErr2.message || retryErr.message || err.message);
        }
      }
    }
  },

  discardChanges: async (repoPath: string, filePath: string | string[], isStaged: boolean) => {
    const git = getGitInstance(repoPath);
    const files = Array.isArray(filePath) ? filePath : [filePath];

    for (const file of files) {
      // Check if the file exists in HEAD
      let existsInHead = false;
      try {
        await git.raw(['cat-file', '-e', `HEAD:${file}`]);
        existsInHead = true;
      } catch (e) {
        existsInHead = false;
      }

      if (existsInHead) {
        if (isStaged) {
          // Discarding staged changes reverts both staged and unstaged edits to match HEAD
          await git.checkout(['HEAD', '--', file]);
        } else {
          // Discarding unstaged changes restores file from index
          await git.checkout(['--', file]);
        }
      } else {
        // Not in HEAD (either untracked, or newly added/staged file)
        if (isStaged) {
          // If staged, unstage it first from index
          try {
            await git.reset(['HEAD', '--', file]);
          } catch (e) {
            await git.reset(['--', file]);
          }
        }
        // Delete the file from filesystem
        const absolutePath = resolve(repoPath, file);
        if (fs.existsSync(absolutePath)) {
          fs.rmSync(absolutePath, { recursive: true, force: true });
        }
      }
    }
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

    // Find all commits from commitHash up to HEAD to see if any tags point to them
    const commitsInSquash: string[] = [];
    try {
      const revListRaw = await git.raw(['rev-list', `${commitHash}~1..HEAD`]);
      revListRaw.split('\n').forEach(h => {
        const trimmed = h.trim();
        if (trimmed) commitsInSquash.push(trimmed);
      });
    } catch (e) {
      // Fallback for initial/parentless commit
      try {
        const revListRaw = await git.raw(['rev-list', 'HEAD']);
        revListRaw.split('\n').forEach(h => {
          const trimmed = h.trim();
          if (trimmed) commitsInSquash.push(trimmed);
        });
      } catch (err2) {
        console.warn('Failed to get rev-list during squash tag collection:', err2);
      }
    }

    // Find tags pointing to any of the commits in commitsInSquash
    const tagsToMove: string[] = [];
    if (commitsInSquash.length > 0) {
      try {
        const showRefRaw = await git.raw(['show-ref', '--tags', '-d']);
        const tagToCommitMap = new Map<string, string>();
        
        showRefRaw.trim().split('\n').forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length === 2) {
            const hash = parts[0];
            let ref = parts[1];
            if (ref.startsWith('refs/tags/')) {
              let tagName = ref.substring('refs/tags/'.length);
              const isDereferenced = tagName.endsWith('^{}');
              if (isDereferenced) {
                tagName = tagName.substring(0, tagName.length - 3);
                tagToCommitMap.set(tagName, hash);
              } else {
                if (!tagToCommitMap.has(tagName)) {
                  tagToCommitMap.set(tagName, hash);
                }
              }
            }
          }
        });

        const squashSet = new Set(commitsInSquash);
        for (const [tagName, targetHash] of tagToCommitMap.entries()) {
          if (squashSet.has(targetHash)) {
            tagsToMove.push(tagName);
          }
        }
      } catch (e) {
        console.warn('Failed to find tags to move during squash:', e);
      }
    }

    // Find the parent of commitHash
    let parentHash = '';
    let isInitialCommit = false;
    try {
      const parentRaw = await git.raw(['rev-parse', `${commitHash}^`]);
      parentHash = parentRaw.trim();
    } catch (err) {
      isInitialCommit = true;
    }

    if (isInitialCommit) {
      // Soft reset to the initial commit
      await git.reset(['--soft', commitHash]);
      // Amend the initial commit with the new squash message and all staged changes
      await git.raw(['commit', '--amend', '-m', message]);
    } else {
      // Soft reset to the parent of the target commit
      await git.reset(['--soft', parentHash]);
      // Commit with the new squash message
      await git.commit(message);
    }

    // Move tags if any were found
    if (tagsToMove.length > 0) {
      try {
        const newHeadRaw = await git.raw(['rev-parse', 'HEAD']);
        const newHeadHash = newHeadRaw.trim();
        for (const tagName of tagsToMove) {
          await git.tag(['-f', tagName, newHeadHash]);
          console.log(`Moved tag ${tagName} to new squashed commit ${newHeadHash}`);
        }
      } catch (e) {
        console.warn('Failed to move tags to new squashed commit:', e);
      }
    }
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
    const mime = getImageMimeType(filePath);

    if (mime) {
      let before = '';
      let after = '';

      if (isUntracked) {
        const buf = await getGitBuffer(repoPath, ['show', `${stashRef}^3:${filePath}`]);
        if (buf) {
          after = mime === 'image/svg+xml' ? buf.toString('utf8') : `data:${mime};base64,${buf.toString('base64')}`;
        }
      } else {
        if (status !== 'D') {
          const buf = await getGitBuffer(repoPath, ['show', `${stashRef}:${filePath}`]);
          if (buf) {
            after = mime === 'image/svg+xml' ? buf.toString('utf8') : `data:${mime};base64,${buf.toString('base64')}`;
          }
        }
        if (status !== 'A') {
          const pathBefore = oldPath || filePath;
          const buf = await getGitBuffer(repoPath, ['show', `${stashRef}^1:${pathBefore}`]);
          if (buf) {
            before = mime === 'image/svg+xml' ? buf.toString('utf8') : `data:${mime};base64,${buf.toString('base64')}`;
          }
        }
      }

      return {
        before,
        after,
        isBinary: mime !== 'image/svg+xml'
      };
    }

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
    const mime = getImageMimeType(filePath);

    if (mime) {
      let before = '';
      let after = '';

      if (isStaged) {
        const bufBefore = await getGitBuffer(repoPath, ['show', `HEAD:${oldPath || filePath}`]);
        if (bufBefore) {
          before = mime === 'image/svg+xml' ? bufBefore.toString('utf8') : `data:${mime};base64,${bufBefore.toString('base64')}`;
        }
        const bufAfter = await getGitBuffer(repoPath, ['show', `:${filePath}`]);
        if (bufAfter) {
          after = mime === 'image/svg+xml' ? bufAfter.toString('utf8') : `data:${mime};base64,${bufAfter.toString('base64')}`;
        } else {
          try {
            const fileBuf = await fs.promises.readFile(join(repoPath, filePath));
            after = mime === 'image/svg+xml' ? fileBuf.toString('utf8') : `data:${mime};base64,${fileBuf.toString('base64')}`;
          } catch {
            after = '';
          }
        }
      } else {
        let bufBefore = await getGitBuffer(repoPath, ['show', `:${filePath}`]);
        if (!bufBefore) {
          bufBefore = await getGitBuffer(repoPath, ['show', `HEAD:${filePath}`]);
        }
        if (bufBefore) {
          before = mime === 'image/svg+xml' ? bufBefore.toString('utf8') : `data:${mime};base64,${bufBefore.toString('base64')}`;
        }
        try {
          const fileBuf = await fs.promises.readFile(join(repoPath, filePath));
          after = mime === 'image/svg+xml' ? fileBuf.toString('utf8') : `data:${mime};base64,${fileBuf.toString('base64')}`;
        } catch {
          after = '';
        }
      }

      return {
        before,
        after,
        isBinary: mime !== 'image/svg+xml'
      };
    }

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
        try {
          const fullPath = join(repoPath, filePath);
          after = await fs.promises.readFile(fullPath, 'utf8');
        } catch (e2) {
          after = '';
        }
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

  getUnpushedTags: async (repoPath: string): Promise<string[]> => {
    const git = getGitInstance(repoPath);
    try {
      const remotes = await git.getRemotes(true);
      if (remotes.length === 0) {
        const tags = await git.tags();
        return tags.all;
      }

      const remoteName = remotes[0].name || 'origin';
      // Pass -c credential.helper= and GIT_TERMINAL_PROMPT=0 to prevent macOS osxkeychain popups
      const lsRemotePromise = git
        .env({ GIT_TERMINAL_PROMPT: '0' })
        .raw(['-c', 'credential.helper=', 'ls-remote', '--tags', remoteName]);
      lsRemotePromise.catch(() => {}); // Suppress dangling rejection on timeout

      const lsRemoteResult = await Promise.race([
        lsRemotePromise,
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500))
      ]);

      const remoteTags = new Set<string>();
      if (lsRemoteResult) {
        lsRemoteResult.split('\n').forEach(line => {
          const parts = line.split('\t');
          if (parts.length === 2) {
            const ref = parts[1].trim();
            if (ref.startsWith('refs/tags/')) {
              let tagName = ref.substring('refs/tags/'.length);
              if (tagName.endsWith('^{}')) {
                tagName = tagName.substring(0, tagName.length - 3);
              }
              remoteTags.add(tagName);
            }
          }
        });
      }

      const localTags = await git.tags();
      return localTags.all.filter(tag => !remoteTags.has(tag));
    } catch (e) {
      return [];
    }
  },

  createTag: async (repoPath: string, tagName: string, target?: string): Promise<void> => {
    const git = getGitInstance(repoPath);
    if (target) {
      await git.tag([tagName, target]);
    } else {
      await git.addTag(tagName);
    }
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
