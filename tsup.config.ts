import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: {
      tsconfig: 'tsconfig.build.json',
    },
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'node18',
    shims: true,
    onSuccess: "echo 'Library build complete'",
  },
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    target: 'node18',
    shims: true,
    banner: {
      js: '#!/usr/bin/env node\n',
    },
  },
]);
