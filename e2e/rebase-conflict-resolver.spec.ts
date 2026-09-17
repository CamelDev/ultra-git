import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

async function git(repo: string, args: string[], allowFailure = false): Promise<string> {
  try {
    const result = await run('git', ['-C', repo, ...args], { maxBuffer: 4 * 1024 * 1024 });
    return result.stdout;
  } catch (error: any) {
    if (allowFailure) return `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw error;
  }
}

test('rebase fixture reaches two consecutive conflict stops with the same file count', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-git-rebase-e2e-'));
  try {
    await git(repo, ['init', '-b', 'main']);
    await git(repo, ['config', 'user.name', 'UltraGIT E2E']);
    await git(repo, ['config', 'user.email', 'e2e@example.test']);
    fs.writeFileSync(path.join(repo, 'conflict.txt'), 'base\n');
    await git(repo, ['add', '.']);
    await git(repo, ['commit', '-m', 'base']);

    await git(repo, ['checkout', '-b', 'rebased']);
    fs.writeFileSync(path.join(repo, 'conflict.txt'), 'first replay\n');
    await git(repo, ['add', '.']);
    await git(repo, ['commit', '-m', 'replay one']);
    fs.writeFileSync(path.join(repo, 'conflict.txt'), 'second replay\n');
    await git(repo, ['add', '.']);
    await git(repo, ['commit', '-m', 'replay two']);

    await git(repo, ['checkout', 'main']);
    fs.writeFileSync(path.join(repo, 'conflict.txt'), 'onto\n');
    await git(repo, ['add', '.']);
    await git(repo, ['commit', '-m', 'onto change']);
    await git(repo, ['checkout', 'rebased']);

    await git(repo, ['rebase', 'main'], true);
    const first = await git(repo, ['diff', '--name-only', '--diff-filter=U']);
    const firstHead = await git(repo, ['rebase', '--show-current-patch'], true);
    expect(first.trim().split('\n').filter(Boolean)).toEqual(['conflict.txt']);
    expect(firstHead).toContain('replay one');

    fs.writeFileSync(path.join(repo, 'conflict.txt'), 'resolved first\n');
    await git(repo, ['add', 'conflict.txt']);
    await git(repo, ['-c', 'core.editor=true', 'rebase', '--continue'], true);

    const second = await git(repo, ['diff', '--name-only', '--diff-filter=U']);
    const secondHead = await git(repo, ['rebase', '--show-current-patch'], true);
    expect(second.trim().split('\n').filter(Boolean)).toEqual(['conflict.txt']);
    expect(secondHead).toContain('replay two');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
