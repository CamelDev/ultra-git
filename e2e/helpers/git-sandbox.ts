import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * High-fidelity Git Sandbox utility for E2E tests.
 * Initializes and manages authentic, isolated local Git repositories inside `test-results/`.
 */
export class GitSandbox {
  public dir: string;
  public git: SimpleGit;

  constructor() {
    const uuid = crypto.randomUUID();
    this.dir = path.join(__dirname, '../../test-results', `sandbox-${uuid}`);
    
    // Create the isolated sandbox directory
    fs.mkdirSync(this.dir, { recursive: true });
    this.git = simpleGit(this.dir);
  }

  /**
   * Initializes a real Git repository and configures local user settings
   * to guarantee that global/user Git configurations are never modified.
   */
  async init(): Promise<void> {
    await this.git.init();
    
    // Enforce local-only config parameters
    await this.git.addConfig('user.name', 'Test User', false, 'local');
    await this.git.addConfig('user.email', 'test@example.com', false, 'local');
    
    // Create initial commit so we have a valid HEAD and default branch (e.g. main/master)
    fs.writeFileSync(path.join(this.dir, 'README.md'), '# Test Sandbox Repo\n');
    await this.git.add('README.md');
    await this.git.commit('Initial commit');
  }

  /**
   * Programmatically creates a file and commits it to the repository.
   */
  async createCommit(filename: string, content: string, message: string): Promise<void> {
    const filePath = path.join(this.dir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    await this.git.add(filename);
    await this.git.commit(message);
  }

  /**
   * Creates and checks out a new local branch.
   */
  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
  }

  /**
   * Checkouts an existing branch.
   */
  async checkoutBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
  }

  /**
   * Creates a local tag.
   */
  async createTag(tagName: string, message?: string): Promise<void> {
    if (message) {
      await this.git.addAnnotatedTag(tagName, message);
    } else {
      await this.git.addTag(tagName);
    }
  }

  /**
   * Modifies a file and stashes the changes.
   */
  async createStash(message: string): Promise<void> {
    fs.appendFileSync(path.join(this.dir, 'README.md'), `\n// stash changes: ${message}\n`);
    await this.git.stash(['push', '-m', message]);
  }

  async destroy(): Promise<void> {
    // Give Windows a brief moment to release any pending file handles from recent Git operations
    await new Promise(resolve => setTimeout(resolve, 100));
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        fs.rmSync(this.dir, { recursive: true, force: true });
        return; // Success!
      } catch (error: any) {
        if (attempt === 3) {
          console.warn(`Failed to recursively delete GitSandbox folder at ${this.dir} after 3 attempts:`, error);
        } else {
          // Wait longer before retrying
          await new Promise(resolve => setTimeout(resolve, 200 * attempt));
        }
      }
    }
  }
}
