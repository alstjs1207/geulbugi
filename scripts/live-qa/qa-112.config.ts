import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
 include: ['scripts/live-qa/qa-112.test.tsx'],
 environment: 'jsdom', restoreMocks: true,
} });
