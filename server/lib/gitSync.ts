/**
 * gitSync.ts — Batched Git Commit & Push Engine
 * WOLF-002: Git commit batching. 30s window. In-memory is authoritative; git is async persistence.
 *
 * Periodically commits changes to the data/ directory and pushes to origin.
 * Never crashes on failure — git is a persistence optimization, not a requirement.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class GitSync {
  private repoDir: string;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingChanges = 0;
  private lastCommit: Date | null = null;
  private enabled: boolean;

  constructor(repoDir: string, intervalMs = 30000, enabled = true) {
    this.repoDir = repoDir;
    this.intervalMs = intervalMs;
    this.enabled = enabled;
  }

  /**
   * Start the batched commit timer.
   */
  start(): void {
    if (!this.enabled) {
      console.log('[gitSync] Disabled via config');
      return;
    }

    if (this.timer) return;

    this.timer = setInterval(async () => {
      await this.commitAndPush();
    }, this.intervalMs);

    console.log(`[gitSync] Started (interval: ${this.intervalMs}ms)`);
  }

  /**
   * Stop the batched commit timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[gitSync] Stopped');
    }
  }

  /**
   * Record that a change was made (increment pending counter).
   */
  recordChange(): void {
    this.pendingChanges++;
  }

  /**
   * Commit all pending changes and push.
   */
  async commitAndPush(): Promise<boolean> {
    if (this.pendingChanges === 0) return false;

    const changeCount = this.pendingChanges;
    this.pendingChanges = 0;

    try {
      // Stage data directory changes
      await execAsync('git add data/', { cwd: this.repoDir });

      // Check if there are actually staged changes
      const { stdout: status } = await execAsync('git diff --cached --name-only', { cwd: this.repoDir });
      if (!status.trim()) {
        return false; // No actual changes
      }

      // Commit
      const msg = `SDM auto-sync: ${changeCount} change${changeCount > 1 ? 's' : ''}`;
      await execAsync(`git commit -m "${msg}"`, { cwd: this.repoDir });

      // Push (async, don't await — non-blocking)
      execAsync('git push origin main', { cwd: this.repoDir })
        .then(() => {
          console.log(`[gitSync] Pushed: ${msg}`);
        })
        .catch((err) => {
          console.error(`[gitSync] Push failed (non-fatal):`, (err as Error).message);
        });

      this.lastCommit = new Date();
      console.log(`[gitSync] Committed: ${msg}`);
      return true;
    } catch (err) {
      console.error(`[gitSync] Commit failed (non-fatal):`, (err as Error).message);
      // Re-add pending changes back
      this.pendingChanges += changeCount;
      return false;
    }
  }

  /**
   * Force an immediate commit + push (used on graceful shutdown).
   */
  async flush(): Promise<void> {
    await this.commitAndPush();
  }

  getStatus(): { enabled: boolean; pendingChanges: number; lastCommit: Date | null } {
    return {
      enabled: this.enabled,
      pendingChanges: this.pendingChanges,
      lastCommit: this.lastCommit,
    };
  }
}
