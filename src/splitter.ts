import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parseNullSeparated } from './git.js';
import { createBatches } from './strategies.js';
import { createRunId, ensureStateDirs, getSnapshotPath, readManifest, writeManifest, writeSnapshot } from './state.js';
import { discoverWorkspacePackages, mapFilesToPackages } from './workspaces.js';
import type { CliOptions, GitClient, RepoInfo, RunManifest, SplitResult } from './types.js';

const sanitizeName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const resolveDefaultBranch = (git: GitClient): string => {
  const headRef = git.run(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFailure: true }).trim();
  if (headRef.startsWith('origin/')) {
    return headRef.slice('origin/'.length);
  }

  for (const candidate of ['main', 'master']) {
    const exists = git.runRaw(['show-ref', '--verify', `refs/remotes/origin/${candidate}`], { allowFailure: true });
    if (exists.exitCode === 0) {
      return candidate;
    }
  }

  return 'main';
};

export const inspectRepo = (git: GitClient, selectedBaseBranch?: string): RepoInfo => {
  const originUrl = git.run(['remote', 'get-url', 'origin']).trim();
  const currentBranch = git.run(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const currentHeadSha = git.run(['rev-parse', 'HEAD']).trim();
  const defaultBranch = selectedBaseBranch ?? resolveDefaultBranch(git);

  git.run(['fetch', 'origin', defaultBranch]);
  const behindText = git.run(['rev-list', '--count', `${currentHeadSha}..origin/${defaultBranch}`]);

  return {
    originUrl,
    defaultBranch,
    currentBranch,
    currentHeadSha,
    behindDefaultCount: Number.parseInt(behindText.trim(), 10) || 0
  };
};

const getStagedFiles = (git: GitClient): string[] =>
  parseNullSeparated(git.run(['diff', '--cached', '--name-only', '-z'])).sort((a, b) => a.localeCompare(b));

const getStagedPatch = (git: GitClient): string => git.run(['diff', '--cached', '--binary']);

const checkSafety = (git: GitClient): void => {
  const status = git.run(['status', '--porcelain=v1']);
  const lines = status
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const hasUnstaged = lines.some((line) => line[1] && line[1] !== ' ');
  if (hasUnstaged) {
    throw new Error('Safety stop: unstaged changes detected. Stash or commit them before running diff-split.');
  }
};

const buildPushCommands = (branches: string[]): string[] => branches.map((branch) => `git push -u origin ${branch}`);

const createBaseManifest = (
  rootDir: string,
  options: CliOptions,
  repo: RepoInfo,
  runId: string,
  snapshotPath: string | undefined,
  batches: ReturnType<typeof createBatches>
): RunManifest => ({
  id: runId,
  createdAt: new Date().toISOString(),
  strategy: options.strategy,
  groupSize: options.groupSize,
  verify: options.verify,
  snapshotPath,
  rootDir,
  repo,
  batches: batches.map((batch) => ({
    id: batch.id,
    title: batch.title,
    files: batch.files,
    packageNames: batch.packageNames,
    status: 'planned'
  }))
});

const applyBatchAndCommit = (
  git: GitClient,
  patchPath: string,
  files: string[],
  title: string,
  verify: boolean
): { commitSha?: string; status: 'committed' | 'skipped' | 'failed'; error?: string } => {
  git.run(['reset', '--hard', 'HEAD']);

  const includeArgs = files.flatMap((file) => ['--include', file]);
  const apply = git.runRaw(['apply', '--index', ...includeArgs, patchPath], { allowFailure: true });

  if (apply.exitCode !== 0) {
    return {
      status: 'failed',
      error: apply.stderr || apply.stdout || `Failed to apply patch for ${title}`
    };
  }

  const hasChanges = git.runRaw(['diff', '--cached', '--quiet'], { allowFailure: true }).exitCode !== 0;
  if (!hasChanges) {
    return { status: 'skipped', error: 'No staged changes after apply.' };
  }

  const commitArgs = ['commit', '-m', title];
  if (!verify) {
    commitArgs.push('--no-verify');
  }

  const commit = git.runRaw(commitArgs, { allowFailure: true });
  if (commit.exitCode !== 0) {
    return {
      status: 'failed',
      error: commit.stderr || commit.stdout || `Commit failed for ${title}`
    };
  }

  return {
    status: 'committed',
    commitSha: git.run(['rev-parse', 'HEAD']).trim()
  };
};

const cherryPickToBranch = (
  git: GitClient,
  baseBranch: string,
  branchName: string,
  commitSha: string
): { status: 'cherry-picked' | 'failed'; error?: string } => {
  git.run(['switch', '-C', branchName, `origin/${baseBranch}`]);
  const pick = git.runRaw(['cherry-pick', commitSha], { allowFailure: true });
  if (pick.exitCode !== 0) {
    git.run(['cherry-pick', '--abort'], { allowFailure: true });
    return {
      status: 'failed',
      error: pick.stderr || pick.stdout || `Cherry-pick failed for ${branchName}`
    };
  }

  return { status: 'cherry-picked' };
};

const dryRunOutput = (manifest: RunManifest): SplitResult => {
  const pushCommands = manifest.batches.map((batch) => {
    const branch = `split/${sanitizeName(batch.id)}-${manifest.id}`;
    return `git push -u origin ${branch}`;
  });

  return {
    manifest,
    warnings: manifest.repo.behindDefaultCount > 1000 ? ['Default branch is more than 1000 commits ahead.'] : [],
    pushCommands
  };
};

export const runSplit = (git: GitClient, rootDir: string, options: CliOptions): SplitResult => {
  checkSafety(git);

  const repo = inspectRepo(git, options.baseBranch);
  if (repo.behindDefaultCount > 1000) {
    process.stderr.write(
      `Warning: your current HEAD is ${repo.behindDefaultCount} commits behind origin/${repo.defaultBranch}.\n`
    );
  }

  if (options.replayRunId) {
    const replayManifest = readManifest(rootDir, options.replayRunId);
    const pushCommands = buildPushCommands(
      replayManifest.batches.map((batch) => batch.branch).filter((branch): branch is string => Boolean(branch))
    );
    return {
      manifest: replayManifest,
      warnings: ['Replay mode: loaded previous run manifest.'],
      pushCommands
    };
  }

  const stagedFiles = getStagedFiles(git);
  if (stagedFiles.length === 0) {
    throw new Error('No staged files detected. Stage your diff first with git add before running diff-split.');
  }

  const packages = discoverWorkspacePackages(rootDir);
  const filesByPackage = mapFilesToPackages(stagedFiles, packages);
  const batches = createBatches(
    {
      packages,
      filesByPackage,
      groupSize: options.groupSize
    },
    options.strategy
  );

  if (batches.length === 0) {
    throw new Error('No batches were generated from staged files.');
  }

  const runId = createRunId();
  const snapshotPath = getSnapshotPath(rootDir, runId);
  const manifest = createBaseManifest(rootDir, options, repo, runId, snapshotPath, batches);

  if (options.dryRun) {
    return dryRunOutput(manifest);
  }

  ensureStateDirs(rootDir);
  const patch = getStagedPatch(git);
  writeSnapshot(snapshotPath, patch);

  const sessionBranch = `diff-split/session-${runId}`;
  git.run(['switch', '-c', sessionBranch]);

  const noVerifyWarnings: string[] = [];

  for (const batch of manifest.batches) {
    const result = applyBatchAndCommit(git, snapshotPath, batch.files, batch.title, options.verify);
    if (result.status === 'committed') {
      batch.status = 'committed';
      batch.commitSha = result.commitSha;
    } else {
      batch.status = result.status;
      batch.error = result.error;
      if (result.status === 'failed') {
        noVerifyWarnings.push(`Commit step failed for ${batch.title}: ${result.error}`);
      }
    }
  }

  for (const batch of manifest.batches) {
    if (!batch.commitSha) {
      continue;
    }

    const branchName = `split/${sanitizeName(batch.id)}-${runId}`;
    const result = cherryPickToBranch(git, repo.defaultBranch, branchName, batch.commitSha);

    if (result.status === 'cherry-picked') {
      batch.status = 'cherry-picked';
      batch.branch = branchName;
    } else {
      batch.status = 'failed';
      batch.error = result.error;
      noVerifyWarnings.push(`Cherry-pick failed for ${branchName}: ${result.error}`);
    }
  }

  git.run(['switch', repo.currentBranch]);

  writeManifest(manifest);

  const successfulBranches = manifest.batches
    .map((batch) => batch.branch)
    .filter((branch): branch is string => Boolean(branch));

  return {
    manifest,
    warnings: noVerifyWarnings,
    pushCommands: buildPushCommands(successfulBranches)
  };
};

export const loadSnapshotForRun = (manifest: RunManifest): string | undefined => {
  if (!manifest.snapshotPath) {
    return undefined;
  }
  return readFileSync(path.resolve(manifest.snapshotPath), 'utf8');
};
