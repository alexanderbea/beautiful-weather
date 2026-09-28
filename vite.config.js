import { defineConfig } from 'vite';

// Relative asset paths so dist/ works when served from any sub-path (e.g. /dist/).
export default defineConfig({
  base: './',
});
