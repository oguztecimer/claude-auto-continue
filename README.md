# claude-auto-continue

Automatically resumes Claude Code sessions after usage limits reset — no manual babysitting.

[![npm version](https://img.shields.io/npm/v/claude-auto-continue.svg)](https://www.npmjs.com/package/claude-auto-continue)
[![Node.js >=18](https://img.shields.io/node/v/claude-auto-continue.svg)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

Claude Code pauses with a "usage limit reached" message and a reset timestamp. Instead of watching and waiting, `claude-auto-continue` wraps Claude Code in a pseudo-terminal, monitors all output for rate-limit messages, parses the exact reset timestamp, shows a live status bar and countdown timer, then sends `continue` automatically at reset time. Leave it running overnight; it resumes by itself.

## Install

```bash
npm install -g claude-auto-continue
```

## Usage

```bash
claude-auto-continue          # start — launches 'claude' automatically
clac                          # short alias
clac -- --continue            # pass flags through to Claude Code
```

All arguments after `--` are forwarded directly to `claude`. For example, `clac -- --resume` passes `--resume` to Claude Code.

## Prerequisites

`claude-auto-continue` depends on `node-pty`, a native addon that compiles during install. Build tools must be present.

**Linux (Debian/Ubuntu):**

```bash
sudo apt-get install build-essential python3 make g++
```

**macOS:** Xcode Command Line Tools are usually pre-installed. If not:

```bash
xcode-select --install
```

**Windows:** `windows-build-tools` may be required. Install via an elevated PowerShell:

```bash
npm install --global windows-build-tools
```

**Node.js >= 18 is required.**

## How It Works

1. Wraps `claude` in a pseudo-terminal (PTY) so it receives a real TTY — required for interactive operation
2. Monitors all output with a regex-based pattern detector that strips ANSI codes and uses a rolling buffer
3. Parses the reset timestamp from the rate-limit message when a usage limit is detected
4. Displays a status bar and centered countdown card in the terminal while waiting
5. Sends `continue` to the PTY at reset time, automatically resuming the session
6. Returns to monitoring — handles multiple rate limits in a single session

## License

ISC
