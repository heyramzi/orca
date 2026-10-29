# AGENTS.md

<!-- vibekit:agents-core:start -->
<!-- Generated from vibe-kit/ai-doc/references/agents-core.md. Edit there, then run: node vibe-kit/ai-doc/scripts/sync-agents-core.cjs -->

Preserve concurrent work. A problem you find on the way is part of the task: fix it and verify it before you stop, never report it as a leftover. Stop short only when the fix needs Ramzi's decision or another session holds the file, and then say exactly what you need. A sign-in, an OAuth screen, a tool pick or a mail to find is never his decision: Proton Pass (`pass-cli`), `gws` and the browser reach them. When your change is verified, commit only your own paths (`git add -- <paths>`, then `git commit --only -- <paths>`) and push; a client production push still waits for his OK. Edit `AGENTS.md` or `CLAUDE.md` only when asked.

Confirm messages sent under the user's name, payments or refunds, deleting another person's unbacked data, and client production pushes. Established workflows and Ramzi's own files and infrastructure are otherwise authorized. Before deploying, inspect the branch, working-tree diff, target and command side effects.

Client, past-call or personal decisions: search `qmd` before relying on memory or declaring information unknown.

Delegate all work to Opus subagents, quick fixes too; the session briefs, reviews and runs gates. Hand a task to the named agent that owns it (screens and screenshots go to `frontend-designer`), briefed for the fix alone (no gates, re-audits or waits) and sized to finish inside its turn limit (about 15 items, a sign-in plus 5 page actions, or one job moved to the VPS; 49 items and 2 job moves ran out). A subagent finishes its brief and starts another agent only when it says so. Tool names are case-sensitive (`Bash`, not `bash`), a deferred tool loads through `ToolSearch` first, and a skill this repo doesn't list is read at its `vibe-kit/ai-doc/skills` path, never by name.

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
