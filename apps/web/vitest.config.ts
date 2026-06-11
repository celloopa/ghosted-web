import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true, // lets @testing-library/react register its afterEach cleanup
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
