import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface ToolConfig {
  pattern?: RegExp;
}

export const CONFIG_PATH = join(homedir(), '.config', 'claude-auto-continue', 'config.json');

export function loadConfig(): ToolConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const config: ToolConfig = {};
    if (typeof parsed.pattern === 'string') {
      config.pattern = new RegExp(parsed.pattern, 'i');
    }
    return config;
  } catch {
    return {};
  }
}
