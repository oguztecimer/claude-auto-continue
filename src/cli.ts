import { ProcessSupervisor } from './ProcessSupervisor.js';
import { CountdownCard } from './CountdownCard.js';
import type { StateChangeEvent } from './ProcessSupervisor.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Read the version string from package.json.
 */
function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Print usage instructions to stdout.
 */
function showHelp(): void {
  const version = getVersion();
  console.log(`claude-auto-continue v${version}

Automatically resumes Claude Code sessions after usage limits reset.

USAGE:
  claude-auto-continue [options] [-- claude-code-args...]
  clac [options] [-- claude-code-args...]

OPTIONS:
  --help, -h       Show this help message
  --version, -v    Show version number

EXAMPLES:
  claude-auto-continue                  Start with defaults
  claude-auto-continue -- --continue    Pass --continue to Claude Code
  clac -- --resume                       Short alias, pass --resume to Claude Code

WHAT IT DOES:
  Wraps Claude Code in a PTY, monitors for rate-limit messages, waits
  until the reset time, then sends "continue" to resume automatically.
  A status bar and countdown timer show progress while waiting.`);
}

/**
 * Parse CLI arguments, extracting Claude Code args after the -- separator.
 */
function parseArgs(argv: string[]): { claudeArgs: string[] } {
  const userArgs = argv.slice(2); // strip 'node' and script path
  const separatorIdx = userArgs.indexOf('--');
  if (separatorIdx === -1) {
    return { claudeArgs: [] };
  }
  return { claudeArgs: userArgs.slice(separatorIdx + 1) };
}

/**
 * Resolve the full path to the `claude` binary.
 *
 * node-pty uses posix_spawnp which cannot resolve shell aliases or
 * binaries outside of PATH. This function tries multiple strategies:
 * 1. `which claude` via a shell (resolves PATH + common shell profile additions)
 * 2. Common install locations (~/.local/bin, ~/.claude/local)
 * 3. Falls back to 'claude' and lets node-pty try PATH directly
 */
function resolveClaudePath(): string {
  // Try `which` in a shell — this picks up PATH entries from shell profiles
  try {
    const result = execSync('which claude', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (result && existsSync(result)) {
      return result;
    }
  } catch {
    // which failed — try known locations
  }

  // Check common install locations
  const home = process.env['HOME'] ?? '';
  const knownPaths = [
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
  ];
  for (const p of knownPaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fall back to bare command — let node-pty attempt PATH resolution
  return 'claude';
}

/**
 * Set the terminal window/tab title via OSC escape sequence.
 * Works in most terminal emulators without interfering with app content.
 */
function setTerminalTitle(title: string): void {
  // OSC 0: set window title, OSC 1: set icon/tab name
  process.stdout.write(`\x1b]0;${title}\x07\x1b]1;${title}\x07`);
}

/**
 * Main entry point — wires ProcessSupervisor to the status display.
 */
function main(): void {
  const args = process.argv.slice(2);

  // Handle --help and --version before anything else
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(getVersion());
    process.exit(0);
  }

  // Parse --overridecooldown N
  let overrideCooldownSec: number | undefined;
  const ocIdx = args.indexOf('--overridecooldown');
  if (ocIdx !== -1 && args[ocIdx + 1]) {
    overrideCooldownSec = parseInt(args[ocIdx + 1], 10);
    if (isNaN(overrideCooldownSec)) overrideCooldownSec = undefined;
  }

  const { claudeArgs } = parseArgs(process.argv);
  const cols = () => process.stdout.columns ?? 80;
  const rows = () => process.stdout.rows ?? 24;
  const cwd = process.cwd();
  const folderName = cwd.split('/').pop() ?? cwd;

  // Create display components
  const card = new CountdownCard({ cols: cols(), rows: rows() });
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let ownsTerminal = false;
  let currentResetTime: Date | null = null;

  // Create supervisor with output routed through the standard handler
  const supervisor = new ProcessSupervisor({
    onOutput: (data: string) => {
      process.stdout.write(data);
    },
    overrideCooldownSec,
  });

  // Handle state changes from ProcessSupervisor
  supervisor.on('stateChange', (event: StateChangeEvent) => {
    const { state, resetTime } = event;

    // Clear any existing countdown timer
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (state === 'WAITING' && resetTime) {
      setTerminalTitle(`${folderName} - Waiting`);
      currentResetTime = resetTime;

      if (!ownsTerminal) {
        ownsTerminal = true;
        process.stdout.write('\x1b[?1049h');
      }
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      process.stdout.write(card.render({ resetTime, cwd }));

      countdownInterval = setInterval(() => {
        if (supervisor.state !== 'WAITING') {
          clearInterval(countdownInterval!);
          countdownInterval = null;
          return;
        }
        setTerminalTitle(`${folderName} - Waiting`);
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
        process.stdout.write(card.render({ resetTime, cwd }));
      }, 1000);
    } else if (state === 'RUNNING' || state === 'RESUMING' || state === 'DEAD') {
      setTerminalTitle('');
      currentResetTime = null;

      if (ownsTerminal) {
        ownsTerminal = false;
        // Leave alternate screen buffer (restores saved main screen)
        process.stdout.write('\x1b[?1049l');
        // Clear the restored stale content — Claude Code's state has changed
        // while we were on the alternate screen, so the restored content is
        // out of sync. Clearing lets Claude redraw cleanly after the resize
        // signal (sent by ProcessSupervisor on RUNNING state change).
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      }
    }
  });

  // Handle terminal resize
  process.stdout.on('resize', () => {
    card.cols = cols();
    card.rows = rows();

    if (ownsTerminal && currentResetTime) {
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      process.stdout.write(card.render({ resetTime: currentResetTime, cwd }));
    }
  });

  // Terminal cleanup on all exit paths
  const cleanup = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (ownsTerminal) {
      process.stdout.write('\x1b[?1049l');
    }
    setTerminalTitle('');
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  // Clear terminal (visible area + scrollback buffer)
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  const claudePath = resolveClaudePath();
  supervisor.spawn(claudePath, claudeArgs);

}

main();
