export type StrategyName = 'by-package' | 'groups-of-n' | 'by-owner';

export interface CliOptions {
  readonly strategy: StrategyName;
  readonly groupSize: number;
  readonly dryRun: boolean;
  readonly verify: boolean;
  readonly baseBranch?: string;
  readonly replayRunId?: string;
}

export interface RepoInfo {
  readonly originUrl: string;
  readonly defaultBranch: string;
  readonly currentBranch: string;
  readonly currentHeadSha: string;
  readonly behindDefaultCount: number;
}

export interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  readonly packageJsonPath: string;
  readonly owner?: string;
}

export interface DiffBatch {
  readonly id: string;
  readonly title: string;
  readonly packageNames: string[];
  readonly files: string[];
}

export interface StrategyContext {
  readonly packages: WorkspacePackage[];
  readonly filesByPackage: Map<string, string[]>;
  readonly groupSize: number;
}

export interface SplitStrategy {
  readonly name: StrategyName;
  createBatches(context: StrategyContext): DiffBatch[];
}

export interface RunManifest {
  readonly id: string;
  readonly createdAt: string;
  readonly strategy: StrategyName;
  readonly groupSize: number;
  readonly verify: boolean;
  readonly snapshotPath?: string;
  readonly rootDir: string;
  readonly repo: RepoInfo;
  readonly batches: Array<{
    id: string;
    title: string;
    files: string[];
    packageNames: string[];
    commitSha?: string;
    branch?: string;
    status: 'planned' | 'committed' | 'cherry-picked' | 'skipped' | 'failed';
    error?: string;
  }>;
}

export interface SplitResult {
  readonly manifest: RunManifest;
  readonly warnings: string[];
  readonly pushCommands: string[];
}

export interface GitClient {
  run(args: string[], options?: { allowFailure?: boolean; stdio?: 'pipe' | 'inherit' }): string;
  runRaw(args: string[], options?: { allowFailure?: boolean }): {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
}
