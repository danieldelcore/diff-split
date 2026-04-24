import { spawnSync } from 'node:child_process';
import type { GitClient } from './types.js';

export class ShellGitClient implements GitClient {
  run(
    args: string[],
    options: { allowFailure?: boolean; stdio?: 'pipe' | 'inherit' } = {}
  ): string {
    const result = this.runRaw(args, { allowFailure: options.allowFailure });
    if (options.stdio === 'inherit') {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    return result.stdout;
  }

  runRaw(args: string[], options: { allowFailure?: boolean } = {}) {
    const proc = spawnSync('git', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const stdout = proc.stdout ?? '';
    const stderr = proc.stderr ?? '';
    const exitCode = proc.status ?? 1;

    if (exitCode !== 0 && !options.allowFailure) {
      throw new Error(`git ${args.join(' ')} failed (${exitCode}): ${stderr || stdout}`.trim());
    }

    return { stdout, stderr, exitCode };
  }
}

export const parseNullSeparated = (text: string): string[] =>
  text
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
