import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as pty from 'node-pty';
import { StdinWriter } from '../src/StdinWriter.js';

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
    pid: 0,
    cols: 80,
    rows: 24,
    process: 'mock',
    handleFlowControl: false,
  } as unknown as pty.IPty;
}

describe('StdinWriter', () => {
  it('forwards writes to the PTY', () => {
    const mock = makeMockPty();
    const writer = new StdinWriter(mock);
    writer.write('hello');
    expect(mock.write).toHaveBeenCalledWith('hello');
  });

  it('is a no-op after markDead()', () => {
    const mock = makeMockPty();
    const writer = new StdinWriter(mock);
    writer.markDead();
    writer.write('hello');
    expect(mock.write).not.toHaveBeenCalled();
  });

  it('catches EPIPE errors without throwing', () => {
    const mock = makeMockPty();
    const epipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    vi.mocked(mock.write).mockImplementation(() => { throw epipeError; });
    const writer = new StdinWriter(mock);
    expect(() => writer.write('hello')).not.toThrow();
  });

  it('logs non-EPIPE errors to stderr', () => {
    const mock = makeMockPty();
    const ebadfError = Object.assign(new Error('EBADF'), { code: 'EBADF' });
    vi.mocked(mock.write).mockImplementation(() => { throw ebadfError; });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const writer = new StdinWriter(mock);
    writer.write('hello');
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('exposes isDead getter', () => {
    const mock = makeMockPty();
    const writer = new StdinWriter(mock);
    expect(writer.isDead).toBe(false);
    writer.markDead();
    expect(writer.isDead).toBe(true);
  });
});
