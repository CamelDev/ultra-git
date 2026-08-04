import { describe, test, expect, mock, beforeEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Unit tests for gitService.pullPreflight / gitService.smartPull.
 * simple-git is mocked at the module level; each test programs the raw/status
 * responses it needs and asserts on the typed results and call ordering.
 */

const calls: string[][] = [];
let rawHandler: (args: string[]) => string | Promise<string>;
let statusHandler: () => any;
let fetchError: Error | null = null;

const fakeGit = {
  raw: async (args: string[]) => {
    calls.push(args);
    return rawHandler(args);
  },
  status: async () => statusHandler(),
  fetch: async () => {
    if (fetchError) throw fetchError;
  }
};

mock.module('simple-git', () => ({ default: () => fakeGit }));

const { gitService } = await import('../git');

const UPSTREAM = 'origin/main';

const defaultRaw = (args: string[]): string => {
  const cmd = args.join(' ');
  if (cmd === 'rev-parse --git-dir') return '.git';
  if (cmd === `rev-parse --abbrev-ref --symbolic-full-name @{upstream}`) return UPSTREAM;
  if (cmd === `rev-list --left-right --count HEAD...${UPSTREAM}`) return '0\t1';
  if (cmd === `diff --name-only HEAD...${UPSTREAM}`) return '';
  if (cmd === 'status --porcelain=v1') return '';
  throw new Error(`Unexpected git raw call: ${cmd}`);
};

const cleanStatus = () => ({ files: [], conflicted: [], tracking: UPSTREAM });

beforeEach(() => {
  calls.length = 0;
  rawHandler = defaultRaw;
  statusHandler = cleanStatus;
  fetchError = null;
});

const callsMatching = (prefix: string[]) =>
  calls.filter((c) => prefix.every((p, i) => c[i] === p));

// ---------------------------------------------------------------------------
// pullPreflight
// ---------------------------------------------------------------------------

describe('pullPreflight', () => {
  test('reports NO_UPSTREAM when the branch has no tracking ref', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === 'rev-parse --git-dir') return '.git';
      if (cmd.includes('@{upstream}')) throw new Error('fatal: no upstream configured for branch');
      return defaultRaw(args);
    };

    const plan = await gitService.pullPreflight('/tmp/repo-no-upstream');
    expect(plan.ok).toBe(false);
    expect(plan.blocker).toBe('NO_UPSTREAM');
  });

  test('reports FETCH_FAILED when the remote is unreachable', async () => {
    fetchError = new Error('fatal: unable to access: Could not resolve host');
    const plan = await gitService.pullPreflight('/tmp/repo-offline');
    expect(plan.ok).toBe(false);
    expect(plan.blocker).toBe('FETCH_FAILED');
    expect(plan.detail).toContain('Could not resolve host');
  });

  test('reports MERGE_IN_PROGRESS when MERGE_HEAD exists', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ultragit-preflight-'));
    try {
      fs.mkdirSync(path.join(tmp, '.git'));
      fs.writeFileSync(path.join(tmp, '.git', 'MERGE_HEAD'), 'abc123\n');
      const plan = await gitService.pullPreflight(tmp);
      expect(plan.ok).toBe(false);
      expect(plan.blocker).toBe('MERGE_IN_PROGRESS');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detects overlap between tracked changes and incoming files (needsStash)', async () => {
    statusHandler = () => ({
      files: [
        { path: 'src/a.ts', index: 'M', working_dir: ' ' },   // staged, overlaps
        { path: 'src/local.ts', index: ' ', working_dir: 'M' }, // unstaged, no overlap
        { path: 'notes.txt', index: '?', working_dir: '?' }     // untracked, no overlap
      ],
      conflicted: []
    });
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === `rev-list --left-right --count HEAD...${UPSTREAM}`) return '2\t3';
      if (cmd === `diff --name-only HEAD...${UPSTREAM}`) return 'src/a.ts\nsrc/other.ts';
      return defaultRaw(args);
    };

    const plan = await gitService.pullPreflight('/tmp/repo-overlap');
    expect(plan.ok).toBe(true);
    expect(plan.ahead).toBe(2);
    expect(plan.behind).toBe(3);
    expect(plan.diverged).toBe(true);
    expect(plan.dirtyKind).toBe('tracked-dirty');
    expect(plan.hasStaged).toBe(true);
    expect(plan.changedFiles.sort()).toEqual(['src/a.ts', 'src/local.ts']);
    expect(plan.untrackedFiles).toEqual(['notes.txt']);
    expect(plan.overlappingFiles).toEqual(['src/a.ts']);
    expect(plan.needsStash).toBe(true);
  });

  test('detects untracked-file collisions with incoming files', async () => {
    statusHandler = () => ({
      files: [{ path: 'config.json', index: '?', working_dir: '?' }],
      conflicted: []
    });
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === `diff --name-only HEAD...${UPSTREAM}`) return 'config.json';
      return defaultRaw(args);
    };

    const plan = await gitService.pullPreflight('/tmp/repo-untracked');
    expect(plan.dirtyKind).toBe('untracked-only');
    expect(plan.hasStaged).toBe(false);
    expect(plan.overlappingFiles).toEqual(['config.json']);
    expect(plan.needsStash).toBe(true);
  });

  test('reports a clean, fast-forwardable pull when nothing overlaps', async () => {
    statusHandler = () => ({
      files: [{ path: 'src/local.ts', index: ' ', working_dir: 'M' }],
      conflicted: []
    });
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === `rev-list --left-right --count HEAD...${UPSTREAM}`) return '0\t2';
      if (cmd === `diff --name-only HEAD...${UPSTREAM}`) return 'src/remote.ts';
      return defaultRaw(args);
    };

    const plan = await gitService.pullPreflight('/tmp/repo-safe');
    expect(plan.ok).toBe(true);
    expect(plan.needsStash).toBe(false);
    expect(plan.canFastForward).toBe(true);
    expect(plan.diverged).toBe(false);
    expect(plan.dirtyKind).toBe('tracked-dirty');
    expect(plan.incomingFiles).toEqual(['src/remote.ts']);
  });

  test('canFastForward is false when the branch has diverged (ahead > 0)', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === `rev-list --left-right --count HEAD...${UPSTREAM}`) return '1\t1';
      return defaultRaw(args);
    };
    const plan = await gitService.pullPreflight('/tmp/repo-diverged');
    expect(plan.canFastForward).toBe(false);
    expect(plan.diverged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// smartPull
// ---------------------------------------------------------------------------

describe('smartPull', () => {
  test('short-circuits with up-to-date when behind is 0', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === `rev-list --left-right --count HEAD...${UPSTREAM}`) return '2\t0';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-uptodate', { stash: true });
    expect(result.status).toBe('up-to-date');
    expect(callsMatching(['pull']).length).toBe(0);
    expect(callsMatching(['stash', 'push']).length).toBe(0);
  });

  test('fails with NO_UPSTREAM when there is no tracking branch', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd === 'rev-parse --git-dir') return '.git';
      if (cmd.includes('@{upstream}')) throw new Error('fatal: no upstream');
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-no-upstream');
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('NO_UPSTREAM');
    expect(result.stashedChanges).toBe(false);
  });

  test('success: stash → pull (merge, prune) → pop, in order', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state On main: ultra-git: auto-stash before pull';
      if (cmd.startsWith('pull')) return '';
      if (cmd.startsWith('stash pop')) return 'Dropped refs/stash@{0}';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-success', { stash: true, prune: true });
    expect(result.status).toBe('success');
    expect(result.stashedChanges).toBe(false);

    const stashPush = calls.findIndex((c) => c[0] === 'stash' && c[1] === 'push');
    const pull = calls.findIndex((c) => c[0] === 'pull');
    const pop = calls.findIndex((c) => c[0] === 'stash' && c[1] === 'pop');
    expect(stashPush).toBeGreaterThanOrEqual(0);
    expect(pull).toBeGreaterThan(stashPush);
    expect(pop).toBeGreaterThan(pull);

    const pullArgs = calls[pull];
    expect(pullArgs).toContain('--no-edit');
    expect(pullArgs).toContain('--no-rebase');
    expect(pullArgs).toContain('--prune');

    const stashArgs = calls[stashPush];
    expect(stashArgs).toContain('--include-untracked');
  });

  test('respects the rebase strategy and skips stashing when disabled', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('pull')) return '';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-rebase', { strategy: 'rebase', stash: false, prune: false });
    expect(result.status).toBe('success');
    const pull = callsMatching(['pull'])[0];
    expect(pull).toContain('--rebase');
    expect(pull).not.toContain('--prune');
    expect(callsMatching(['stash', 'push']).length).toBe(0);
  });

  test('does not treat "No local changes to save" as a created stash', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'No local changes to save';
      if (cmd.startsWith('pull')) return '';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-empty-stash', { stash: true });
    expect(result.status).toBe('success');
    expect(callsMatching(['stash', 'pop']).length).toBe(0);
  });

  test('merge-conflicts: keeps the pre-pull stash and reports conflicted files', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) throw new Error('CONFLICT (content): Merge conflict in src/a.ts\nAutomatic merge failed; fix conflicts and then commit the result.');
      if (cmd === 'status --porcelain=v1') return 'UU src/a.ts';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-conflict', { stash: true });
    expect(result.status).toBe('merge-conflicts');
    expect(result.conflictedFiles).toEqual([{ path: 'src/a.ts', status: 'UU' }]);
    expect(result.stashedChanges).toBe(true);
    expect(result.stashRef).toBe('stash@{0}');
    // stash is intentionally NOT popped onto a conflicted tree
    expect(callsMatching(['stash', 'pop']).length).toBe(0);
  });

  // simple-git's raw() RESOLVES with output when git exits with code 1 —
  // merge conflicts must be detected from the output text / repo state,
  // not only from thrown errors. This mirrors the real runtime behavior.
  test('merge-conflicts detected when pull RESOLVES with conflict output (exit code 1)', async () => {
    statusHandler = () => ({ files: [{ path: 'src/a.ts', index: 'U', working_dir: 'U' }], conflicted: ['src/a.ts'] });
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) return 'Auto-merging src/a.ts\nCONFLICT (content): Merge conflict in src/a.ts\nAutomatic merge failed; fix conflicts and then commit the result.\n';
      if (cmd === 'status --porcelain=v1') return 'UU src/a.ts';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-conflict-resolve', { stash: true });
    expect(result.status).toBe('merge-conflicts');
    expect(result.conflictedFiles).toEqual([{ path: 'src/a.ts', status: 'UU' }]);
    expect(result.stashedChanges).toBe(true);
    expect(callsMatching(['stash', 'pop']).length).toBe(0);
  });

  test('dirty-overlap refusal detected when pull RESOLVES with the error output (exit code 1)', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) return 'error: Your local changes to the following files would be overwritten by merge:\n\tsrc/a.ts\nPlease commit your changes or stash them before you merge.\nAborting\n';
      if (cmd.startsWith('stash pop')) return 'Dropped refs/stash@{0}';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-dirty-overwrite', { stash: true });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('DIRTY_OVERLAP');
    // stash restored before returning
    expect(result.stashedChanges).toBe(false);
    expect(callsMatching(['stash', 'pop']).length).toBe(1);
  });

  test('stash-pop-conflicts: pull succeeded but re-applying the stash conflicted', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) return '';
      if (cmd === 'stash pop stash@{0}') throw new Error('CONFLICT (content): Merge conflict in src/a.ts');
      if (cmd === 'status --porcelain=v1') return 'UU src/a.ts';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-pop-conflict', { stash: true });
    expect(result.status).toBe('stash-pop-conflicts');
    expect(result.conflictedFiles).toEqual([{ path: 'src/a.ts', status: 'UU' }]);
    expect(result.stashedChanges).toBe(true);
    expect(result.stashRef).toBe('stash@{0}');
  });

  test('stash-pop failure (e.g. untracked restore) keeps the stash and reports re-apply conflicts', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) return '';
      if (cmd.startsWith('stash pop')) throw new Error('error: could not restore untracked files from stash');
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-pop-fail', { stash: true });
    expect(result.status).toBe('stash-pop-conflicts');
    expect(result.stashedChanges).toBe(true);
    expect(result.stashRef).toBe('stash@{0}');
    expect(result.detail).toContain('could not restore untracked files');
  });

  test('FF_ONLY_DIVERGED: restores the stash before returning', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) throw new Error('fatal: Not possible to fast-forward, aborting.');
      if (cmd.startsWith('stash pop')) return 'Dropped refs/stash@{0}';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-ff', { strategy: 'ff-only', stash: true });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('FF_ONLY_DIVERGED');
    expect(result.stashedChanges).toBe(false);
    expect(callsMatching(['stash', 'pop']).length).toBe(1);
  });

  test('UNRELATED_HISTORIES is mapped from git output', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('pull')) throw new Error('fatal: refusing to merge unrelated histories');
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-unrelated', { stash: false });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('UNRELATED_HISTORIES');
  });

  test('STASH_FAILED: pull is never started when the stash step fails', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) throw new Error('error: cannot stash');
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-stash-fail', { stash: true });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('STASH_FAILED');
    expect(callsMatching(['pull']).length).toBe(0);
  });

  test('unknown pull failures restore the stash and report the raw detail', async () => {
    rawHandler = (args) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('stash push')) return 'Saved working directory and index state';
      if (cmd.startsWith('pull')) throw new Error('error: something completely unexpected');
      if (cmd.startsWith('stash pop')) return 'Dropped refs/stash@{0}';
      return defaultRaw(args);
    };

    const result = await gitService.smartPull('/tmp/repo-unknown', { stash: true });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('UNKNOWN');
    expect(result.detail).toContain('something completely unexpected');
    expect(result.stashedChanges).toBe(false);
    expect(callsMatching(['stash', 'pop']).length).toBe(1);
  });
});
