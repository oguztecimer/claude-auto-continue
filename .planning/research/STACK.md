# Stack Research

**Domain:** Node.js CLI tool — process wrapper / rate-limit auto-resume for Claude Code
**Researched:** 2026-02-27
**Confidence:** HIGH (core findings verified via official GitHub issues + npm registry; versions confirmed)

---

## Critical Discovery: Claude Code Requires a PTY

Before selecting libraries, one finding shapes the entire stack:

**Claude Code hangs indefinitely when spawned without a pseudo-terminal (TTY).** This is documented in [anthropics/claude-code#9026](https://github.com/anthropics/claude-code/issues/9026) — even `claude -p 'prompt'` hangs when run via `child_process.spawn()` without a PTY. The root cause: Claude Code performs TTY detection via `ioctl` and either hangs or exits early in non-TTY environments.

Consequence: `child_process.spawn()` alone is insufficient. The tool must use `node-pty` to create a genuine pseudo-terminal, giving Claude Code the TTY it requires while still allowing output interception and stdin injection.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime | Active LTS until Oct 2025 (maintenance until Apr 2027). Native TypeScript type stripping available. The user's specified runtime. |
| TypeScript | 5.x | Language | Type safety on stream data handling and pattern matching. Prevents class of bugs in async IO logic. |
| node-pty | 1.1.0 | Spawn Claude Code with a real PTY, intercept output, inject input | **Required** — Claude Code hangs without a TTY. node-pty creates a genuine pseudo-terminal so Claude Code behaves normally while the wrapper monitors data events and writes "continue\r" back. Used by VS Code and Hyper. Published Dec 2025. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | 14.x | CLI argument parsing | Parse flags like `--session`, `--instances`, `--debug`. Use v14 (not v15) because v15 is ESM-only and requires Node ≥22.12 — v14 supports Node ≥20 and ships CJS+ESM. v15 is due May 2026. |
| chalk | 4.x | Terminal color output | Status display, countdown timers, error messages. Use v4 (not v5) because v5 is ESM-only. If the project commits to `"type": "module"` in package.json, chalk 5.x is fine. |
| ora | 8.x | Animated spinner | While waiting for reset window. Shows active countdown without cluttering output. Same ESM caveat as chalk — use v8 if staying CJS, v9 if going ESM. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | Run TypeScript directly during development | esbuild-backed, handles ESM+CJS seamlessly, no tsconfig.json boilerplate needed for dev. `npx tsx src/index.ts` just works. |
| tsup | Bundle for distribution | Outputs CJS + ESM from TypeScript. Zero-config for CLIs. Powers the `dist/` for npm publish or global install via `npm link`. |
| vitest | Unit testing | Native ESM, TypeScript-first, 4x faster cold start than Jest. Required for testing pattern detection regexes against sample output without spinning up real Claude Code. |

---

## Installation

```bash
# Core runtime dependency
npm install node-pty

# CLI UX
npm install commander chalk@4 ora@8

# Dev / build
npm install -D typescript tsx tsup vitest @types/node
```

Note: `node-pty` requires a C++ build toolchain (Python + C++ compiler via Xcode CLT on macOS). On macOS this is satisfied by `xcode-select --install`. node-pty ships prebuilds for common platforms via `node-gyp-build`, so compile-from-source is only triggered on unsupported platforms/architectures.

If the native build is a hard blocker, `@lydell/node-pty` is a fork that only ever uses prebuilts (never falls back to node-gyp) — same API, narrower platform support.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| node-pty 1.1.0 | `child_process.spawn()` | Never for wrapping Claude Code interactive sessions. Claude Code hangs without a TTY (confirmed in issue #9026). `child_process` is fine for non-interactive subcommands (e.g., reading config, running checks). |
| node-pty 1.1.0 | `@lydell/node-pty` | If native build fails on target platform. Identical API, never runs node-gyp, only uses prebuilt binaries. Narrower platform coverage. |
| commander 14.x | yargs | yargs has ~7 dependencies, more config surface. Commander has 0 dependencies and handles the simple `claude-continue [options]` interface without ceremony. |
| commander 14.x | oclif | Only if this becomes a multi-command plugin system with scaffolding. Oclif adds ~30 deps and 85-135ms startup latency vs commander's 18-25ms. Overkill for a focused tool. |
| chalk 4.x | ansis | ansis supports CJS+ESM, slightly faster. Valid alternative. chalk 4 is more universally known and has 142K dependents. |
| tsup | esbuild directly | tsup wraps esbuild with sensible defaults (dts, CJS+ESM output, clean). Use raw esbuild only if you need fine-grained bundle control. |
| vitest | Node.js test runner (built-in) | Built-in `node:test` is viable for small suites. Vitest provides watch mode, better assertions, and snapshot testing — worth it for regex/pattern test suites. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `child_process.spawn()` for the Claude Code process | Claude Code requires a real TTY; spawn without PTY causes indefinite hangs (issue #9026). | `node-pty` |
| chalk v5 / ora v9 with CommonJS project | Both are ESM-only. Mixing ESM-only deps into a CJS project causes `require()` of ES module errors that are hard to debug. | Either pin chalk@4 + ora@8 (CJS-compatible), or commit to `"type": "module"` and use v5/v9. |
| commander v15 | ESM-only, requires Node 22.12+. Released May 2026 — not yet out. Stay on v14 which is in active support until May 2027. | commander@14 |
| ts-node | Slower than tsx, more config ceremony (tsconfig `ts-node` block), poor ESM story. Dead in practice for new projects. | tsx |
| node-pre-gyp / prebuild | Legacy approaches for managing native binary distribution. node-pty uses node-gyp-build (modern, ships prebuilds inside package). No extra tooling needed. | Nothing — node-pty handles it |
| Shell script / bash | The existing `terryso/claude-auto-resume` already does the shell script approach. It polls by re-running `claude -p 'check'` which starts a new session. The user wants a wrapper that keeps the existing session alive. | Node.js + node-pty |

---

## Stack Patterns by Variant

**If staying with CommonJS (simpler, broader tooling compat):**
- `"type": "commonjs"` in package.json (or omit `type`)
- chalk@4, ora@8, commander@14
- tsup outputs `--format cjs`
- tsx works without extra flags

**If going full ESM (cleaner long-term, but more friction):**
- `"type": "module"` in package.json
- chalk@5, ora@9, commander@14 (supports both via exports map)
- tsup outputs `--format esm`
- tsx works without extra flags
- Note: node-pty 1.1.0 ships as CJS; when using ESM project, import it with `createRequire` or via tsup bundling

**Recommendation: Start with CommonJS.** This is a developer tool, not a library. CJS avoids ESM interop friction with node-pty's native module. You can migrate later if needed.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| node-pty@1.1.0 | Node.js ≥16 | Requires C++ build toolchain on install if no prebuilt available for your arch. macOS/Linux prebuilts exist. |
| commander@14 | Node.js ≥20 | CJS + ESM exports. Stable until May 2027. |
| chalk@4 | Node.js ≥12 | CJS. Last CJS-compatible major. |
| ora@8 | Node.js ≥16 | ESM-only in v8. Workaround: dynamic `import()` or use `ora-classic` for CJS. |
| tsx | Node.js ≥18 | Handles TS stripping via esbuild. No tsconfig required. |
| tsup | Node.js ≥18 | Handles native addons — set `external: ['node-pty']` in tsup config so it's not bundled. |

**Important tsup note:** node-pty is a native addon (.node file). It cannot be bundled by esbuild/tsup. Always mark it as external:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  external: ['node-pty'],  // REQUIRED — native module cannot be bundled
  clean: true,
})
```

---

## Key API Pattern

The core interaction pattern using node-pty:

```typescript
import pty from 'node-pty'

const claude = pty.spawn('claude', [], {
  name: 'xterm-color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  cwd: process.cwd(),
  env: process.env,
})

// Monitor output for rate limit message
claude.onData((data: string) => {
  // Pass through to user's terminal
  process.stdout.write(data)

  // Detect: "Claude AI usage limit reached|<unix_timestamp>"
  const match = data.match(/Claude AI usage limit reached\|(\d+)/)
  if (match) {
    const resetAt = parseInt(match[1], 10) * 1000  // Unix ts → ms
    scheduleResume(claude, resetAt)
  }
})

// Resume after wait
function scheduleResume(proc: pty.IPty, resetAt: number) {
  const waitMs = resetAt - Date.now()
  setTimeout(() => {
    proc.write('continue\r')  // \r is Enter in PTY
  }, waitMs)
}
```

The rate limit message format (confirmed from multiple GitHub issues) is:
```
Claude AI usage limit reached|<unix_timestamp>
```

The Unix timestamp is when the limit resets. The human-readable version ("Your limit will reset at 2pm America/New_York") is shown to the user but the machine-parseable format with the pipe-delimited timestamp is what to detect programmatically.

---

## Sources

- [anthropics/claude-code#9026](https://github.com/anthropics/claude-code/issues/9026) — Claude Code requires TTY, hangs without it (HIGH confidence)
- [anthropics/claude-code#12507](https://github.com/anthropics/claude-code/issues/12507) — Claude Code stdin/TTY behavior deep dive (HIGH confidence)
- [anthropics/claude-code#2087](https://github.com/anthropics/claude-code/issues/2087) — Rate limit message format verification (HIGH confidence)
- [anthropics/claude-code#9046](https://github.com/anthropics/claude-code/issues/9046) — Additional rate limit message format samples (HIGH confidence)
- [microsoft/node-pty GitHub README](https://github.com/microsoft/node-pty) — API, platform requirements, version (HIGH confidence)
- npm search results — node-pty@1.1.0 published Dec 2025, commander@14 current stable, chalk@4/5, ora@8/9 (MEDIUM confidence — npm page returned 403, confirmed via search)
- [WebSearch: commander v14 vs v15](https://github.com/tj/commander.js/releases) — v15 ESM-only, May 2026, v14 active LTS (MEDIUM confidence)
- [Node.js TypeScript strip-types](https://nodejs.org/en/learn/typescript/run-natively) — Native TS support in Node 22+/23+ (HIGH confidence, official docs)
- [terryso/claude-auto-resume](https://github.com/terryso/claude-auto-resume) — Reference implementation using shell script (HIGH confidence — inspected)
- [node-pty prebuilts issue](https://github.com/hashicorp/terraform-cdk/issues/2839) — Native build friction context (MEDIUM confidence)

---

*Stack research for: Claude Auto-Continue — Node.js CLI process wrapper*
*Researched: 2026-02-27*
