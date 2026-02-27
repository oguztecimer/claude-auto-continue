import { describe, it, expect, vi, beforeEach } from 'vitest';
import { homedir } from 'os';

// Mock the 'fs' module before importing the module under test
vi.mock('fs');

import { loadConfig, CONFIG_PATH } from '../src/config';
import { readFileSync } from 'fs';

const mockReadFileSync = vi.mocked(readFileSync);

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty config when file does not exist', () => {
    mockReadFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    });

    const config = loadConfig();
    expect(config).toEqual({});
    expect(config.pattern).toBeUndefined();
  });

  it('returns RegExp from valid JSON with pattern string', () => {
    mockReadFileSync.mockReturnValue('{"pattern":"Claude usage limit reached"}' as any);

    const config = loadConfig();
    expect(config.pattern).toBeInstanceOf(RegExp);
    expect(config.pattern!.source).toBe('Claude usage limit reached');
    expect(config.pattern!.flags).toContain('i');
  });

  it('returns empty config on invalid JSON', () => {
    mockReadFileSync.mockReturnValue('not valid json{{{' as any);

    const config = loadConfig();
    expect(config).toEqual({});
    expect(config.pattern).toBeUndefined();
  });

  it('returns empty config when pattern field is not a string (e.g., number)', () => {
    mockReadFileSync.mockReturnValue('{"pattern":42}' as any);

    const config = loadConfig();
    expect(config).toEqual({});
    expect(config.pattern).toBeUndefined();
  });

  it('config path uses os.homedir()', () => {
    expect(CONFIG_PATH).toContain(homedir());
    expect(CONFIG_PATH).toContain('.config');
    expect(CONFIG_PATH).toContain('claude-auto-continue');
    expect(CONFIG_PATH).toContain('config.json');
  });

  it('returns empty config when pattern is null', () => {
    mockReadFileSync.mockReturnValue('{"pattern":null}' as any);

    const config = loadConfig();
    expect(config).toEqual({});
  });

  it('returns RegExp that matches case-insensitively', () => {
    mockReadFileSync.mockReturnValue('{"pattern":"usage limit"}' as any);

    const config = loadConfig();
    expect(config.pattern).toBeInstanceOf(RegExp);
    expect(config.pattern!.test('USAGE LIMIT')).toBe(true);
    expect(config.pattern!.test('usage limit')).toBe(true);
  });
});
