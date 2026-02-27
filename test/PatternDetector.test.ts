import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock loadConfig before importing PatternDetector
vi.mock('../src/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}));

import { PatternDetector, LimitEvent } from '../src/PatternDetector';
import { loadConfig } from '../src/config.js';

const mockLoadConfig = vi.mocked(loadConfig);

describe('PatternDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue({});
  });

  describe('Format A (legacy pipe-delimited unix timestamp)', () => {
    it('emits limit event for "Claude AI usage limit reached|1760000400"', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed('Claude AI usage limit reached|1760000400');

      expect(handler).toHaveBeenCalledOnce();
      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeInstanceOf(Date);
      expect(event.resetTime!.getTime()).toBe(1760000400 * 1000);
      expect(event.rawMatch).toContain('Claude AI usage limit reached');
    });
  });

  describe('Format B (mid-era human-readable time)', () => {
    it('emits limit event for "Claude usage limit reached. Your limit will reset at 3pm (America/Santiago)."', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed('Claude usage limit reached. Your limit will reset at 3pm (America/Santiago).');

      expect(handler).toHaveBeenCalledOnce();
      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeInstanceOf(Date);
      expect(event.rawMatch).toBeDefined();
    });
  });

  describe('Format C (current middle-dot format)', () => {
    it('emits limit event for "You\'ve hit your limit · resets 4pm (Europe/Berlin)"', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("You've hit your limit \u00B7 resets 4pm (Europe/Berlin)");

      expect(handler).toHaveBeenCalledOnce();
      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeInstanceOf(Date);
      expect(event.rawMatch).toBeDefined();
    });

    it('emits limit event for "You\'ve hit your limit · resets Feb 20, 5pm (Africa/Libreville)"', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("You've hit your limit \u00B7 resets Feb 20, 5pm (Africa/Libreville)");

      expect(handler).toHaveBeenCalledOnce();
      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeInstanceOf(Date);
      expect(event.rawMatch).toBeDefined();
    });
  });

  describe('Timestamp parsing', () => {
    it('event payload contains resetTime as a Date for unix timestamp format', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed('Claude AI usage limit reached|1760000400');

      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeInstanceOf(Date);
      expect(event.resetTime!.getTime()).toBe(1760000400 * 1000);
    });

    it('event payload contains resetTime as a Date for human-readable time format', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("You've hit your limit \u00B7 resets 4pm (Europe/Berlin)");

      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeInstanceOf(Date);
    });

    it('event payload contains resetTime: null when timestamp cannot be parsed from a custom pattern match', () => {
      const detector = new PatternDetector({ pattern: /CUSTOM_LIMIT_TRIGGER/ });
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed('CUSTOM_LIMIT_TRIGGER');

      expect(handler).toHaveBeenCalledOnce();
      const event: LimitEvent = handler.mock.calls[0][0];
      expect(event.resetTime).toBeNull();
    });
  });

  describe('ANSI code handling', () => {
    it('matches after ANSI escape codes are stripped from input', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("\x1b[1mYou've hit your limit\x1b[0m \u00B7 resets 4pm (UTC)");

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Rolling buffer / chunk splitting', () => {
    it('matches when the message is split across two feed() calls', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("You've hit your ");
      expect(handler).not.toHaveBeenCalled();

      detector.feed("limit \u00B7 resets 3pm (UTC)");

      expect(handler).toHaveBeenCalledOnce();
    });

    it('rolling buffer trims to 4KB when exceeded', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      // Feed 5KB of junk, then the actual limit message
      const junk = 'x'.repeat(5120);
      detector.feed(junk);
      expect(handler).not.toHaveBeenCalled();

      detector.feed("You've hit your limit \u00B7 resets 3pm (UTC)");
      // After overflow, buffer should still work for new data
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Custom pattern', () => {
    it('uses custom pattern from constructor option instead of default', () => {
      const detector = new PatternDetector({ pattern: /CUSTOM_LIMIT_TRIGGER/ });
      const handler = vi.fn();
      detector.on('limit', handler);

      // Default pattern should NOT fire
      detector.feed('Claude AI usage limit reached|1760000400');
      expect(handler).not.toHaveBeenCalled();

      // Custom pattern should fire
      detector.reset();
      detector.feed('CUSTOM_LIMIT_TRIGGER');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('uses pattern from config file when no constructor option given', () => {
      mockLoadConfig.mockReturnValue({ pattern: /CONFIG_PATTERN_OVERRIDE/ });
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      // Default pattern should NOT fire
      detector.feed('Claude AI usage limit reached|1760000400');
      expect(handler).not.toHaveBeenCalled();

      // Config pattern should fire
      detector.reset();
      detector.feed('CONFIG_PATTERN_OVERRIDE');
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Double-emit guard', () => {
    it('does not double-emit after first detection (guarded by #detected flag)', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("You've hit your limit \u00B7 resets 3pm (UTC)");
      expect(handler).toHaveBeenCalledOnce();

      // Second feed with same or different message — no second emit
      detector.feed("You've hit your limit \u00B7 resets 4pm (UTC)");
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Reset and re-arm', () => {
    it('re-arms after reset() and can detect again', () => {
      const detector = new PatternDetector();
      const handler = vi.fn();
      detector.on('limit', handler);

      detector.feed("You've hit your limit \u00B7 resets 3pm (UTC)");
      expect(handler).toHaveBeenCalledOnce();

      detector.reset();
      detector.feed("You've hit your limit \u00B7 resets 4pm (UTC)");
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Debug mode', () => {
    it('debug mode logs buffer contents to stderr', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const detector = new PatternDetector({ debug: true });

      detector.feed('some test data');

      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });
  });
});
