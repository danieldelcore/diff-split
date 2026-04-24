import path from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverWorkspacePackages, mapFilesToPackages } from '../src/workspaces.js';

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

describe('discoverWorkspacePackages', () => {
  it('discovers packages and owners via deep team search', () => {
    const root = makeTempWorkspace();
    mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
    mkdirSync(path.join(root, 'packages', 'b'), { recursive: true });

    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2)
    );

    writeFileSync(
      path.join(root, 'packages', 'a', 'package.json'),
      JSON.stringify({ name: '@repo/a', metadata: { owners: { team: 'alpha' } } }, null, 2)
    );
    writeFileSync(path.join(root, 'packages', 'b', 'package.json'), JSON.stringify({ name: '@repo/b' }, null, 2));

    const found = discoverWorkspacePackages(root);
    expect(found.map((pkg) => pkg.name)).toEqual(['@repo/a', '@repo/b']);
    expect(found.find((pkg) => pkg.name === '@repo/a')?.owner).toBe('alpha');
    expect(found.find((pkg) => pkg.name === '@repo/b')?.owner).toBeUndefined();
  });
});

describe('mapFilesToPackages', () => {
  it('maps staged files into package buckets', () => {
    const packages = [
      { name: '@repo/a', dir: 'packages/a', packageJsonPath: 'packages/a/package.json' },
      { name: '@repo/b', dir: 'packages/b', packageJsonPath: 'packages/b/package.json' }
    ];

    const map = mapFilesToPackages(
      ['packages/a/src/index.ts', 'packages/b/src/index.ts', 'README.md'],
      packages
    );

    expect(map.get('@repo/a')).toEqual(['packages/a/src/index.ts']);
    expect(map.get('@repo/b')).toEqual(['packages/b/src/index.ts']);
    expect(map.get('root')).toEqual(['README.md']);
  });
});
