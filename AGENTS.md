# AGENTS.md

<!-- vibekit:agents-core:start -->
<!-- Generated from upsys/kit/ai-doc/references/agents-core.md. Edit there, then run: node upsys/kit/ai-doc/scripts/sync-agents-core.cjs -->

Preserve concurrent work. Finish the whole job before you stop, and never ask Ramzi a question: pick the sound option, do it, verify it, and say in your report what you picked and why (Ramzi, 18 Nov 2026: "Stop asking any questions and finish entirely the job. Do not ever come back with something left to do."). A problem you find on the way is part of the task: fix it and verify it, never report it as a leftover or offer it as a next step. A sign-in, an OAuth screen, a tool pick or a mail to find is yours too: Proton Pass (`pass-cli`), `gws` and the browser reach them. A file another session left uncommitted takes your hunks through a private index (`git-shared-tree` rule), not a handoff. When your change is verified, commit only your own paths (`git add -- <paths>`, then `git commit --only -- <paths>`) and push, client repos included. Edit `AGENTS.md` or `CLAUDE.md` only when asked.

Only three things wait for Ramzi: a message sent under his name, a payment or refund, and deleting another person's unbacked data. Everything else is authorized, client production pushes included. Before deploying, inspect the branch, working-tree diff, target and command side effects.

Every task you work on, in any repo, is a `TSK-n` ticket on that repo's UpSys project, so Ramzi's board shows what each session is on: find or create it before the first edit, keep it `in_progress` with steps you tick, comment each commit, and close it when delivered. The `ticket` skill has the commands (read `~/Studio/upsys/kit/ai-doc/skills/delivery/projects/ticket/SKILL.md` where the repo doesn't list it), and its Stop hook sends a session with edits and no ticket back.

Client, past-call or personal decisions: search `qmd` before relying on memory or declaring information unknown.

Real work goes to the named agent that owns it. A lookup, a read, a status check, a ticket command or a one-file edit under about 5 tool calls stays in the main session, because a fresh agent costs about 48K tokens just to start (Ramzi, 18 Nov 2026: "Always use subagents."; on 24 Nov 2026 he asked to cut usage after every account hit its weekly limit, TSK-3563). Screens, UI and Swift go to the Opus agents. Research, marketing, ops and fetching go to the Sonnet ones, and no more than 4 agents run in parallel from one session. Hand a task to the named agent that owns it (screens and screenshots go to `frontend-designer`), briefed for the fix alone (no gates, re-audits or waits) and sized to finish inside its turn limit: about 15 small items for code work, 3 to 4 surfaces in one theme for a `frontend-designer`, a sign-in plus 5 page actions, or one job moved to a VPS. A build and its screenshots, a change and the kit release it needs, or a sign-up and the publish behind it are 2 agents, and scope sent mid-run counts against the same budget, so it goes to a new agent. The briefs that ran out, and where a new case goes, are in `~/Studio/upsys/kit/ai-doc/references/orchestration.md` (Sizing a brief). A subagent finishes its brief and starts another agent only when it says so. Tool names are case-sensitive (`Bash`, not `bash`), and a skill this repo doesn't list is read at its `~/Studio/upsys/kit/ai-doc/skills` path, never by name.

Code, copy, dependencies, scripts, commands or product/design/release decisions: read the relevant sections of [CODING_STANDARDS.md](CODING_STANDARDS.md) before acting.

Skills, agents and references: edit their owning source through the authoring skill; project projections are generated. Heal lessons there, deleting the contradicted instruction.

<!-- vibekit:agents-core:end -->

## Code Comments: Document the "Why"

When writing or modifying code driven by a design doc or non-obvious constraint, you **must** add a comment explaining **why** the code behaves the way it does. "What" is visible in the code; "why" is not. Target these categories:

- Safety constraints (suppressed actions, guarded entry points)
- Fallback/error-handling choices and their rationale
- Architectural boundaries (IPC separation, which surface owns a feature)
- Compatibility shims (fields that exist for downstream plumbing, not semantics)
- Intentional omissions (skipped data, unsupported edge cases)

If the design doc has a gotcha, the code must have a comment. A maintainer who hasn't read the doc should still understand why the code must not be changed casually.

## Worktree Safety

Always use the primary working directory (the worktree) for all file reads and edits. Never follow absolute paths from subagent results that point to the main repo.

## Cross-Platform Support

Orca targets macOS, Linux, and Windows. Keep all platform-dependent behavior behind runtime checks:

- **Keyboard shortcuts**: Never hardcode `e.metaKey`. Use a platform check (`navigator.userAgent.includes('Mac')`) to pick `metaKey` on Mac and `ctrlKey` on Linux/Windows. Electron menu accelerators should use `CmdOrCtrl`.
- **Shortcut labels in UI**: Display `⌘` / `⇧` on Mac and `Ctrl+` / `Shift+` on other platforms.
- **File paths**: Use `path.join` or Electron/Node path utilities. Never assume `/` or `\`.

## GitHub CLI Usage

Be mindful of the user's `gh` CLI API rate limit: batch requests where possible and avoid unnecessary calls. All code, commands, and scripts must be compatible with macOS, Linux, and Windows.
