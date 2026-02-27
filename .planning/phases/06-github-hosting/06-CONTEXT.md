# Phase 6: GitHub Hosting - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the public GitHub repository at `https://github.com/dakmor/claude-auto-continue` and push the codebase so repository URLs resolve and the npm package has a trusted source link. Prepare .gitignore and LICENSE. The user handles repo creation and push.

</domain>

<decisions>
## Implementation Decisions

### .gitignore scope
- Standard Node.js/TypeScript ignores: `node_modules/`, `dist/`, `*.tsbuildinfo`
- Ignore `.env`, `.env.*`, and common secret file patterns as safety net
- OS files (`.DS_Store`, `Thumbs.db`) excluded

### Claude's Discretion (.gitignore)
- Whether to include or exclude `.planning/` directory
- Whether to include or exclude editor configs (`.vscode/`, `.idea/`)

### Repository metadata
- Short punchy tagline for GitHub description (not the full npm description)
- MIT license — add a `LICENSE` file to repo root
- GitHub topics for discoverability: claude, cli, automation, nodejs, typescript
- No community files (CONTRIBUTING.md, issue templates) for v1.0 — keep it minimal

### Git history strategy
- Squash all existing commits into a single "Initial commit"
- Default branch: `main`
- Do NOT tag v1.0.0 at this point — tag after npm publish succeeds (Phase 8)

</decisions>

<specifics>
## Specific Ideas

- Tagline should be punchy, something like "Auto-continue for Claude Code CLI sessions"
- Keep the repo page clean and professional for a first npm package impression

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-github-hosting*
*Context gathered: 2026-02-27*
