import { watch, FSWatcher } from 'fs';

let currentWatcher: FSWatcher | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;
let isPaused = false;
let pendingChangeWhilePaused = false;
let savedOnChange: (() => void) | null = null;

/**
 * Pause emitting change events from the active watcher (e.g. during mutating git operations).
 */
export function pauseWatching(): void {
  isPaused = true;
}

/**
 * Resume emitting change events. If changes occurred while paused, trigger a debounced onChange.
 */
export function resumeWatching(triggerPending = true): void {
  isPaused = false;
  if (pendingChangeWhilePaused) {
    pendingChangeWhilePaused = false;
    if (triggerPending && savedOnChange) {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(() => {
        savedOnChange?.();
      }, 300);
    }
  }
}

/**
 * Check if the watcher is currently paused.
 */
export function isWatchingPaused(): boolean {
  return isPaused;
}

/**
 * Start watching a directory for changes.
 * Closes the previous watcher if one exists.
 */
export function watchDirectory(dirPath: string, onChange: () => void): void {
  if (currentWatcher) {
    try {
      currentWatcher.close();
    } catch (e) {
      console.error('Error closing previous watcher:', e);
    }
    currentWatcher = null;
  }

  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  isPaused = false;
  pendingChangeWhilePaused = false;
  savedOnChange = onChange;

  console.log(`Starting FS watcher for: ${dirPath}`);

  try {
    currentWatcher = watch(dirPath, { recursive: true }, (_eventType, filename) => {
      if (filename) {
        const normalized = filename.replace(/\\/g, '/');
        // Ignore files in .git, node_modules, and other build/tooling folders
        const isIgnored =
          normalized.startsWith('.git/') ||
          normalized === '.git' ||
          normalized.startsWith('node_modules/') ||
          normalized === 'node_modules' ||
          normalized.startsWith('.agents/') ||
          normalized === '.agents' ||
          normalized.startsWith('.planning/') ||
          normalized === '.planning' ||
          normalized.startsWith('dist/') ||
          normalized === 'dist' ||
          normalized.startsWith('out/') ||
          normalized === 'out' ||
          normalized.startsWith('test-results/') ||
          normalized === 'test-results' ||
          normalized.startsWith('playwright-report/') ||
          normalized === 'playwright-report' ||
          normalized.endsWith('.log');

        if (isIgnored) {
          return;
        }
      }

      if (isPaused) {
        pendingChangeWhilePaused = true;
        return;
      }

      // Debounce the change notification to prevent CPU/event storms
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(() => {
        onChange();
      }, 300);
    });

    currentWatcher.on('error', (err) => {
      console.error(`FSWatcher error for ${dirPath}:`, err);
    });
  } catch (err) {
    console.error(`Failed to watch directory ${dirPath}:`, err);
  }
}

/**
 * Stop the current filesystem watcher.
 */
export function stopWatching(): void {
  if (currentWatcher) {
    console.log('Stopping active FS watcher.');
    try {
      currentWatcher.close();
    } catch (e) {
      console.error('Error closing FS watcher:', e);
    }
    currentWatcher = null;
  }
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }
  isPaused = false;
  pendingChangeWhilePaused = false;
  savedOnChange = null;
}
