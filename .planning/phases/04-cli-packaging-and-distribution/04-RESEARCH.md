# Phase 4: CLI Packaging and Distribution - Research

**Completed:** 2026-02-27
**Researcher:** gsd-phase-researcher
**Status:** RESEARCH COMPLETE

## Question: What do I need to know to PLAN this phase well?

### Current Project State

The project is a Node.js/TypeScript tool using CommonJS modules. Key facts from codebase exploration:

- **Entry point:** `src/cli.ts` — already exists with full logic (ProcessSupervisor wiring, status bar, countdown card)
- **Build system:** TypeScript (`tsc`) compiles `src/` to `dist/`, configured in `tsconfig.json`
- **Module format:** CommonJS (`"module": "commonjs"` in tsconfig)
- **package.json:** Already has `"main": "dist/index.js"`, `"scripts.build": "tsc"`, but NO `"bin"` field
- **Dependencies:** `node-pty` (native), `strip-ansi@6` (CJS-compatible)
- **.gitignore:** Includes `dist/` and `node_modules/`
- **No `dist/` directory exists yet** — TypeScript has not been compiled

### What Needs to Happen (INFR-03)

1. **Add `bin` field to package.json** — Maps `claude-auto-continue` (and a short alias like `cac`) to the compiled CLI entry point
2. **Add shebang to CLI entry point** — `#!/usr/bin/env node` at top of compiled `dist/cli.js`
3. **Add `--help` flag handling** — Print usage instructions when invoked with `--help` or `--version`
4. **Compile TypeScript** — Run `tsc` to produce `dist/` artifacts
5. **Verify global install works** — `npm install -g .` then `claude-auto-continue --help`

### Technical Details

#### Shebang Strategy
TypeScript doesn't preserve shebangs. Two approaches:
1. **Banner option in tsconfig** (TypeScript 5.5+): Not available for CJS output
2. **Post-build script** — `echo '#!/usr/bin/env node' | cat - dist/cli.js > temp && mv temp dist/cli.js`
3. **Wrapper script** — A plain `.js` file in `bin/` that requires `../dist/cli.js`

**Recommendation:** Use a thin wrapper `bin/claude-auto-continue.js` that has the shebang and requires `../dist/cli.js`. This is the standard npm pattern:
```js
#!/usr/bin/env node
require('../dist/cli.js');
```

This avoids post-build hacks and works reliably with `npm link` and `npm install -g`.

#### package.json `bin` Field
```json
{
  "bin": {
    "claude-auto-continue": "bin/claude-auto-continue.js",
    "cac": "bin/claude-auto-continue.js"
  }
}
```

Both names point to same entry. `cac` is short for "claude-auto-continue".

#### Help Output
The existing `cli.ts` has `parseArgs()` but no `--help` handling. Need to add:
- `--help` / `-h`: Print usage text and exit
- `--version` / `-v`: Print version from package.json and exit
- Invalid argument handling: Print usage on unrecognized flags

#### Files Field for npm Publish
Add `"files"` to package.json to control what gets published:
```json
{
  "files": ["dist/", "bin/"]
}
```
This excludes `src/`, `test/`, `.planning/`, etc. from the published package.

#### engines Field
Since `node-pty` requires Node.js 18+ and the project uses ES2022 features:
```json
{
  "engines": {
    "node": ">=18"
  }
}
```

#### prepublishOnly Script
Ensure `tsc` runs before `npm publish`:
```json
{
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

### Risk Assessment

**Low risk phase.** All work is configuration and thin glue code:
- No new business logic
- No new dependencies
- No architectural decisions
- Standard npm packaging patterns
- Existing test suite should still pass (no source changes to tested modules)

### Plan Recommendations

Single plan is sufficient — this is all configuration work:
1. Task 1: Update package.json (bin, files, engines, scripts)
2. Task 2: Create bin wrapper + add help/version to cli.ts
3. Task 3: Build, verify global install, verify help output

All in Wave 1, no dependencies on other plans.

## RESEARCH COMPLETE
