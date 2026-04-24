import path from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectRepo, runSplit } from '../src/splitter.js';
import type { CliOptions, GitClient } from '../src/types.js';

class MockGit implements GitClient {
  private readonly data = new Map<string, { stdout: string; stderr: string; exitCode: number }>();
  readonly commands: string[][] = [];

  set(args: string[], stdout: string, exitCode = 0, stderr = ''): void {
    this.data.set(args.join('\u001f'), { stdout, stderr, exitCode });
  }

  run(args: string[], options: { allowFailure?: boolean } = {}): string {
    const result = this.runRaw(args, options);
    if (result.exitCode !== 0 && !options.allowFailure) {
      throw new Error(`mock git failed: ${args.join(' ')}`);
    }
    return result.stdout;
  }

  runRaw(args: string[], options: { allowFailure?: boolean } = {}) {
    this.commands.push(args);
    const key = args.join('\u001f');
    const found = this.data.get(key);
    if (!found) {
      if (options.allowFailure) {
        return { stdout: '', stderr: '', exitCode: 1 };
      }
      throw new Error(`No mock output for git ${args.join(' ')}`);
    }
    if (found.exitCode !== 0 && !options.allowFailure) {
      throw new Error(`mock git failed: ${args.join(' ')}`);
    }
    return found;
  }
}

const dirs: string[] = [];

const makeTempWorkspace = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'diff-split-test-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0, dirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const createRootWorkspace = (): string => {
  const root = makeTempWorkspace();
  mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
  mkdirSync(path.join(root, 'packages', 'b'), { recursive: true });

  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }, null, 2));
  writeFileSync(path.join(root, 'packages', 'a', 'package.json'), JSON.stringify({ name: '@repo/a' }, null, 2));
  writeFileSync(
    path.join(root, 'packages', 'b', 'package.json'),
    JSON.stringify({ name: '@repo/b', metadata: { team: 'team-platform' } }, null, 2)
  );

  return root;
};

const setupCommonGit = (git: MockGit): void => {
  git.set(['status', '--porcelain=v1'], 'A  packages/a/src/index.ts\nA  packages/b/src/index.ts\n');
  git.set(['remote', 'get-url', 'origin'], 'git@github.com:example/repo.git\n');
  git.set(['rev-parse', '--abbrev-ref', 'HEAD'], 'feature/codemod\n');
  git.set(['rev-parse', 'HEAD'], 'abc123\n');
  git.set(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], 'origin/main\n');
  git.set(['fetch', 'origin', 'main'], '');
  git.set(['rev-list', '--count', 'abc123..origin/main'], '4\n');
  git.set(['diff', '--cached', '--name-only', '-z'], 'packages/a/src/index.ts\0packages/b/src/index.ts\0');
};

describe('inspectRepo', () => {
  it('reads origin, branch, and behind count', () => {
    const git = new MockGit();
    setupCommonGit(git);

    const info = inspectRepo(git);
    expect(info.defaultBranch).toBe('main');
    expect(info.originUrl).toContain('github.com');
    expect(info.behindDefaultCount).toBe(4);
  });
});

describe('runSplit', () => {
  it('returns plan with push commands for dry run', () => {
    const git = new MockGit();
    const root = createRootWorkspace();
    setupCommonGit(git);

    const options: CliOptions = {
      strategy: 'by-package',
      groupSize: 2,
      dryRun: true,
      verify: false
    };

    const result = runSplit(git, root, options);

    expect(result.manifest.batches).toHaveLength(2);
    expect(result.pushCommands).toHaveLength(2);
    expect(result.pushCommands[0]).toContain('git push -u origin split/');
  });

  it('supports owner strategy in dry run', () => {
    const git = new MockGit();
    const root = createRootWorkspace();
    setupCommonGit(git);

    const result = runSplit(git, root, {
      strategy: 'by-owner',
      groupSize: 2,
      dryRun: true,
      verify: false
    });

    expect(result.manifest.batches).toHaveLength(2);
    expect(result.manifest.batches[0].title).toContain('owner');
  });

  it('fails fast if no staged files exist', () => {
    const git = new MockGit();
    const root = createRootWorkspace();
    setupCommonGit(git);
    git.set(['status', '--porcelain=v1'], '');
    git.set(['diff', '--cached', '--name-only', '-z'], '');

    expect(() =>
      runSplit(git, root, {
        strategy: 'by-package',
        groupSize: 2,
        dryRun: true,
        verify: false
      })
    ).toThrow('No staged files detected');
  });

  it('fails on unsafe unstaged changes', () => {
    const git = new MockGit();
    const root = createRootWorkspace();
    setupCommonGit(git);
    git.set(['status', '--porcelain=v1'], ' M packages/a/src/index.ts\n');

    expect(() =>
      runSplit(git, root, {
        strategy: 'by-package',
        groupSize: 2,
        dryRun: true,
        verify: false
      })
    ).toThrow('Safety stop');
  });
});
