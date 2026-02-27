import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as pty from 'node-pty';

// We import from the module after mocking — will fail until ProcessSupervisor.ts exists
import { ProcessSupervisor, SessionState } from '../src/ProcessSupervisor.js';
import type { StateChangeEvent } from '../src/ProcessSupervisor.js';

/**
 * Create a mock IPty where onData/onExit store their callbacks so tests
 * can simulate PTY output and exit events without needing a real TTY.
 */
function makeMockPty(): pty.IPty {
  return {
    write: vi.fn(),
    on: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    pid: 9999,
    cols: 80,
    rows: 24,
    process: 'claude',
    handleFlowControl: false,
  } as unknown as pty.IPty;
}

/**
 * Extract stored callbacks from the mock PTY after spawn() has been called.
 * onData.mock.calls[0][0] is the listener passed to pty.onData(listener).
 */
function getMockCallbacks(mockPty: pty.IPty) {
  const dataCallback = vi.mocked(mockPty.onData).mock.calls[0]?.[0] as
    | ((data: string) => void)
    | undefined;
  const exitCallback = vi.mocked(mockPty.onExit).mock.calls[0]?.[0] as
    | ((e: { exitCode: number; signal?: number }) => void)
    | undefined;
  return { dataCallback, exitCallback };
}

/** Rate-limit text that matches the DEFAULT_PATTERN in PatternDetector */
const RATE_LIMIT_TEXT = "Claude usage limit reached. Your limit will reset at 3pm (America/New_York).";

describe('ProcessSupervisor', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Prevent actual process.exit from killing test runner
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
  });

  afterEach(() => {
    vi.useRealTimers();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('starts in RUNNING state', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn });
    supervisor.spawn('claude', ['--continue']);
    expect(supervisor.state).toBe(SessionState.RUNNING);
  });

  it('spawn() calls spawnFn with correct arguments', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn });
    supervisor.spawn('claude', ['--continue']);

    expect(spawnFn).toHaveBeenCalledOnce();
    const [file, args, options] = spawnFn.mock.calls[0];
    expect(file).toBe('claude');
    expect(args).toEqual(['--continue']);
    expect(options).toMatchObject({
      cols: expect.any(Number),
      rows: expect.any(Number),
      cwd: expect.any(String),
      env: expect.any(Object),
    });
  });

  it('PTY output is written to process.stdout by default', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);
    expect(dataCallback).toBeDefined();
    dataCallback!('hello from claude');

    expect(stdoutWriteSpy).toHaveBeenCalledWith('hello from claude');
  });

  it('PTY output routes to onOutput handler when provided', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const onOutput = vi.fn();
    const supervisor = new ProcessSupervisor({ spawnFn, onOutput });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);
    dataCallback!('hello from claude');

    expect(onOutput).toHaveBeenCalledWith('hello from claude');
    // Should NOT have written to stdout directly
    expect(stdoutWriteSpy).not.toHaveBeenCalledWith('hello from claude');
  });

  it('PTY output feeds PatternDetector in RUNNING state and triggers state transition', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);
    dataCallback!(RATE_LIMIT_TEXT);

    // After rate-limit detection: RUNNING -> LIMIT_DETECTED -> WAITING (transient LIMIT_DETECTED)
    expect(supervisor.state).toBe(SessionState.WAITING);
  });

  it('transitions RUNNING -> WAITING on rate-limit detection (LIMIT_DETECTED is transient)', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
    supervisor.spawn('claude', ['--continue']);

    expect(supervisor.state).toBe(SessionState.RUNNING);

    const { dataCallback } = getMockCallbacks(mockPty);
    dataCallback!(RATE_LIMIT_TEXT);

    // LIMIT_DETECTED is transient — immediately moves to WAITING
    expect(supervisor.state).toBe(SessionState.WAITING);
  });

  it('transitions WAITING -> RUNNING when Scheduler fires', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    // safetyMs=0 + null resetTime = immediate schedule
    const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);
    // Feed text without a parseable timestamp so resetTime is null -> fires at 0ms
    dataCallback!('Claude usage limit reached.');

    expect(supervisor.state).toBe(SessionState.WAITING);

    // Advance timers past the schedule delay (0ms + 0ms safety)
    vi.runAllTimers();

    // After resume: WAITING -> RESUMING -> RUNNING
    expect(supervisor.state).toBe(SessionState.RUNNING);
  });

  it('sends "continue" then "\\r" as separate writes during RESUMING transition', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);
    dataCallback!('Claude usage limit reached.');

    vi.runAllTimers();

    // Verify "continue" and "\r" were written as separate calls
    const writeCalls = vi.mocked(mockPty.write).mock.calls.map(c => c[0]);
    expect(writeCalls).toContain('continue');
    expect(writeCalls).toContain('\r');
  });

  it('handles multiple rate-limit cycles', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);

    // --- First cycle ---
    dataCallback!('Claude usage limit reached.');
    expect(supervisor.state).toBe(SessionState.WAITING);

    vi.runAllTimers();
    expect(supervisor.state).toBe(SessionState.RUNNING);

    // --- Second cycle ---
    dataCallback!('Claude usage limit reached.');
    expect(supervisor.state).toBe(SessionState.WAITING);

    vi.runAllTimers();
    expect(supervisor.state).toBe(SessionState.RUNNING);

    // --- Third cycle ---
    dataCallback!('Claude usage limit reached.');
    expect(supervisor.state).toBe(SessionState.WAITING);

    vi.runAllTimers();
    expect(supervisor.state).toBe(SessionState.RUNNING);
  });

  it('PTY exit calls markDead and allows clean exit', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const onExitMock = vi.fn();
    const supervisor = new ProcessSupervisor({ spawnFn, onExit: onExitMock });
    supervisor.spawn('claude', ['--continue']);

    const { exitCallback } = getMockCallbacks(mockPty);
    expect(exitCallback).toBeDefined();
    exitCallback!({ exitCode: 0 });

    // onExit callback should be called with exit code
    expect(onExitMock).toHaveBeenCalledWith(0);
  });

  it('does not feed detector during WAITING state', () => {
    const mockPty = makeMockPty();
    const spawnFn = vi.fn().mockReturnValue(mockPty);
    const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
    supervisor.spawn('claude', ['--continue']);

    const { dataCallback } = getMockCallbacks(mockPty);
    // Trigger rate limit -> enter WAITING
    dataCallback!('Claude usage limit reached.');
    expect(supervisor.state).toBe(SessionState.WAITING);

    // Feed more rate-limit text while in WAITING state
    dataCallback!(RATE_LIMIT_TEXT);

    // Still WAITING — detector.feed() is not called during WAITING, so no re-trigger
    expect(supervisor.state).toBe(SessionState.WAITING);
  });

  describe('stateChange events', () => {
    it('emits stateChange with LIMIT_DETECTED on rate limit detection', () => {
      const mockPty = makeMockPty();
      const spawnFn = vi.fn().mockReturnValue(mockPty);
      const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
      supervisor.spawn('claude', ['--continue']);

      const events: StateChangeEvent[] = [];
      supervisor.on('stateChange', (e: StateChangeEvent) => events.push(e));

      const { dataCallback } = getMockCallbacks(mockPty);
      dataCallback!(RATE_LIMIT_TEXT);

      // Should have emitted LIMIT_DETECTED then WAITING
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].state).toBe('LIMIT_DETECTED');
      expect(events[1].state).toBe('WAITING');
    });

    it('emits stateChange with WAITING including resetTime', () => {
      const mockPty = makeMockPty();
      const spawnFn = vi.fn().mockReturnValue(mockPty);
      const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
      supervisor.spawn('claude', ['--continue']);

      const events: StateChangeEvent[] = [];
      supervisor.on('stateChange', (e: StateChangeEvent) => events.push(e));

      const { dataCallback } = getMockCallbacks(mockPty);
      dataCallback!(RATE_LIMIT_TEXT);

      const waitingEvent = events.find(e => e.state === 'WAITING');
      expect(waitingEvent).toBeDefined();
      // RATE_LIMIT_TEXT contains "3pm" — should parse to a Date
      expect(waitingEvent!.resetTime).toBeInstanceOf(Date);
    });

    it('emits stateChange with RESUMING then RUNNING on resume', () => {
      const mockPty = makeMockPty();
      const spawnFn = vi.fn().mockReturnValue(mockPty);
      const supervisor = new ProcessSupervisor({ spawnFn, safetyMs: 0 });
      supervisor.spawn('claude', ['--continue']);

      const events: StateChangeEvent[] = [];
      supervisor.on('stateChange', (e: StateChangeEvent) => events.push(e));

      const { dataCallback } = getMockCallbacks(mockPty);
      dataCallback!('Claude usage limit reached.');

      // Clear events from detection, focus on resume
      events.length = 0;

      vi.runAllTimers();

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].state).toBe('RESUMING');
      expect(events[1].state).toBe('RUNNING');
      // After resume, resetTime should be null
      expect(events[1].resetTime).toBeNull();
    });

    it('emits stateChange with DEAD on PTY exit', () => {
      const mockPty = makeMockPty();
      const spawnFn = vi.fn().mockReturnValue(mockPty);
      const onExitMock = vi.fn();
      const supervisor = new ProcessSupervisor({ spawnFn, onExit: onExitMock });
      supervisor.spawn('claude', ['--continue']);

      const events: StateChangeEvent[] = [];
      supervisor.on('stateChange', (e: StateChangeEvent) => events.push(e));

      const { exitCallback } = getMockCallbacks(mockPty);
      exitCallback!({ exitCode: 0 });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const deadEvent = events.find(e => e.state === 'DEAD');
      expect(deadEvent).toBeDefined();
      expect(deadEvent!.resetTime).toBeNull();
    });
  });
});
