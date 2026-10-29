# CLAUDE.md

<!-- vibekit:agents-core:start -->
<!-- Generated from vibe-kit/ai-doc/references/agents-core.md. Edit there, then run: node vibe-kit/ai-doc/scripts/sync-agents-core.cjs -->

Preserve concurrent work. A problem you find on the way is part of the task: fix it and verify it before you stop, never report it as a leftover. Stop short only when the fix needs Ramzi's decision or another session holds the file, and then say exactly what you need. A sign-in, an OAuth screen, a tool pick or a mail to find is never his decision: Proton Pass (`pass-cli`), `gws` and the browser reach them. When your change is verified, commit only your own paths (`git add -- <paths>`, then `git commit --only -- <paths>`) and push; a client production push still waits for his OK. Edit `AGENTS.md` or `CLAUDE.md` only when asked.

Confirm messages sent under the user's name, payments or refunds, deleting another person's unbacked data, and client production pushes. Established workflows and Ramzi's own files and infrastructure are otherwise authorized. Before deploying, inspect the branch, working-tree diff, target and command side effects.

Client, past-call or personal decisions: search `qmd` before relying on memory or declaring information unknown.

Delegate all work to Opus subagents, quick fixes too; the session briefs, reviews and runs gates. Hand a task to the named agent that owns it (screens and screenshots go to `frontend-designer`), briefed for the fix alone (no gates, re-audits or waits) and sized to finish inside its turn limit (about 15 items, a sign-in plus 5 page actions, or one job moved to the VPS; 49 items and 2 job moves ran out). A subagent finishes its brief and starts another agent only when it says so. Tool names are case-sensitive (`Bash`, not `bash`), a deferred tool loads through `ToolSearch` first, and a skill this repo doesn't list is read at its `vibe-kit/ai-doc/skills` path, never by name.

Code, copy, dependencies, scripts, commands or product/design/release decisions: read the relevant sections of [CODING_STANDARDS.md](CODING_STANDARDS.md) before acting.

Skills, agents and references: edit their owning source through the authoring skill; project projections are generated. Heal lessons there, deleting the contradicted instruction.

<!-- vibekit:agents-core:end -->

See also: [AGENTS.md](./AGENTS.md) for agent-specific rules.

## Code Comments: Document the "Why"

When implementing behavior driven by a design doc, spec, or non-obvious constraint, **add a comment explaining why** the code does what it does, not just what it does. This is especially important for:

- **Safety constraints**: e.g., suppressing an action because it could silently erase a signal, re-create a conflict, or mislead the user.
- **Fallback/error-handling choices**: e.g., defaulting to `'modified'` on fs error because it's the least misleading option.
- **Architectural boundaries**: e.g., why state lives in the renderer and never crosses IPC, or why a feature belongs to Source Control and not Checks.
- **Compatibility shims**: e.g., when a field exists purely for downstream plumbing and does not carry semantic meaning.
- **Intentional omissions**: e.g., skipping submodule conflicts or not providing rename metadata because the data source doesn't support it.

A future maintainer who hasn't read the design doc should be able to understand from the comment alone why the code must not be changed casually.

## Package Manager

This project uses **pnpm**. Never use `npm` or `yarn`.

- Use `pnpm install` (not `npm install`)
- Use `pnpm add <pkg>` (not `npm install <pkg>`)
- Use `pnpm run <script>` (not `npm run <script>`)
- The lock file is `pnpm-lock.yaml`. Do not generate `package-lock.json` or `yarn.lock`.
