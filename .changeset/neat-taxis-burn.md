---
"diff-split": minor
---

Add initial `diff-split` CLI for splitting staged monorepo diffs into independent PR branches.

- Implements portable git-only split workflow (no hosted API dependency)
- Adds extensible split strategies: `by-package`, `groups-of-n`, and `by-owner`
- Adds safety/replay state via `.diff-split` snapshots and run manifests
- Includes dry-run mode, optional hook verification flag, vitest tests, and oxlint setup
