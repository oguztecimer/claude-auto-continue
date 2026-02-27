# Phase 6: GitHub Hosting - Research

**Researched:** 2026-02-27
**Domain:** Git preparation, .gitignore, LICENSE, GitHub repository setup
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `.gitignore` scope: Standard Node.js/TypeScript ignores: `node_modules/`, `dist/`, `*.tsbuildinfo`. Ignore `.env`, `.env.*`, and common secret file patterns as safety net. OS files (`.DS_Store`, `Thumbs.db`) excluded.
- Repository metadata: MIT license — add a `LICENSE` file to repo root. GitHub topics: claude, cli, automation, nodejs, typescript. No community files (CONTRIBUTING.md, issue templates) for v1.0.
- Git history strategy: Squash all existing commits into a single "Initial commit". Default branch: `main`. Do NOT tag v1.0.0 yet — tag after npm publish (Phase 8).

### Claude's Discretion
- Whether to include or exclude `.planning/` directory from `.gitignore`
- Whether to include or exclude editor configs (`.vscode/`, `.idea/`) from `.gitignore`

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOST-01 | GitHub repository created at `https://github.com/dakmor/claude-auto-continue` | User action — Claude prepares all files and commits so user only needs to create repo + push |
| HOST-02 | Code pushed to GitHub with proper .gitignore | Research establishes correct `.gitignore` content, squash strategy, and push commands |
</phase_requirements>

---

## Summary

Phase 6 is primarily a file preparation task (`.gitignore` + `LICENSE`) followed by a user action (create GitHub repo and push). Claude's contribution is creating exactly the right `.gitignore` and `LICENSE` so the repository is clean when it lands on GitHub. The existing `.gitignore` at the project root is minimal — it only covers `node_modules/`, `dist/`, and `*.js.map` — and needs to be expanded per the locked decisions.

The git history squash is a discretionary user action. The project has 61 commits on `main` with no remote configured. Squashing into one "Initial commit" is straightforward via `git reset --soft` to the root commit. The planner must document this as a user-performed step with exact commands, but Claude should not perform it automatically.

The `.planning/` directory question (Claude's discretion) has a clear answer: include `.planning/` in the repo — it contains the project's reasoning history and shows professional planning practice, making the repo more trustworthy to npm users. Editor configs (`.vscode/`, `.idea/`) should be ignored — they are machine-specific and add noise to public repos.

**Primary recommendation:** Expand `.gitignore` with standard patterns, create `LICENSE` (MIT 2026, author dakmor), commit both, then hand off to user for repo creation and push with squash instructions documented.

---

## Standard Stack

This phase uses no third-party libraries. It is pure git and file operations.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git | system | Repository operations, squash, push | Only option |
| GitHub | N/A | Public hosting | User decision; package.json already points to `github.com/dakmor/claude-auto-continue` |

### Supporting
| File | Purpose | Notes |
|------|---------|-------|
| `.gitignore` | Exclude build artifacts, secrets, OS files | Already exists but incomplete |
| `LICENSE` | MIT license text | Required for npm trust; `license: "ISC"` in package.json must be updated to `"MIT"` |

### No Installation Required
```bash
# No npm packages to install for this phase
```

---

## Architecture Patterns

### Recommended Project Structure After Phase 6
```
claude-auto-continue/         # GitHub repo root
├── .gitignore                # Expanded (this phase)
├── LICENSE                   # New (this phase)
├── README.md                 # Done (Phase 5)
├── package.json              # Done (Phase 5) — license field must change ISC→MIT
├── package-lock.json         # Tracked (correct)
├── tsconfig.json
├── vitest.config.ts
├── bin/
│   └── claude-auto-continue.js
├── src/                      # All TypeScript source
└── test/                     # All test files
```

Note: `.planning/` IS tracked (not ignored) — it is already committed to git. Keeping it visible on GitHub shows thoughtful project planning.

### Pattern 1: Minimal but Complete .gitignore for Node.js/TypeScript
**What:** A .gitignore that covers all common artifact and secret categories without being so aggressive it hides legitimate tracked files.
**When to use:** Any public Node.js/TypeScript package repository.
**Current state:** The existing `.gitignore` (3 lines) is already committed and tracked. It needs entries added, not replaced.

```
# Existing (keep as-is)
node_modules/
dist/
*.js.map

# Add: TypeScript
*.tsbuildinfo
*.d.ts.map

# Add: Environment / secrets
.env
.env.*
.env.local
*.pem
*.key

# Add: OS files
.DS_Store
Thumbs.db
Desktop.ini

# Add: Editor configs (Claude's discretion — INCLUDE these ignores)
.vscode/
.idea/
*.swp
*.swo
```

### Pattern 2: MIT LICENSE File
**What:** Standard MIT license text dated to copyright year with author name.
**Content:** The canonical MIT License text is short (174 words) and well-known. Year: 2026. Copyright holder: dakmor.

```
MIT License

Copyright (c) 2026 dakmor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Pattern 3: Squash All Commits (User Action)
**What:** Collapse 61 commits into one "Initial commit" so the public repo shows a clean starting point.
**Method:** `git reset --soft` to the very first commit, then amend.
**When to use:** Before pushing to a new public remote for the first time.

```bash
# Get the root commit hash
ROOT=$(git rev-list --max-parents=0 HEAD)

# Soft reset to root (keeps all file changes staged)
git reset --soft "$ROOT"

# Amend the root commit with a new message
git commit --amend -m "Initial commit"

# Verify: should show only 1 commit
git log --oneline
```

**Warning:** This rewrites history. Since there is no remote yet, this is safe. If a remote is added before squashing, use `git push --force-with-lease` after squashing.

### Anti-Patterns to Avoid
- **Ignoring `package-lock.json`:** Do NOT add `package-lock.json` to `.gitignore` for a published package. It documents exact dependency versions and is valuable in the repo.
- **Ignoring `dist/` contents that are tracked:** `dist/` is already excluded by the current `.gitignore` and not tracked — do not accidentally add it.
- **Adding `LICENSE` to `.gitignore`:** License files are always tracked.
- **Tagging v1.0.0 now:** Context.md explicitly says: do NOT tag — tag after npm publish (Phase 8).
- **Using ISC vs MIT inconsistency:** `package.json` currently has `"license": "ISC"`. The user decided MIT. Must update `package.json` `license` field to `"MIT"` to match the LICENSE file, or npm audit warnings appear.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| License text | Custom license wording | Standard MIT text verbatim | Any deviation causes legal ambiguity; npm and GitHub both parse exact SPDX strings |
| .gitignore patterns | Custom glob logic | Standard GitHub Node.js template patterns | GitHub maintains a canonical `gitignore/Node.gitignore` — use that as reference, adapted to this project |

**Key insight:** License files and `.gitignore` patterns have well-established standard forms. Deviating from them creates confusion and potential issues with tooling that parses them.

---

## Common Pitfalls

### Pitfall 1: License Field Mismatch (package.json vs LICENSE file)
**What goes wrong:** `package.json` says `"license": "ISC"` but the repo has an MIT `LICENSE` file. npm registry shows ISC; GitHub shows MIT. npm audit may warn. SPDX tools flag inconsistency.
**Why it happens:** The original scaffolding used ISC; the user chose MIT in the context discussion.
**How to avoid:** Update `package.json` `license` field to `"MIT"` in the same commit that adds `LICENSE`.
**Warning signs:** `npm pack --dry-run` shows `license: ISC` — mismatch with the LICENSE file text.

### Pitfall 2: Squashing After Remote Exists
**What goes wrong:** If user creates the GitHub repo and pushes BEFORE squashing, then squashes, the push will be rejected without `--force`.
**Why it happens:** GitHub won't accept a non-fast-forward push by default.
**How to avoid:** Squash BEFORE creating the remote, OR use `git push --force-with-lease origin main` after squashing.
**Warning signs:** `git push` returns `rejected ... non-fast-forward`.

### Pitfall 3: .planning/ Accidentally Ignored After Being Tracked
**What goes wrong:** If `.planning/` is added to `.gitignore` after it's already been committed, git continues tracking it anyway (gitignore only affects untracked files). This creates a confusing state where the directory is tracked but gitignore says to ignore it.
**Why it happens:** Misunderstanding of when `.gitignore` takes effect.
**How to avoid:** Since `.planning/` is already tracked (committed), do NOT add it to `.gitignore`. The correct action is to decide: keep tracked (recommended) or explicitly `git rm -r --cached .planning/` to untrack.
**Recommendation:** Keep `.planning/` tracked — it's already in git history and adds credibility to the public repo.

### Pitfall 4: dist/ Re-Added to Tracking
**What goes wrong:** Running `git add .` or `git add dist/` stages the built output, bloating the repo.
**Why it happens:** `dist/` exists on disk; forgetting it's in `.gitignore`.
**How to avoid:** `git status` before every commit to verify. The existing `.gitignore` already excludes `dist/`.

### Pitfall 5: GitHub Topics Not Set via CLI
**What goes wrong:** Topics (claude, cli, automation, nodejs, typescript) must be set via GitHub UI or API after repo creation — they cannot be set by a `git push`.
**Why it happens:** Topics are GitHub metadata, not git metadata.
**How to avoid:** Document as a manual step in the plan: after pushing, set topics via GitHub UI (Settings > Topics) or `gh repo edit --add-topic`.

---

## Code Examples

### .gitignore Complete Content
```gitignore
# Dependencies
node_modules/

# Build output
dist/
*.tsbuildinfo
*.js.map

# Environment / secrets
.env
.env.*
.env.local
*.pem
*.key

# OS files
.DS_Store
Thumbs.db
Desktop.ini

# Editor configs
.vscode/
.idea/
*.swp
*.swo
```

### Set GitHub Topics via CLI (after repo creation)
```bash
# Requires gh CLI authenticated
gh repo edit dakmor/claude-auto-continue \
  --add-topic claude \
  --add-topic cli \
  --add-topic automation \
  --add-topic nodejs \
  --add-topic typescript
```

### Full Push Sequence (user-performed)
```bash
# 1. Add remote
git remote add origin https://github.com/dakmor/claude-auto-continue.git

# 2. Push
git push -u origin main

# 3. Verify
gh repo view dakmor/claude-auto-continue
```

### Squash Sequence (optional, user-performed)
```bash
# Get root commit
ROOT=$(git rev-list --max-parents=0 HEAD)

# Soft reset to root
git reset --soft "$ROOT"

# Commit everything as one
git commit --amend -m "Initial commit"

# Verify 1 commit
git log --oneline
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.npmignore` to exclude files from npm | `files` whitelist in package.json | ~2015 | `files` whitelist is the canonical approach; already in use by this project |
| `master` default branch | `main` default branch | GitHub default changed Oct 2020 | This project already uses `main` |

**Deprecated/outdated:**
- `gitignore/Node.gitignore` template from GitHub used to recommend ignoring `package-lock.json` — this was reversed; `package-lock.json` should be committed for applications and packages.

---

## Open Questions

1. **Should `package-lock.json` be committed?**
   - What we know: It's already tracked in the repo. For published npm packages, committing lock files is standard practice.
   - What's unclear: Some guidance says lock files are only important for apps, not libraries.
   - Recommendation: Keep it tracked. It's already there, it documents exact dependency resolution, and removing it would require a commit that touches a tracked file.

2. **Should the squash happen before or be left to user discretion?**
   - What we know: Context.md says "squash all existing commits into a single Initial commit" — this is a locked decision.
   - What's unclear: Whether to automate the squash or just document the commands.
   - Recommendation: Claude documents the commands in the plan and marks the squash as a user action (like pushing), since it permanently rewrites history. The user should confirm before executing.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in config.json — skipping this section.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `/Users/dakmor/Projects/Other/claude-auto-continue/.gitignore` — current state has 3 entries
- Direct inspection of `git ls-files` — confirmed tracked files, `dist/` and `node_modules/` not tracked
- Direct inspection of `git log --oneline` — 61 commits on main, no remote
- `package.json` — `license: "ISC"` confirmed; must be changed to `"MIT"` per CONTEXT.md decision
- `.planning/phases/06-github-hosting/06-CONTEXT.md` — locked decisions reviewed

### Secondary (MEDIUM confidence)
- GitHub gitignore templates for Node.js (standard community knowledge, HIGH stability)
- MIT License canonical text (SPDX standard, HIGH stability)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external libraries; git and filesystem operations only
- Architecture: HIGH — `.gitignore` content and LICENSE text are stable, well-established
- Pitfalls: HIGH — all pitfalls verified against actual project state (inspected tracked files, current `.gitignore`, `package.json`)

**Research date:** 2026-02-27
**Valid until:** 2026-05-27 (stable domain — git/GitHub conventions change slowly)
