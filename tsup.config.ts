import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.png': 'dataurl',
    };
  },
});
