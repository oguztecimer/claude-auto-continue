import { EventEmitter } from 'events';
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

/** Payload emitted with the 'stateChange' event */
export interface StateChangeEvent {
  state: string;
  resetTime: Date | null;
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
  /** Override PTY output handler. Default: process.stdout.write */
  onOutput?: (data: string) => void;
}

/**
 * ProcessSupervisor — the core PTY orchestrator.
 *
 * Spawns Claude Code in a real PTY, passes all I/O transparently, detects
 * usage-limit messages via PatternDetector, waits via Scheduler, and
 * auto-resumes via StdinWriter.
 *
 * Extends EventEmitter to broadcast 'stateChange' events for the display layer.
 */
export class ProcessSupervisor extends EventEmitter {
  readonly #spawnFn: typeof pty.spawn;
  readonly #cooldownMs: number;
  readonly #detector: PatternDetector;
  readonly #scheduler: Scheduler;
  readonly #onExitCallback: (code: number) => void;
  readonly #onOutput: (data: string) => void;

  #state: SessionState = SessionState.RUNNING;
  #writer: StdinWriter | null = null;
  #cooldownUntil = 0;
  #resetTime: Date | null = null;

  constructor(options: ProcessSupervisorOptions = {}) {
    super();
    this.#spawnFn = options.spawnFn ?? pty.spawn;
    this.#cooldownMs = options.cooldownMs ?? 30_000;
    this.#detector = new PatternDetector();
    this.#scheduler = new Scheduler(options.safetyMs ?? 5_000);
    this.#onExitCallback = options.onExit ?? ((code: number) => process.exit(code));
    this.#onOutput = options.onOutput ?? ((data: string) => { process.stdout.write(data); });

    // Listen for rate-limit detections
    this.#detector.on('limit', (event: LimitEvent) => this.#onLimitDetected(event));
  }

  /** Current session state — exposed for Phase 3 status display and testing */
  get state(): SessionState {
    return this.#state;
  }

  /**
   * Set state and emit a 'stateChange' event.
   */
  #setState(newState: SessionState | 'DEAD'): void {
    if (newState !== 'DEAD') {
      this.#state = newState;
    }
    this.emit('stateChange', {
      state: newState,
      resetTime: this.#resetTime,
    } satisfies StateChangeEvent);
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

    // --- PTY output: pass to output handler, optionally feed detector ---
    ptyProcess.onData((data: string) => {
      this.#onOutput(data);
      // Only feed the detector when RUNNING — ignore output in all other states
      if (this.#state === SessionState.RUNNING) {
        this.#detector.feed(data);
      }
    });

    // --- PTY exit: clean up and exit ---
    ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
      this.#writer!.markDead();
      this.#scheduler.cancel();
      this.#setState('DEAD');
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
      let lastCtrlC = 0;
      process.stdin.on('data', (chunk: Buffer) => {
        const str = chunk.toString('binary');

        // Detect Ctrl+C (0x03) — double press within 1s exits clac
        if (str === '\x03') {
          const now = Date.now();
          if (now - lastCtrlC < 1000) {
            // Double Ctrl+C — force exit
            this.shutdown();
            this.#onExitCallback(130);
            return;
          }
          lastCtrlC = now;
        }

        // Forward keystrokes to PTY only during RUNNING state
        if (this.#state === SessionState.RUNNING) {
          this.#writer!.write(str);
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

    this.#resetTime = event.resetTime;
    this.#setState(SessionState.LIMIT_DETECTED);

    // Schedule the resume callback
    this.#scheduler.scheduleAt(event.resetTime, () => this.#onResumeReady());

    this.#setState(SessionState.WAITING);
  }

  /**
   * Called by Scheduler when the reset time has elapsed.
   * Transitions: WAITING -> RESUMING -> RUNNING
   */
  #onResumeReady(): void {
    this.#setState(SessionState.RESUMING);

    // Send Escape to dismiss any rate-limit UI overlay
    this.#writer!.write('\x1b');
    // Type "continue" and press Enter to resume the session
    this.#writer!.write('continue\r');

    // Arm cooldown to suppress the false-positive re-detection that can occur
    // immediately after resume (Claude Code issue #14129)
    this.#cooldownUntil = Date.now() + this.#cooldownMs;

    // Re-arm the detector for the next potential rate-limit cycle
    this.#detector.reset();

    this.#resetTime = null;
    this.#setState(SessionState.RUNNING);
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
