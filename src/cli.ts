import { ProcessSupervisor } from './ProcessSupervisor.js';
import { StatusBar } from './StatusBar.js';
import { CountdownCard } from './CountdownCard.js';
import type { StateChangeEvent } from './ProcessSupervisor.js';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  cac [options] [-- claude-code-args...]

OPTIONS:
  --help, -h       Show this help message
  --version, -v    Show version number

EXAMPLES:
  claude-auto-continue                  Start with defaults
  claude-auto-continue -- --continue    Pass --continue to Claude Code
  cac -- --resume                       Short alias, pass --resume to Claude Code

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

  const { claudeArgs } = parseArgs(process.argv);
  const cols = () => process.stdout.columns ?? 80;
  const rows = () => process.stdout.rows ?? 24;
  const cwd = process.cwd();

  // Create display components
  const statusBar = new StatusBar({ cols: cols() });
  const countdownCard = new CountdownCard({ cols: cols(), rows: rows() });

  // Set up terminal: scroll region leaves row 1 for status bar
  process.stdout.write(statusBar.initScrollRegion(rows()));

  // Initial status bar render
  process.stdout.write(statusBar.render('RUNNING', { cwd }));

  // Countdown timer handle
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Create supervisor with output routed through the standard handler
  const supervisor = new ProcessSupervisor({
    onOutput: (data: string) => {
      process.stdout.write(data);
    },
  });

  // Handle state changes from ProcessSupervisor
  supervisor.on('stateChange', (event: StateChangeEvent) => {
    const { state, resetTime } = event;

    // Clear any existing countdown timer
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (state === 'DEAD') {
      // Show dead state in status bar, clear countdown card
      process.stdout.write(statusBar.render('DEAD', { cwd }));
      process.stdout.write(countdownCard.clear());

      // Wait 5 seconds to show "Dead" status, then cleanup and let exit handler run
      setTimeout(() => {
        process.stdout.write(statusBar.cleanup());
      }, 5000);
      return;
    }

    // Re-render status bar for the current state
    process.stdout.write(statusBar.render(state, { resetTime: resetTime ?? undefined, cwd }));

    if (state === 'WAITING' && resetTime) {
      // Show centered countdown card
      process.stdout.write(countdownCard.render({ resetTime, cwd }));

      // Start 1-second countdown tick
      countdownInterval = setInterval(() => {
        // Race protection: if state has moved on, stop ticking
        if (supervisor.state !== 'WAITING') {
          clearInterval(countdownInterval!);
          countdownInterval = null;
          return;
        }

        // Recalculate from resetTime - Date.now() each tick (no drift)
        process.stdout.write(statusBar.render('WAITING', { resetTime, cwd }));
        process.stdout.write(countdownCard.render({ resetTime, cwd }));
      }, 1000);
    } else {
      // Clear countdown card if it was showing
      process.stdout.write(countdownCard.clear());
    }
  });

  // Handle terminal resize
  process.stdout.on('resize', () => {
    // Update display component dimensions
    statusBar.cols = cols();
    countdownCard.cols = cols();
    countdownCard.rows = rows();

    // Re-initialize scroll region with new dimensions
    process.stdout.write(statusBar.initScrollRegion(rows()));

    // Re-render current state
    const currentState = supervisor.state as string;
    process.stdout.write(statusBar.render(currentState, { cwd }));
  });

  // Terminal cleanup on all exit paths
  const cleanup = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    process.stdout.write(statusBar.cleanup());
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

  // Spawn Claude Code with passed-through arguments
  supervisor.spawn('claude', claudeArgs);
}

main();
