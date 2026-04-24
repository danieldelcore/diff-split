

# diff-split

![diff-split banner](public/diff-split-banner.jpg)

`diff-split` turns one big staged monorepo diff into multiple clean PR branches.

It is intentionally boring in the best way: no GitHub API coupling, no Bitbucket integration, no stack-management workflow to learn. Just local `git`.

## Why this exists

If you work in a large monorepo, this pattern is probably familiar:

- You run a codemod across many packages.
- You end up with one giant, technically-safe diff.
- One PR means slow CI, flaky reruns, and painful review.
- Stacked diffs can help, but they add ceremony and coordination overhead.

`diff-split` exists for that middle ground:

- Keep your workflow local and portable.
- Split once-staged work into reviewable, independent branches.
- Push manually when you are ready.

## Who should use this

Use `diff-split` if you:

- Work in npm/pnpm/yarn workspaces or similar monorepo layouts.
- Regularly create broad-but-safe code changes (codemods, refactors, API migrations).
- Want smaller PRs without adopting a full stacked-diff workflow.
- Prefer pragmatic git commands over platform-specific automation.

Probably skip this if you:

- Mostly work in single-package repos.
- Need hosted-provider automation and metadata orchestration.
- Require highly custom PR dependency graphs.

## Design goals

- Safety first: staged changes are the source of truth.
- Replayability: runs leave local artifacts you can inspect and retry from.
- Portability: git-only workflow.
- Extensibility: split strategies are pluggable and can grow over time.

## Safety model

The tool is designed to make losing work very hard:

- Requires staged changes before doing anything.
- Stops if unstaged changes are detected.
- Writes a patch snapshot to `.diff-split/snapshots/<run-id>.patch`.
- Writes run metadata to `.diff-split/runs/<run-id>.json`.
- Uses a session branch (`diff-split/session-<run-id>`) so split commits are recoverable.

Default commit mode is `--no-verify` (because the assumption is your diff is already validated), with `--verify` available if needed.

## Install

```bash
npm install
npm run build
```

Run via:

```bash
node dist/index.js --help
```

## Usage

```bash
diff-split [--strategy by-package|groups-of-n|by-owner] [--group-size N] [--dry-run] [--verify] [--base-branch BRANCH]
```

Examples:

```bash
# Default strategy (one batch per changed package)
diff-split

# Two changed packages per PR branch
diff-split --strategy groups-of-n --group-size 2

# Batch by owning team (deep search for "team" in package.json)
diff-split --strategy by-owner

# Preview only, no commits/branches
diff-split --dry-run

# Run commit hooks during split commits
diff-split --verify
```

## Workflow

1. Generate a broad safe diff (codemod, migration, refactor).
2. Stage the intended changes (`git add ...`).
3. Run `diff-split` with your strategy.
4. It inspects origin/default branch + split plan.
5. It commits each batch in a protected session branch.
6. It creates fresh branches from `origin/<default-branch>` and cherry-picks each batch.
7. It prints `git push -u origin <branch>` commands for you to run manually.

## Strategies

- `by-package` (default): one PR branch per changed package.
- `groups-of-n`: combine changed packages into fixed-size groups.
- `by-owner`: group packages by discovered `team` metadata in `package.json`.

## Replay / retry

Run state is local and inspectable:

- `.diff-split/snapshots/*.patch`
- `.diff-split/runs/*.json`

If a split run needs restructuring, you can use these artifacts to understand exactly what happened and rerun safely.

## Development

```bash
npm run test
npm run lint
npm run typecheck
```
