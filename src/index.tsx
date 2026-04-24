#!/usr/bin/env node
import path from 'node:path';
import { render } from 'ink';
import React from 'react';
import { ShellGitClient } from './git.js';
import { runSplit } from './splitter.js';
import type { CliOptions, StrategyName } from './types.js';
import { ResultView } from './ui.js';

const parseArgs = (argv: string[]): CliOptions => {
  const args = new Set(argv);

  const getValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) {
      return undefined;
    }
    return argv[index + 1];
  };

  const strategy = (getValue('--strategy') ?? 'by-package') as StrategyName;
  if (!['by-package', 'groups-of-n', 'by-owner'].includes(strategy)) {
    throw new Error(`Unknown strategy: ${strategy}`);
  }

  const groupSizeText = getValue('--group-size') ?? '2';
  const groupSize = Number.parseInt(groupSizeText, 10);
  if (!Number.isFinite(groupSize) || groupSize < 1) {
    throw new Error(`Invalid --group-size value: ${groupSizeText}`);
  }

  const dryRun = args.has('--dry-run');
  const verify = args.has('--verify');
  const baseBranch = getValue('--base-branch');
  const replayRunId = getValue('--replay');

  return {
    strategy,
    groupSize,
    dryRun,
    verify,
    baseBranch,
    replayRunId
  };
};

const printHelp = (): void => {
  process.stdout.write(`
Usage:
  diff-split [--strategy by-package|groups-of-n|by-owner] [--group-size N] [--dry-run] [--verify] [--base-branch BRANCH] [--replay RUN_ID]

Examples:
  diff-split --strategy by-package
  diff-split --strategy groups-of-n --group-size 2
  diff-split --strategy by-owner --dry-run

Flags:
  --dry-run      Plan changes without writing commits or branches
  --verify       Run commits with git hook verification (default is --no-verify)
  --replay       Load a previous run manifest by ID
`);
};

const main = (): void => {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  try {
    const options = parseArgs(argv);
    const git = new ShellGitClient();
    const rootDir = path.resolve(process.cwd());

    const result = runSplit(git, rootDir, options);
    render(<ResultView result={result} dryRun={options.dryRun} />);
  } catch (error) {
    process.stderr.write(`diff-split failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
};

main();
