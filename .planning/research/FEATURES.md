# Feature Research

**Domain:** CLI process monitoring / auto-resume tool for Claude Code rate limits
**Researched:** 2026-02-27
**Confidence:** HIGH (multiple verified sources: GitHub issues, competing tools, official Anthropic issues)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Detect "Claude usage limit reached" message | Core problem being solved; every competing tool does this | LOW | Pattern: `"Claude AI usage limit reached"` or `"limit reached ∙ resets Xpm"` in terminal output |
| Parse reset timestamp from detected message | Without this, you cannot schedule the resume — the timestamp is embedded in Claude Code's output | LOW | Claude Code outputs a human-readable reset time; must parse it reliably |
| Wait until reset time, then send "continue" | The entire value proposition — watching so the user doesn't have to | LOW | Must handle the escape sequence before typing: Escape → "continue" → Enter (per autoclaude) |
| Visible countdown while waiting | Users need to know the tool is alive and working; silence = distrust | LOW | "Resuming in 01:25:10..." style; all competing tools (claude-auto-resume, autoclaude) show this |
| Support multiple concurrent sessions | The user's explicit requirement: 2-5 parallel Claude Code terminals | MEDIUM | Core differentiator of the Node.js approach over single-session shell scripts |
| Status display per session | Users must know which sessions are waiting, which are running, which have resumed | MEDIUM | autoclaude uses color coding (orange/green/red/cyan) per monitored pane |
| Graceful error handling if session dies | If Claude Code crashes instead of rate-limiting, the tool must not hang indefinitely | LOW | Detect terminal close / process exit and remove from monitoring |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-terminal session identity tracking | Claude Code's `--continue` is global-last-session; running multiple instances means each terminal should resume ITS own session, not any session | MEDIUM | Anthropic GitHub issue #21731 documents this exact pain point; use $TMUX_PANE, $ITERM_SESSION_ID, tty as identifiers |
| Non-tmux operation (spawns/wraps process directly) | autoclaude requires tmux; claude-auto-resume requires tmux; Node.js pty wrapping removes this hard dependency | HIGH | node-pty or child_process can wrap Claude Code directly; opens the tool to users not in tmux |
| Zero-configuration startup | Single command to start watching all Claude Code sessions; no config files to write | LOW | Shell scripts require args; autoclaude requires explicit pane selection; discoverability matters |
| Desktop notification on resume | Users step away during wait; notify them when work automatically resumes | LOW | macOS: `osascript -e 'display notification...'`; node-notifier; opt-in since not all environments support it |
| Configurable "continue" prompt text | Some users use custom prompts beyond bare "continue" (e.g., "continue, focus on the tests") | LOW | Simple config option; higher value than complexity suggests |
| Human-readable time remaining (smart units) | "Resumes in 3 hours 22 minutes" is more scannable than "12340 seconds" | LOW | Trivially differentiating; competing tools vary in quality here |
| Log of resume events | Record which sessions resumed and when; useful for understanding usage patterns | LOW | Append to a local log file; no server needed |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| `--dangerously-skip-permissions` flag passthrough | claude-auto-resume uses it; seems to enable full automation | Executes file operations and code changes without any confirmation — a critical security risk in a tool running unattended | Resume normal interactive Claude Code sessions; do not bypass permission model |
| GUI / web dashboard | "Real" apps have GUIs; more visual than TUI | Massively out of scope; defeats the terminal-native purpose; requires a server process | TUI with color-coded status (like autoclaude); a rich terminal display is enough |
| Cross-tool session migration (Claude → Gemini → Codex) | "continues" tool does this; handles rate limits by switching AI provider | Fundamentally different product; adds context-loss risk; not the problem being solved | Stay focused: wait for Claude Code's reset, resume the same session with full context intact |
| Multi-agent orchestration (locks, coordination, 20+ agents) | claude_code_agent_farm shows what's possible | Requires tmux, complex coordination infrastructure, and a completely different mental model; overkill for personal 2-5 terminal use | Keep scope to monitoring and resuming; orchestration is a separate product |
| Cloud sync / remote resume notifications | "Resume my session from my phone" | Requires a server, auth, security model — multiplies complexity by 10x | macOS desktop notification (local) is sufficient and achievable in <100 lines |
| Automatic plan/prompt injection on resume | "Send a smarter prompt than 'continue'" | Risks confusing the session state; "continue" is idiomatic and Claude understands it | Offer configurable resume text as a simple string option, but default to "continue" |
| Rate limit prediction / avoidance | "Warn me before I hit the limit" | Claude Code does not expose token usage data accessible to a wrapper process; would require reverse-engineering or API calls | Reactive detection is reliable; predictive is speculative and brittle |

---

## Feature Dependencies

```
Parse Reset Timestamp
    └──requires──> Detect Rate Limit Message

Wait Until Reset
    └──requires──> Parse Reset Timestamp

Send "continue" Command
    └──requires──> Wait Until Reset
    └──requires──> Active session handle (PTY write or tmux send-keys)

Visible Countdown
    └──requires──> Parse Reset Timestamp
    └──enhances──> Wait Until Reset (makes it legible)

Multi-Session Support
    └──requires──> Session handle per process (PTY or tmux pane ID)
    └──requires──> Send "continue" Command

Per-Terminal Session Identity
    └──enhances──> Multi-Session Support (prevents wrong-session resume)
    └──requires──> Terminal environment variable inspection ($TMUX_PANE, $ITERM_SESSION_ID, tty)

Desktop Notification
    └──requires──> Send "continue" Command (notify after resume, not before)

Status Display
    └──requires──> Detect Rate Limit Message
    └──enhances──> Multi-Session Support

Log of Resume Events
    └──requires──> Send "continue" Command
```

### Dependency Notes

- **Parse Reset Timestamp requires Detect Rate Limit Message:** You can't know when to resume until you've confirmed a limit hit and found the timestamp in the output.
- **Send "continue" Command requires Wait Until Reset:** Sending early returns an error from Claude Code; the tool must wait precisely to the reset window.
- **Multi-Session Support requires a session handle per process:** Each monitored Claude Code instance needs an independent channel to write "continue" into — this is the core technical challenge.
- **Per-Terminal Session Identity enhances Multi-Session Support:** Without it, resuming any terminal might resume the wrong session. Particularly important when user has 2-5 active sessions.
- **Desktop Notification requires Send "continue" Command:** Notify the user AFTER the resume fires, not while waiting (they already know it's waiting from the countdown).

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Detect "Claude usage limit reached" message in Claude Code output — the core trigger that makes everything else possible
- [ ] Parse the reset timestamp from the detected message — required to know when to send "continue"
- [ ] Wait until reset time, then send "continue" to the session — the entire value of the tool
- [ ] Visible countdown timer while waiting — without this users cannot tell if the tool is working
- [ ] Support 2-5 concurrent Claude Code sessions — the user's explicit requirement; single-session is insufficient
- [ ] Status display showing each session's current state — critical for multi-session use; blind monitoring creates anxiety

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Desktop notification on resume — add when users confirm they step away during waits; low complexity payoff
- [ ] Log of resume events — add when users want to understand their usage patterns; trivial to implement
- [ ] Configurable resume prompt text — add when users request custom prompts beyond bare "continue"
- [ ] Per-terminal session identity — add when users report the wrong session gets resumed; needs real-world validation of the problem

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Non-tmux process wrapping via node-pty — significant complexity (native addon, PTY lifecycle management); validate tmux-based approach first
- [ ] Human-readable smart time formatting — quality-of-life improvement, not blocking anything
- [ ] Plugin/hook system for custom on-resume actions — only if users request extensibility patterns

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Detect rate limit message | HIGH | LOW | P1 |
| Parse reset timestamp | HIGH | LOW | P1 |
| Wait and send "continue" | HIGH | LOW | P1 |
| Visible countdown | HIGH | LOW | P1 |
| Multi-session support (2-5) | HIGH | MEDIUM | P1 |
| Status display per session | HIGH | MEDIUM | P1 |
| Graceful error if session dies | MEDIUM | LOW | P1 |
| Desktop notification on resume | MEDIUM | LOW | P2 |
| Log of resume events | LOW | LOW | P2 |
| Configurable resume prompt | MEDIUM | LOW | P2 |
| Per-terminal session identity | MEDIUM | MEDIUM | P2 |
| Non-tmux PTY wrapping | MEDIUM | HIGH | P3 |
| Smart time formatting | LOW | LOW | P2 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | claude-auto-resume (shell script) | autoclaude (Go TUI) | Our Approach (Node.js) |
|---------|-----------------------------------|---------------------|------------------------|
| Rate limit detection | Pattern matches Claude output | Polls tmux pane every 3s | Watch stdout/stderr of managed processes |
| Reset timestamp parsing | Yes, extracts from message | Yes, extracts "resets Xpm" | Yes, same pattern |
| Send "continue" | Yes, via new `claude -p` invocation | Yes: Escape → continue → Enter | Yes: write to stdin of process |
| Countdown display | Yes | Yes (visual TUI) | Yes |
| Multi-session support | No (single script per session) | Yes (all tmux panes) | Yes (explicit multi-process management) |
| TUI / status dashboard | No | Yes (color-coded pane list) | Yes (at minimum, per-session status lines) |
| tmux required | No (but Claude runs fresh, loses context) | Yes (hard dependency) | No (tmux optional; can wrap process directly) |
| Continues same session | No (starts new session with original prompt) | Yes | Yes (resumes the paused session) |
| `--dangerously-skip-permissions` | Yes (security risk) | No | No (never bypass permissions) |
| Configuration | CLI flags | Toggle per pane via TUI | Config file + CLI flags |
| Language | Bash | Go | Node.js |
| Installation | wget/curl script | Homebrew or go install | npm install -g |

**Key gap in existing tools:** autoclaude requires tmux (hard dependency), and claude-auto-resume loses the session context by starting a new `claude -p` invocation rather than continuing the existing conversation. Neither works well for the target workflow of 2-5 long-running sessions that must resume in-context.

---

## Sources

- [terryso/claude-auto-resume — GitHub](https://github.com/terryso/claude-auto-resume) — shell script competitor; feature baseline (MEDIUM confidence, verified via direct fetch)
- [henryaj/autoclaude — GitHub](https://github.com/henryaj/autoclaude) — Go TUI competitor; primary reference for multi-session monitoring patterns (MEDIUM confidence, verified via direct fetch)
- [autoclaude.blmc.dev — official autoclaude site](http://autoclaude.blmc.dev/) — confirms polling interval (3s), send sequence (Escape → continue → Enter), color-coded status (HIGH confidence, primary source)
- [Anthropic/claude-code Issue #18980](https://github.com/anthropics/claude-code/issues/18980) — user pain points: 5+ tabs, manual continue, five-hour sessions (HIGH confidence, primary source)
- [Anthropic/claude-code Issue #26789](https://github.com/anthropics/claude-code/issues/26789) — requested UI: "Auto-continue once limit resets" as third option in rate-limit-options (HIGH confidence, primary source)
- [Anthropic/claude-code Issue #21731](https://github.com/anthropics/claude-code/issues/21731) — per-terminal session affinity problem; terminal identifier hierarchy ($ITERM_SESSION_ID, $TMUX_PANE, tty) (HIGH confidence, primary source)
- [Dicklesworthstone/claude_code_agent_farm — GitHub](https://github.com/Dicklesworthstone/claude_code_agent_farm) — shows what over-engineering looks like; useful anti-feature reference (MEDIUM confidence)
- [frankbria/ralph-claude-code — GitHub](https://github.com/frankbria/ralph-claude-code) — autonomous loop patterns; rate limit auto-wait behavior (MEDIUM confidence)
- [Hacker News: npx continues](https://news.ycombinator.com/item?id=47075089) — user feedback: "just want to resume last paused session, like Unix fg" (MEDIUM confidence)
- [AW2307/Tmux-Orchestrator-Enhanced-AW — GitHub](https://github.com/AW2307/Tmux-Orchestrator-Enhanced-AW) — audio notifications, multi-agent coordination; anti-feature territory for this project (MEDIUM confidence)
- [microsoft/node-pty — npm](https://www.npmjs.com/package/node-pty) — PTY approach for non-tmux process wrapping (HIGH confidence, official package)

---
*Feature research for: CLI process monitoring / Claude Code auto-continue*
*Researched: 2026-02-27*
