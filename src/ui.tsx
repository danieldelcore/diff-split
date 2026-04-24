import React from 'react';
import { Box, Text } from 'ink';
import type { SplitResult } from './types.js';

export const ResultView = ({ result, dryRun }: { result: SplitResult; dryRun: boolean }) => {
  const successCount = result.manifest.batches.filter((batch) => batch.status === 'cherry-picked').length;
  const failed = result.manifest.batches.filter((batch) => batch.status === 'failed');

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="green">diff-split {dryRun ? 'dry run' : 'completed'}: {result.manifest.id}</Text>
      <Text>Origin: {result.manifest.repo.originUrl}</Text>
      <Text>Base branch: {result.manifest.repo.defaultBranch}</Text>
      <Text>Strategy: {result.manifest.strategy}</Text>
      <Text>Batches: {result.manifest.batches.length}</Text>
      <Text>Successful branches: {successCount}</Text>

      {result.warnings.length > 0 ? (
        <Box flexDirection="column">
          <Text color="yellow">Warnings:</Text>
          {result.warnings.map((warning) => (
            <Text key={warning}>- {warning}</Text>
          ))}
        </Box>
      ) : null}

      {failed.length > 0 ? (
        <Box flexDirection="column">
          <Text color="red">Failed batches:</Text>
          {failed.map((batch) => (
            <Text key={batch.id}>- {batch.title}: {batch.error ?? 'unknown error'}</Text>
          ))}
        </Box>
      ) : null}

      <Box flexDirection="column">
        <Text color="cyan">Push commands (run manually):</Text>
        {result.pushCommands.length === 0 ? (
          <Text>- No branches to push</Text>
        ) : (
          result.pushCommands.map((command) => <Text key={command}>- {command}</Text>)
        )}
      </Box>
    </Box>
  );
};
