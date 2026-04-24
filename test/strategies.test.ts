import { describe, expect, it } from 'vitest';
import { createBatches } from '../src/strategies.js';
import type { StrategyContext, WorkspacePackage } from '../src/types.js';

const packages: WorkspacePackage[] = [
  { name: '@repo/a', dir: 'packages/a', packageJsonPath: 'packages/a/package.json', owner: 'alpha' },
  { name: '@repo/b', dir: 'packages/b', packageJsonPath: 'packages/b/package.json', owner: 'beta' },
  { name: '@repo/c', dir: 'packages/c', packageJsonPath: 'packages/c/package.json', owner: 'alpha' }
];

const createContext = (): StrategyContext => {
  const filesByPackage = new Map<string, string[]>([
    ['@repo/a', ['packages/a/src/index.ts']],
    ['@repo/b', ['packages/b/src/index.ts']],
    ['@repo/c', ['packages/c/src/index.ts']],
    ['root', ['README.md']]
  ]);

  return {
    packages,
    filesByPackage,
    groupSize: 2
  };
};

describe('strategies', () => {
  it('splits by package by default', () => {
    const batches = createBatches(createContext(), 'by-package');
    expect(batches).toHaveLength(4);
    expect(batches[0].packageNames).toEqual(['@repo/a']);
    expect(batches[1].packageNames).toEqual(['@repo/b']);
    expect(batches[2].packageNames).toEqual(['@repo/c']);
    expect(batches[3].packageNames).toEqual(['root']);
  });

  it('groups packages by N', () => {
    const batches = createBatches(createContext(), 'groups-of-n');
    expect(batches).toHaveLength(3);
    expect(batches[0].packageNames).toEqual(['@repo/a', '@repo/b']);
    expect(batches[1].packageNames).toEqual(['@repo/c']);
    expect(batches[2].packageNames).toEqual(['root']);
  });

  it('groups by owner', () => {
    const batches = createBatches(createContext(), 'by-owner');
    expect(batches).toHaveLength(3);
    expect(batches[0].packageNames).toEqual(['@repo/a', '@repo/c']);
    expect(batches[1].packageNames).toEqual(['@repo/b']);
    expect(batches[2].packageNames).toEqual(['root']);
  });
});
