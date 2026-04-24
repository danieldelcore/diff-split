import type { DiffBatch, SplitStrategy, StrategyContext, StrategyName } from './types.js';

const byPackageStrategy: SplitStrategy = {
  name: 'by-package',
  createBatches(context) {
    const batches: DiffBatch[] = [];
    for (const pkg of context.packages) {
      const files = context.filesByPackage.get(pkg.name) ?? [];
      if (files.length === 0) {
        continue;
      }
      batches.push({
        id: pkg.name,
        title: `Split ${pkg.name}`,
        packageNames: [pkg.name],
        files
      });
    }

    const rootFiles = context.filesByPackage.get('root') ?? [];
    if (rootFiles.length > 0) {
      batches.push({
        id: 'root',
        title: 'Split root changes',
        packageNames: ['root'],
        files: rootFiles
      });
    }

    return batches;
  }
};

const groupsOfNStrategy: SplitStrategy = {
  name: 'groups-of-n',
  createBatches(context) {
    const populated = context.packages.filter((pkg) => (context.filesByPackage.get(pkg.name)?.length ?? 0) > 0);
    const batches: DiffBatch[] = [];

    if (context.groupSize < 1) {
      throw new Error('groupSize must be at least 1 for groups-of-n strategy.');
    }

    for (let i = 0; i < populated.length; i += context.groupSize) {
      const group = populated.slice(i, i + context.groupSize);
      const packageNames = group.map((pkg) => pkg.name);
      const files = group.flatMap((pkg) => context.filesByPackage.get(pkg.name) ?? []);

      batches.push({
        id: `group-${Math.floor(i / context.groupSize) + 1}`,
        title: `Split group ${Math.floor(i / context.groupSize) + 1}`,
        packageNames,
        files
      });
    }

    const rootFiles = context.filesByPackage.get('root') ?? [];
    if (rootFiles.length > 0) {
      batches.push({
        id: 'root',
        title: 'Split root changes',
        packageNames: ['root'],
        files: rootFiles
      });
    }

    return batches;
  }
};

const byOwnerStrategy: SplitStrategy = {
  name: 'by-owner',
  createBatches(context) {
    const ownerMap = new Map<string, Set<string>>();

    for (const pkg of context.packages) {
      const files = context.filesByPackage.get(pkg.name) ?? [];
      if (files.length === 0) {
        continue;
      }
      const key = pkg.owner ?? 'unowned';
      const set = ownerMap.get(key) ?? new Set<string>();
      set.add(pkg.name);
      ownerMap.set(key, set);
    }

    const batches: DiffBatch[] = [...ownerMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([owner, packageSet]) => {
        const packageNames = [...packageSet].sort((a, b) => a.localeCompare(b));
        const files = packageNames.flatMap((name) => context.filesByPackage.get(name) ?? []);

        return {
          id: `owner-${owner}`,
          title: `Split owner ${owner}`,
          packageNames,
          files
        };
      });

    const rootFiles = context.filesByPackage.get('root') ?? [];
    if (rootFiles.length > 0) {
      batches.push({
        id: 'root',
        title: 'Split root changes',
        packageNames: ['root'],
        files: rootFiles
      });
    }

    return batches;
  }
};

export const strategies: Record<StrategyName, SplitStrategy> = {
  'by-package': byPackageStrategy,
  'groups-of-n': groupsOfNStrategy,
  'by-owner': byOwnerStrategy
};

export const createBatches = (context: StrategyContext, strategyName: StrategyName): DiffBatch[] =>
  strategies[strategyName].createBatches(context);
