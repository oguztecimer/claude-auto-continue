# Phase 5: Package Preparation - Research

**Researched:** 2026-02-27
**Domain:** npm package.json metadata, README authorship, npm tarball packaging
**Confidence:** HIGH

## Summary

Phase 5 is a pure file-editing phase — no new code, no new dependencies. It has two discrete work items: (1) update `package.json` with correct metadata, and (2) write a `README.md` for the npm page. Both tasks are well-understood and low-risk.

The current `package.json` already has a `files` whitelist (`dist/`, `bin/`). A critical finding is that npm always includes `README.md` in every published tarball regardless of the `files` whitelist — it is an always-included file. This means adding `README.md` to `files` is not required; just placing it at the project root is sufficient. Running `npm pack --dry-run` after creating the README will confirm it appears in the tarball.

The `cac` bin alias collision is the highest-risk item in this phase. The `cac` npm package is a popular CLI framework — having a conflicting global bin alias causes silent shadowing on user systems. Renaming to `clac` before first publish avoids this permanently. After a package is published, changing a bin alias requires a major version bump to signal a breaking change; doing it now in pre-publish costs nothing.

**Primary recommendation:** Edit `package.json` first (version, author, bin, repository/homepage/bugs), then write `README.md` to project root. No new libraries needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| META-01 | Version bumped to `1.0.0` in package.json | Direct JSON field edit: `"version": "1.0.0"` |
| META-02 | Author field set to `"dakmor"` | Direct JSON field edit: `"author": "dakmor"` |
| META-03 | Bin alias renamed from `cac` to `clac` | Remove `"cac"` key from `bin` object, add `"clac"` key pointing to same file |
| META-04 | `repository`, `homepage`, `bugs` fields populated with GitHub URL | Three new JSON fields with standard npm format (see Code Examples) |
| DOCS-01 | README includes project description and badges | shields.io dynamic badges for npm version and node engine; placeholder URLs are fine before publish |
| DOCS-02 | README includes install and usage instructions | `npm install -g claude-auto-continue`, then `clac` or `claude-auto-continue` usage |
| DOCS-03 | README documents Linux build tool requirements for node-pty | `sudo apt-get install build-essential python3 make g++` on Debian/Ubuntu; node-pty is a native addon requiring node-gyp |
| DOCS-04 | README includes how-it-works section | Document: PTY wrap → PatternDetector regex → Scheduler waits until resetTime → StdinWriter sends "continue"; cli.ts help text is a good source |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| npm (built-in) | 11.9.0 (installed) | `npm pack --dry-run` verification | Native, no install needed |
| shields.io | N/A (CDN badge service) | Dynamic README badges | Universally used; zero config |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | - | - | This phase is pure file editing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shields.io badges | Static text only | Badges look more professional on npm page; shields.io is the ecosystem default |
| `"author": "dakmor"` string | Full author object `{"name":"dakmor","url":"..."}` | String form is fine for v1.0; object form allows adding email/url later |

**Installation:**
```bash
# No new dependencies required for this phase
```

## Architecture Patterns

### Recommended Project Structure
```
claude-auto-continue/
├── package.json         # edit: version, author, bin, repository, homepage, bugs
├── README.md            # create: description, badges, install, usage, prereqs, how-it-works
├── bin/
│   └── claude-auto-continue.js   # unchanged
├── dist/                          # unchanged
└── src/                           # unchanged
```

### Pattern 1: package.json `bin` Object Format
**What:** The `bin` field maps CLI command names to entry-point scripts. Multiple aliases can point to the same script.
**When to use:** When you want users to type a short command in addition to the full package name.
**Example:**
```json
// Standard npm bin field — multiple aliases, same script
"bin": {
  "claude-auto-continue": "bin/claude-auto-continue.js",
  "clac": "bin/claude-auto-continue.js"
}
```

### Pattern 2: package.json Repository/Homepage/Bugs Fields
**What:** Three separate fields that npm uses to build the sidebar on the npm registry page.
**When to use:** All published packages should have these.
**Example:**
```json
// Source: https://docs.npmjs.com/cli/v7/configuring-npm/package-json
"repository": {
  "type": "git",
  "url": "https://github.com/dakmor/claude-auto-continue.git"
},
"homepage": "https://github.com/dakmor/claude-auto-continue#readme",
"bugs": {
  "url": "https://github.com/dakmor/claude-auto-continue/issues"
}
```

### Pattern 3: README Badge Format (shields.io)
**What:** Dynamic SVG badges from shields.io embedded as markdown images with links.
**When to use:** Top of README, before description text.
**Example:**
```markdown
[![npm version](https://img.shields.io/npm/v/claude-auto-continue.svg)](https://www.npmjs.com/package/claude-auto-continue)
[![Node.js >=18](https://img.shields.io/node/v/claude-auto-continue.svg)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
```
Note: npm badges resolve once the package is live. They show correctly on first publish; use them now with confidence.

### Pattern 4: README Structure for CLI Tools
**What:** Standard sections that npm page readers expect for a CLI tool.
**Recommended order:**
1. Title + short tagline
2. Badges (npm version, node engine, license)
3. Description (what it does, why it exists)
4. Install
5. Usage (with examples)
6. Prerequisites (platform-specific notes)
7. How It Works (internals overview)
8. License

### Anti-Patterns to Avoid
- **Adding `README.md` to the `files` field:** npm always includes README automatically. Adding it to `files` is redundant and noisy.
- **Keeping the `cac` bin alias:** Collides with the `cac` npm package (a CLI framework). Will shadow or be shadowed on user systems. Remove before first publish.
- **Adding `.npmignore`:** The project decision (from STATE.md) is to rely solely on the `files` whitelist. Two exclusion systems conflict; use one.
- **Using `--provenance` on publish:** Requires GitHub Actions OIDC. Fails from local terminal. Not applicable here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Badge generation | Custom SVG files | shields.io URLs | Automatically updates with live npm data after publish |
| Tarball validation | Manual file listing | `npm pack --dry-run` | Built-in, authoritative, exactly what npm uses at publish time |

**Key insight:** `npm pack --dry-run` is the definitive verification tool — it uses exactly the same logic as `npm publish` for determining tarball contents. Any discrepancy between dry-run and expectations must be resolved before publishing.

## Common Pitfalls

### Pitfall 1: `cac` Bin Alias Collision
**What goes wrong:** Installing `claude-auto-continue` globally overwrites or is overwritten by the `cac` CLI framework, which is a popular depended-upon package.
**Why it happens:** npm creates symlinks in the global bin directory keyed on the alias name. Two packages with the same alias name overwrite each other's symlink.
**How to avoid:** Rename the alias to `clac` in this phase before any publish happens. This is the confirmed project decision.
**Warning signs:** If `cac --version` after install shows this package's version, a collision has occurred.

### Pitfall 2: README Not Appearing in `npm pack --dry-run`
**What goes wrong:** `npm pack --dry-run` output shows no `README.md` line even after creating the file.
**Why it happens:** The file must be named exactly `README.md`, `readme.md`, `README`, `README.txt`, etc. at the project root. A file in a subdirectory won't be auto-included.
**How to avoid:** Place `README.md` at `/Users/dakmor/Projects/Other/claude-auto-continue/README.md` (project root, same directory as `package.json`).
**Warning signs:** `npm pack --dry-run` output has no readme entry.

### Pitfall 3: Missing `.git` suffix on `repository.url`
**What goes wrong:** npm registry sidebar shows a broken or non-standard repository link.
**Why it happens:** The `repository.url` field expects the clone URL (ending in `.git`), not the browser URL.
**How to avoid:** Use `https://github.com/dakmor/claude-auto-continue.git` (with `.git`) for `repository.url`, and `https://github.com/dakmor/claude-auto-continue#readme` for `homepage`.

### Pitfall 4: `bin` Script Missing Shebang or Execute Permissions
**What goes wrong:** After `npm install -g`, running `clac` gives a permission error or "not found".
**Why it happens:** The bin entry file needs `#!/usr/bin/env node` as its first line. npm sets execute permissions automatically during install, but the shebang must be present.
**How to avoid:** `bin/claude-auto-continue.js` already has `#!/usr/bin/env node` (verified). The rename to `clac` only changes the `bin` key in package.json, not the file itself — no change needed to the script file.

### Pitfall 5: Linux Users Failing to Install Due to node-pty Native Build
**What goes wrong:** `npm install -g claude-auto-continue` fails on Linux with `node-gyp` errors.
**Why it happens:** `node-pty` is a native addon that compiles C++ bindings at install time via node-gyp. Linux systems often lack `build-essential`, `python3`, and `make` by default.
**How to avoid:** Document prerequisites in README with the exact install command:
```bash
# Debian/Ubuntu
sudo apt-get install build-essential python3 make g++
# Then install the package
npm install -g claude-auto-continue
```
macOS users with Xcode Command Line Tools installed are unaffected. Windows users need the windows-build-tools.

## Code Examples

Verified patterns from official sources and current package.json:

### Final package.json metadata section
```json
{
  "name": "claude-auto-continue",
  "version": "1.0.0",
  "description": "Automatically resumes Claude Code sessions after usage limits reset",
  "author": "dakmor",
  "license": "ISC",
  "bin": {
    "claude-auto-continue": "bin/claude-auto-continue.js",
    "clac": "bin/claude-auto-continue.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/dakmor/claude-auto-continue.git"
  },
  "homepage": "https://github.com/dakmor/claude-auto-continue#readme",
  "bugs": {
    "url": "https://github.com/dakmor/claude-auto-continue/issues"
  }
}
```

### README.md skeleton
```markdown
# claude-auto-continue

[![npm version](https://img.shields.io/npm/v/claude-auto-continue.svg)](https://www.npmjs.com/package/claude-auto-continue)
[![Node.js >=18](https://img.shields.io/node/v/claude-auto-continue.svg)](https://nodejs.org)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

Automatically resumes Claude Code sessions after usage limits reset — no manual babysitting.

## Install

```bash
npm install -g claude-auto-continue
```

## Usage

```bash
claude-auto-continue          # start watching; launches 'claude' automatically
clac                          # short alias
clac -- --continue            # pass flags to Claude Code
```

## Prerequisites (Linux)

`node-pty` compiles a native addon. On Debian/Ubuntu you need build tools first:

```bash
sudo apt-get install build-essential python3 make g++
```

macOS with Xcode Command Line Tools installed works out of the box.

## How It Works

1. Wraps `claude` in a PTY so it receives a real terminal
2. Monitors output with a regex detector for rate-limit messages
3. Parses the reset timestamp from the message
4. Waits silently with a status bar and countdown timer
5. Sends `continue\n` to the PTY at reset time, resuming the session

## License

ISC
```

### Verifying README inclusion in tarball
```bash
npm pack --dry-run
# Look for a line like:
# npm notice   1.2kB README.md
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.npmignore` for exclusion | `files` whitelist in package.json | npm ~2016+ | `files` is cleaner; `.npmignore` adds a second system to maintain |
| Python 2 for node-gyp | Python 3.6+ | node-gyp v8+ (2022) | No Python 2 required on modern systems |
| Static badge images | shields.io dynamic SVG URLs | ~2014+ | Badges auto-update with live registry data |

**Deprecated/outdated:**
- `.npmignore`: Redundant when `files` whitelist is present; the project decision is not to use it.
- `prepublish` script hook: Replaced by `prepublishOnly` (which the project already uses correctly).
- Python 2 for node-gyp: No longer required; Python 3.6+ is sufficient.

## Open Questions

1. **Should the `help` text in `cli.ts` still reference `cac` as an alias?**
   - What we know: `src/cli.ts` `showHelp()` function mentions `cac [options]` in the USAGE block
   - What's unclear: Whether to update the help text to say `clac` — this is a code change in a source file, not package.json
   - Recommendation: Yes, update the help text to `clac` for consistency. This is a small change to `src/cli.ts` and `npm run build` will recompile. Include it in the package.json edit plan (plan 05-01) since it's part of the bin rename story.

2. **Should `README.md` be added to the `files` array?**
   - What we know: npm always includes README.md automatically; the `files` array is not needed for README inclusion
   - What's unclear: Whether to add it for explicitness
   - Recommendation: Do NOT add it. The npm docs confirm it is always included. Adding it would be redundant and would break the principle of minimal `files` array.

## Sources

### Primary (HIGH confidence)
- npm docs (docs.npmjs.com) — `files` field behavior, always-included files (README, LICENSE, package.json), `repository`/`homepage`/`bugs` field formats
- shields.io (shields.io) — badge URL format, dynamic npm version badges
- Project source files (verified directly) — `bin/claude-auto-continue.js` shebang confirmed, `package.json` current state confirmed, `npm pack --dry-run` output verified live

### Secondary (MEDIUM confidence)
- nodejs/node-gyp docs (nodejs.github.io/node-addon-examples) — Linux build tool prerequisites for node-pty
- WebSearch results cross-referenced with node-gyp official GitHub — Python 3.6+ requirement, `build-essential` apt package

### Tertiary (LOW confidence)
- None — all key findings verified from primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external libraries needed; pure file editing
- Architecture: HIGH — npm field formats confirmed from official docs; current package.json examined directly
- Pitfalls: HIGH — `cac` collision confirmed from project decisions in STATE.md; README auto-inclusion confirmed from npm docs; shebang confirmed by reading the actual bin file

**Research date:** 2026-02-27
**Valid until:** 2026-05-27 (stable domain — npm field formats change very rarely)
