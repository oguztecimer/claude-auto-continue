import * as pty from 'node-pty';
import { PatternDetector, LimitEvent } from './PatternDetector.js';
import { Scheduler } from './Scheduler.js';
import { StdinWriter } from './StdinWriter.js';

/**
 * Four-state machine for the PTY session lifecycle:
 *
 *   RUNNING        — normal operation, forwarding I/O and feeding PatternDetector
 *   LIMIT_DETECTED — transient: rate limit seen, calling scheduler.scheduleAt()
 *   WAITING        — blocked: scheduler is counting down to reset time
 *   RESUMING       — transient: sending resume sequence to PTY, resetting detector
 *
 * Transitions: RUNNING -> LIMIT_DETECTED -> WAITING -> RESUMING -> RUNNING
 */
export const enum SessionState {
  RUNNING = 'RUNNING',
  LIMIT_DETECTED = 'LIMIT_DETECTED',
  WAITING = 'WAITING',
  RESUMING = 'RESUMING',
}

export interface ProcessSupervisorOptions {
  /** Override node-pty spawn function for testing (dependency injection) */
  spawnFn?: typeof pty.spawn;
  /** Cooldown after resume — suppresses false-positive re-detections. Default: 30000ms */
  cooldownMs?: number;
  /** Safety buffer added to reset time before resuming. Default: 5000ms */
  safetyMs?: number;
  /** Override process.exit for testing. Default: process.exit */
  onExit?: (code: number) => void;
}

/**
 * ProcessSupervisor — the core PTY orchestrator.
 *
 * Spawns Claude Code in a real PTY, passes all I/O transparently, detects
 * usage-limit messages via PatternDetector, waits via Scheduler, and
 * auto-resumes via StdinWriter.
 */
export class ProcessSupervisor {
  readonly #spawnFn: typeof pty.spawn;
  readonly #cooldownMs: number;
  readonly #detector: PatternDetector;
  readonly #scheduler: Scheduler;
  readonly #onExitCallback: (code: number) => void;

  #state: SessionState = SessionState.RUNNING;
  #writer: StdinWriter | null = null;
  #cooldownUntil = 0;

  constructor(options: ProcessSupervisorOptions = {}) {
    this.#spawnFn = options.spawnFn ?? pty.spawn;
    this.#cooldownMs = options.cooldownMs ?? 30_000;
    this.#detector = new PatternDetector();
    this.#scheduler = new Scheduler(options.safetyMs ?? 5_000);
    this.#onExitCallback = options.onExit ?? ((code: number) => process.exit(code));

    // Listen for rate-limit detections
    this.#detector.on('limit', (event: LimitEvent) => this.#onLimitDetected(event));
  }

  /** Current session state — exposed for Phase 3 status display and testing */
  get state(): SessionState {
    return this.#state;
  }

  /**
   * Spawn the given command in a PTY and wire up all I/O.
   *
   * @param command - executable to run (e.g. 'claude')
   * @param args    - CLI arguments (e.g. ['--continue'])
   */
  spawn(command: string, args: string[]): void {
    const ptyProcess = this.#spawnFn(command, args, {
      name: process.env['TERM'] ?? 'xterm-256color',
      cols: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.#writer = new StdinWriter(ptyProcess);

    // --- PTY output: pass to stdout, optionally feed detector ---
    ptyProcess.onData((data: string) => {
      process.stdout.write(data);
      // Only feed the detector when RUNNING — ignore output in all other states
      if (this.#state === SessionState.RUNNING) {
        this.#detector.feed(data);
      }
    });

    // --- PTY exit: clean up and exit ---
    ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
      this.#writer!.markDead();
      this.#scheduler.cancel();
      // Allow Node.js event loop to drain (stdin will no longer hold the process open)
      if (process.stdin.isTTY) {
        process.stdin.unref();
      }
      this.#onExitCallback(e.exitCode ?? 0);
    });

    // --- Stdin forwarding (only in a real TTY environment) ---
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (chunk: Buffer) => {
        // Forward keystrokes to PTY only during RUNNING state
        if (this.#state === SessionState.RUNNING) {
          this.#writer!.write(chunk.toString('binary'));
        }
        // Silently discard during WAITING / RESUMING / LIMIT_DETECTED
      });
    }

    // --- Terminal resize forwarding ---
    process.stdout.on('resize', () => {
      ptyProcess.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
    });
  }

  /**
   * Called when PatternDetector emits a 'limit' event.
   * Transitions: RUNNING -> LIMIT_DETECTED -> WAITING
   */
  #onLimitDetected(event: LimitEvent): void {
    // Suppress false positives during post-resume cooldown
    if (Date.now() < this.#cooldownUntil) {
      return;
    }

    this.#state = SessionState.LIMIT_DETECTED;
    process.stderr.write(
      `[SessionState] LIMIT_DETECTED (resets: ${event.resetTime?.toISOString() ?? 'unknown'})\n`
    );

    // Schedule the resume callback
    this.#scheduler.scheduleAt(event.resetTime, () => this.#onResumeReady());

    this.#state = SessionState.WAITING;
    process.stderr.write('[SessionState] WAITING\n');
  }

  /**
   * Called by Scheduler when the reset time has elapsed.
   * Transitions: WAITING -> RESUMING -> RUNNING
   */
  #onResumeReady(): void {
    this.#state = SessionState.RESUMING;
    process.stderr.write('[SessionState] RESUMING\n');

    // Send Escape to dismiss any rate-limit UI overlay
    this.#writer!.write('\x1b');
    // Type "continue" and press Enter to resume the session
    this.#writer!.write('continue\r');

    // Arm cooldown to suppress the false-positive re-detection that can occur
    // immediately after resume (Claude Code issue #14129)
    this.#cooldownUntil = Date.now() + this.#cooldownMs;

    // Re-arm the detector for the next potential rate-limit cycle
    this.#detector.reset();

    this.#state = SessionState.RUNNING;
    process.stderr.write('[SessionState] RUNNING\n');
  }

  /**
   * Gracefully shut down: cancel pending timer, mark writer dead, kill PTY.
   */
  shutdown(): void {
    this.#scheduler.cancel();
    if (this.#writer) {
      this.#writer.markDead();
    }
  }
}
