/*
 * CONTINUITY BACKGROUND WORKER
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * Background worker for Master Continuity Layer
 * Runs reflection engine periodically in Shadow Mode
 */

const { runReflectionEngine } = require('../lib/master-continuity-engine');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════════
// CONTINUITY WORKER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const WORKER_CONFIG = {
  // Reflection processing intervals
  HOURLY_REFLECTION: {
    interval: 60 * 60 * 1000, // 1 hour
    lookback_hours: 2,
    enabled: true
  },

  DAILY_DEEP_REFLECTION: {
    interval: 6 * 60 * 60 * 1000, // 6 hours
    lookback_hours: 24,
    enabled: true
  },

  WEEKLY_SYNTHESIS: {
    interval: 24 * 60 * 60 * 1000, // 24 hours
    lookback_hours: 168, // 1 week
    enabled: false // Disabled for now
  }
};

// Default user for development (TODO: Handle multiple users)
const DEFAULT_USER_ID = process.env.CONTINUITY_DEFAULT_USER || 'default';

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

class ContinuityWorker {
  constructor() {
    this.isRunning = false;
    this.scheduledTasks = new Map();
    this.executionStats = new Map();
    this.startTime = null;
  }

  /**
   * Start the continuity worker
   */
  async start() {
    if (this.isRunning) {
      console.log('[Continuity Worker] Already running');
      return;
    }

    console.log('[Continuity Worker] === STARTING MASTER CONTINUITY WORKER ===');
    this.isRunning = true;
    this.startTime = new Date();

    // Initialize execution tracking
    Object.keys(WORKER_CONFIG).forEach(key => {
      const config = WORKER_CONFIG[key];
      if (config.enabled) {
        this.executionStats.set(key, {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          lastSuccess: null,
          lastFailure: null,
          averageDuration: 0
        });
      }
    });

    // Schedule enabled tasks
    await this.scheduleAllTasks();

    // Run initial check
    await this.performInitialCheck();

    console.log('[Continuity Worker] Continuity worker started successfully');
  }

  /**
   * Stop the continuity worker
   */
  async stop() {
    if (!this.isRunning) {
      console.log('[Continuity Worker] Not running');
      return;
    }

    console.log('[Continuity Worker] === STOPPING CONTINUITY WORKER ===');
    this.isRunning = false;

    // Clear all scheduled tasks
    this.scheduledTasks.forEach((intervalId, taskName) => {
      clearInterval(intervalId);
      console.log(`[Continuity Worker] Stopped ${taskName}`);
    });

    this.scheduledTasks.clear();
    console.log('[Continuity Worker] Continuity worker stopped');
  }

  /**
   * Schedule all enabled tasks
   */
  async scheduleAllTasks() {
    for (const [taskName, config] of Object.entries(WORKER_CONFIG)) {
      if (config.enabled) {
        await this.scheduleTask(taskName, config);
      }
    }
  }

  /**
   * Schedule a specific task
   */
  async scheduleTask(taskName, config) {
    console.log(`[Continuity Worker] Scheduling ${taskName} every ${config.interval / 1000}s`);

    const intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.executeScheduledTask(taskName, config);
      }
    }, config.interval);

    this.scheduledTasks.set(taskName, intervalId);
  }

  /**
   * Execute a scheduled task
   */
  async executeScheduledTask(taskName, config) {
    const startTime = Date.now();
    const stats = this.executionStats.get(taskName);

    try {
      console.log(`[Continuity Worker] Executing ${taskName} (lookback: ${config.lookback_hours}h)`);

      stats.totalExecutions++;

      const result = await runReflectionEngine(DEFAULT_USER_ID, {
        lookbackHours: config.lookback_hours
      });

      const duration = Date.now() - startTime;

      if (result && result.success) {
        stats.successfulExecutions++;
        stats.lastSuccess = new Date();
        stats.averageDuration = Math.round(
          (stats.averageDuration * (stats.successfulExecutions - 1) + duration) / stats.successfulExecutions
        );
        console.log(`[Continuity Worker] ✓ ${taskName} completed: ${result.processed} interactions, ${result.reflections} staged`);
      } else {
        throw new Error(result?.error || 'Task completed with failure status');
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      stats.failedExecutions++;
      stats.lastFailure = new Date();

      console.error(`[Continuity Worker] ✗ ${taskName} failed after ${duration}ms:`, error.message);
    }
  }

  /**
   * Perform initial system check
   */
  async performInitialCheck() {
    try {
      console.log('[Continuity Worker] Performing initial system check...');

      // Test basic reflection engine functionality
      const testResult = await runReflectionEngine(DEFAULT_USER_ID, {
        lookbackHours: 1 // Just look at recent interactions
      });

      if (testResult.success) {
        console.log(`[Continuity Worker] ✓ Initial check completed`);
      } else {
        console.log(`[Continuity Worker] ⚠ Initial check issues: ${testResult.error}`);
      }

    } catch (error) {
      console.error('[Continuity Worker] Initial check failed:', error.message);
    }
  }

  /**
   * Get worker statistics
   */
  getStats() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    return {
      isRunning: this.isRunning,
      uptime_ms: uptime,
      uptime_hours: Math.round(uptime / (1000 * 60 * 60) * 10) / 10,
      scheduled_tasks: this.scheduledTasks.size,
      execution_stats: Object.fromEntries(this.executionStats)
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON WORKER INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

const worker = new ContinuityWorker();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Continuity Worker] Received shutdown signal...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Continuity Worker] Received termination signal...');
  await worker.stop();
  process.exit(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT WORKER
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  worker,
  ContinuityWorker,
  WORKER_CONFIG
};

// If run directly, start the continuity worker
if (require.main === module) {
  console.log('[Continuity Worker] Starting Master Continuity Layer background worker...');

  worker.start()
    .then(() => {
      console.log('[Continuity Worker] Worker is now running continuously');
      console.log('[Continuity Worker] Press Ctrl+C to stop gracefully');

      // Status reporting every hour
      setInterval(() => {
        if (worker.isRunning) {
          const stats = worker.getStats();
          console.log(`[Continuity Worker] Status: Running for ${stats.uptime_hours}h, ${stats.scheduled_tasks} tasks active`);
        }
      }, 60 * 60 * 1000);
    })
    .catch(error => {
      console.error('[Continuity Worker] Failed to start:', error.message);
      process.exit(1);
    });
}