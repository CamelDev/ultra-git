import { execSync } from 'child_process';

/**
 * Fixes process.env.PATH on macOS and Linux systems by loading paths
 * from the user's login shell and merging them. This prevents command
 * execution failures for CLI tools (like git-lfs) installed in Homebrew
 * or custom locations.
 */
export function fixPath(): void {
  if (process.platform === 'win32') return;

  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  
  try {
    // Run the shell as a login shell and print the PATH
    const stdout = execSync(`${shell} -l -c 'echo "$PATH"'`, {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }
    });
    
    const shellPath = stdout.trim();
    if (shellPath) {
      const existingPaths = (process.env.PATH || '').split(':');
      const newPaths = shellPath.split(':');
      const combined = Array.from(new Set([...newPaths, ...existingPaths])).filter(Boolean).join(':');
      process.env.PATH = combined;
      console.log('[fixPath] Successfully loaded and merged PATH from login shell:', process.env.PATH);
      return;
    }
  } catch (err) {
    console.error('[fixPath] Failed to retrieve PATH from login shell:', err);
  }

  // Fallback: Prepend common paths if shell execution fails or returns empty
  const commonPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];
  const existingPaths = (process.env.PATH || '').split(':');
  const combined = Array.from(new Set([...commonPaths, ...existingPaths])).filter(Boolean).join(':');
  process.env.PATH = combined;
  console.log('[fixPath] Fallback applied. Combined PATH:', process.env.PATH);
}
