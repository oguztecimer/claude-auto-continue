# Stack Research

**Domain:** npm publishing — CLI tool with native dependency (node-pty)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Context

This is a SUBSEQUENT MILESTONE research pass. The tool is built and working. This documents only what is needed for the npm publishing milestone: version bump, package.json metadata, README, and `npm publish`.

---

## Recommended Stack

### Core Technologies (Validated — No Changes Needed)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js CJS | >=18 | Runtime | node-pty native module interop is friction-free on CJS; do not change module system |
| TypeScript | ^5.9.3 | Language | Already compiles to `dist/` via `tsc`; `prepublishOnly` hook ensures dist is fresh before publish |
| node-pty | ^1.1.0 | PTY spawning | Ships prebuilt binaries for darwin-arm64, darwin-x64, win32-arm64, win32-x64 in its own `prebuilds/` directory; install script uses prebuilds first, falls back to node-gyp rebuild only when a prebuild is absent |
| strip-ansi | ^6.0.1 | ANSI stripping | v6 is the last CJS-compatible version; v7+ is ESM-only and must not be upgraded |

### What the Publish Step Actually Needs

The existing `package.json` already has:
- `files: ["dist/", "bin/"]` — correct allowlist, only ships compiled output and the bin wrapper
- `scripts.prepublishOnly: "npm run build"` — tsc runs before pack, ensures `dist/` is fresh
- `engines.node: ">=18"` — correctly documented
- `bin` entries for `claude-auto-continue` and `cac`

What IS currently missing from `package.json`:

| Field | Current Value | Required Value |
|-------|--------------|----------------|
| `version` | `"0.1.0"` | `"1.0.0"` |
| `author` | `""` | Name and/or email string |
| `repository` | absent | `{ "type": "git", "url": "..." }` |
| `homepage` | absent | GitHub repo URL or docs URL |
| `bugs` | absent | GitHub issues URL |

### Supporting Tools (No Install Required — Built Into npm)

| Tool | Purpose | How to Use |
|------|---------|-----------|
| `npm pack --dry-run` | Lists files that will be included in the tarball without creating it | Run before first publish; confirms only `dist/` and `bin/` are included |
| `npm publish --dry-run` | Full publish simulation without hitting the registry | Rehearse the publish command; checks authentication and version |
| `npm version 1.0.0` | Bumps `version` in package.json and creates a git tag | Alternative to manually editing package.json |

### Development Tools (Already in Place — No Changes)

| Tool | Purpose | Notes |
|------|---------|-------|
| vitest | Unit testing | 91 tests across 8 files; wired to `npm test` |
| tsx | Run TypeScript directly | Dev-only; not in published bundle |
| tsc | TypeScript compiler | Called automatically by `prepublishOnly` |

---

## README: Standard Structure for a CLI npm Package

The README.md file is rendered verbatim on the npm package page and on GitHub. For a focused, single-command CLI tool the standard structure is:

```
# claude-auto-continue

[One-sentence description]

[Badges row — npm version, Node.js, License]

## Why

1-3 sentences on the problem this solves (rate limits, manual babysitting).

## Install

npm install -g claude-auto-continue

## Usage

claude-auto-continue          # wraps `claude` command
# or
cac                           # short alias

## How It Works

Brief prose: detect → wait → resume. Diagram optional.

## Requirements

- Node.js >=18
- Claude Code (`claude`) installed and on PATH
- macOS or Windows (prebuilt binaries available)
- Linux: requires Python and a C++ compiler (node-pty builds from source)

## Configuration (optional)

~/.config/claude-auto-continue/config.json

## License

ISC
```

### Badges: Exact shields.io URLs

No badge generation CLI or npm package is needed. These are static URL templates — shields.io pulls live data from the npm registry automatically after the package is published.

| Badge | Markdown |
|-------|---------|
| npm version | `[![npm version](https://img.shields.io/npm/v/claude-auto-continue)](https://www.npmjs.com/package/claude-auto-continue)` |
| Node.js version | `[![Node.js](https://img.shields.io/node/v/claude-auto-continue)](https://nodejs.org)` |
| License | `[![License](https://img.shields.io/npm/l/claude-auto-continue)](LICENSE)` |
| Monthly downloads | `[![npm downloads](https://img.shields.io/npm/dm/claude-auto-continue)](https://www.npmjs.com/package/claude-auto-continue)` |

The version, node, and license badges will show "not found" until the package is published — that is expected. The download badge starts from zero.

---

## Native Module Publishing: Key Facts

node-pty ^1.1.0 bundles prebuilt `.node` binaries inside its npm tarball in a `prebuilds/` directory. When a user runs `npm install -g claude-auto-continue`:

1. npm installs `node-pty` as a dependency of `claude-auto-continue`
2. node-pty's install script (`node scripts/prebuild.js || node-gyp rebuild`) checks for a matching prebuild for the current `${platform}-${arch}`
3. Prebuilds exist for: `darwin-arm64`, `darwin-x64`, `win32-arm64`, `win32-x64`
4. Users on these platforms: **no C++ compiler or Python needed** — prebuild is used directly
5. Users on Linux or unsupported architectures: node-gyp rebuild runs, requiring Python and a C++ compiler (gcc/g++ or clang)

This means `claude-auto-continue` itself does NOT need to bundle any native binaries. It simply declares `node-pty` as a dependency and lets node-pty handle its own native build.

**Platform note to document in README:** Linux users need build tools. The `engines` field already covers Node.js. Add a "Requirements" section that mentions the Linux constraint explicitly.

---

## Installation

```bash
# No new packages to install for the publishing milestone.
# The complete publish workflow:

npm test                 # run all 91 tests — verify nothing is broken
npm pack --dry-run       # verify tarball contents (should see dist/ and bin/ only)
npm publish              # publish to npm registry (prompts for OTP if 2FA enabled)
```

If publishing to npm for the first time, authentication is required:

```bash
npm login                # one-time; stores token in ~/.npmrc
npm publish              # then publish
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hand-authored README | readme-md-generator, autoreadme-cli | When the project has many subcommands or complex options; overkill for a single-command CLI with one binary |
| shields.io static URLs (no install) | @ptkdev/all-shields-cli, istanbul-badges-readme | When automating badge updates in CI on every release; unnecessary overhead for a v1.0 manual publish |
| Manual `npm publish` (local) | GitHub Actions + trusted publishing | When publishing on a recurring cadence from CI; excessive setup for a one-time v1.0 release |
| `files` field in package.json (already present) | `.npmignore` | `.npmignore` silently replaces `.gitignore` — a footgun that can accidentally publish secrets or test files. The `files` allowlist is already in place and is safer |
| Stay on node-pty ^1.1.0 | Upgrade or switch to `@lydell/node-pty` | `@lydell/node-pty` is only needed if the build-from-source fallback is unacceptable; current version is validated and ships prebuilds for all major platforms |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `readme-md-generator` / `autoreadme-cli` | Adds interactive setup for a generic template; faster to write by hand for a focused single-command tool | Hand-authored README.md |
| `np` / `release-it` / `semantic-release` | Release automation tools that add config files, changelogs, GitHub releases, and CI dependencies; excessive for a v1.0 one-time publish | Plain `npm publish` |
| `npm publish --provenance` (from local terminal) | Provenance requires a cloud CI/CD OIDC environment (GitHub Actions or GitLab CI); running locally fails with an OIDC token error | Skip for manual v1.0 publish; revisit if CI pipeline is added later |
| `.npmignore` file | Replaces `.gitignore` entirely; can accidentally expose files you thought were gitignored | The `files` field already in package.json |
| Bumping node-pty past ^1.1.0 | 1.1.0 is the validated version; prebuilds confirmed present for target platforms | Stay on ^1.1.0 |
| Changing strip-ansi to v7 | v7 is ESM-only; breaks the CJS project | Stay on ^6.0.1 |
| Adding `"type": "module"` to package.json | Would break node-pty native module interop and require migrating all `require()` calls | Keep CommonJS |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| node-pty@1.1.0 | Node.js >=18 | Prebuilds bundled for darwin-arm64, darwin-x64, win32-arm64, win32-x64; Node-API stable ABI means no recompile on Node minor/patch upgrades |
| strip-ansi@6.0.1 | Node.js >=12, CJS only | Must not upgrade to v7+; v7 is ESM-only |
| vitest@2.1.9 | TypeScript ^5.x | Dev dependency; not shipped in the npm package |
| typescript@5.9.3 | Node.js >=18 | Dev dependency; only tsc output ships |

---

## Sources

- Local inspection of `node_modules/node-pty/scripts/prebuild.js` and `node_modules/node-pty/prebuilds/` — confirmed darwin-arm64, darwin-x64, win32-arm64, win32-x64 prebuilds present; install script uses `node scripts/prebuild.js || node-gyp rebuild` — HIGH confidence
- [prebuildify GitHub — bundled prebuilds in npm tarball](https://github.com/prebuild/prebuildify) — explains why bundled prebuilds avoid a separate download step — MEDIUM confidence
- [npm publish docs](https://docs.npmjs.com/cli/v9/commands/npm-publish/) — `--dry-run` flag confirmed — HIGH confidence
- [npm pack docs](https://docs.npmjs.com/cli/v6/commands/npm-pack/) — dry-run tarball verification — HIGH confidence
- [Shields.io npm version badge](https://shields.io/badges/npm-version) — dynamic badge URL pattern confirmed — HIGH confidence
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements/) — provenance requires CI/CD (GitHub Actions or GitLab); not possible from local — HIGH confidence
- [npm Files & Ignores wiki](https://github.com/npm/cli/wiki/Files-&-Ignores) — `files` field is safer than `.npmignore` — HIGH confidence
- [npm package.json docs](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/) — `repository`, `homepage`, `bugs`, `author` field requirements — HIGH confidence
- [WebSearch: node-pty install experience 2025](https://github.com/microsoft/node-pty/pull/809) — node-pty 1.1.0 load native addons directly from prebuilds directory — MEDIUM confidence

---

*Stack research for: npm publishing of claude-auto-continue (CLI with node-pty native dependency)*
*Researched: 2026-02-27*
