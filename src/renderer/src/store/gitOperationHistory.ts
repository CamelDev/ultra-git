/**
 * gitOperationHistory.ts
 *
 * In-memory, per-repository undo/redo stack for reversible git operations.
 * Uses the Command pattern: each entry stores an undo closure and a redo
 * closure that call the actual git IPC handlers.
 *
 * The history is session-only — it is cleared when the app restarts.
 */

export interface GitOperation {
  /** Short, human-readable description shown in tooltips and toasts */
  label: string;
  /** The repository this operation belongs to */
  repoPath: string;
  /** Runs the inverse git command to reverse the operation */
  undo: () => Promise<void>;
  /** Re-runs the original git command to redo the operation */
  redo: () => Promise<void>;
}

interface RepoHistory {
  undoStack: GitOperation[];
  redoStack: GitOperation[];
}

/**
 * Manages undo/redo stacks independently for each open repository.
 * Operations are stored as closures — no git state is serialised.
 */
export class GitOperationHistory {
  private histories = new Map<string, RepoHistory>();
  private readonly maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  private getOrCreate(repoPath: string): RepoHistory {
    if (!this.histories.has(repoPath)) {
      this.histories.set(repoPath, { undoStack: [], redoStack: [] });
    }
    return this.histories.get(repoPath)!;
  }

  /**
   * Push a new operation onto the undo stack and clear the redo stack.
   * Should be called immediately after a successful git operation.
   */
  push(op: GitOperation): void {
    const h = this.getOrCreate(op.repoPath);
    h.undoStack.push(op);
    // Trim to max depth from the bottom (oldest entries)
    if (h.undoStack.length > this.maxDepth) {
      h.undoStack.shift();
    }
    // A new operation invalidates the redo stack
    h.redoStack = [];
  }

  /**
   * Undo the most recent operation for a given repo.
   * @returns the label of the undone operation, or null if nothing to undo
   */
  async undo(repoPath: string): Promise<string | null> {
    const h = this.getOrCreate(repoPath);
    const op = h.undoStack.pop();
    if (!op) return null;
    await op.undo();
    h.redoStack.push(op);
    return op.label;
  }

  /**
   * Redo the most recently undone operation for a given repo.
   * @returns the label of the redone operation, or null if nothing to redo
   */
  async redo(repoPath: string): Promise<string | null> {
    const h = this.getOrCreate(repoPath);
    const op = h.redoStack.pop();
    if (!op) return null;
    await op.redo();
    h.undoStack.push(op);
    return op.label;
  }

  canUndo(repoPath: string): boolean {
    return (this.histories.get(repoPath)?.undoStack.length ?? 0) > 0;
  }

  canRedo(repoPath: string): boolean {
    return (this.histories.get(repoPath)?.redoStack.length ?? 0) > 0;
  }

  /** Returns the label of the next operation to be undone, or null */
  undoLabel(repoPath: string): string | null {
    const stack = this.histories.get(repoPath)?.undoStack;
    return stack && stack.length > 0 ? stack[stack.length - 1].label : null;
  }

  /** Returns the label of the next operation to be redone, or null */
  redoLabel(repoPath: string): string | null {
    const stack = this.histories.get(repoPath)?.redoStack;
    return stack && stack.length > 0 ? stack[stack.length - 1].label : null;
  }

  /** Wipe both stacks for a given repository (e.g. on hard reset or repo switch) */
  clear(repoPath: string): void {
    this.histories.delete(repoPath);
  }
}

/** Singleton shared across the entire renderer process */
export const gitHistory = new GitOperationHistory(50);
