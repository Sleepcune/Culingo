import { defineConfig } from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/playwright');
export default defineConfig({testDir:'tests/e2e',timeout:60000,workers:1,fullyParallel:false,reporter:'list',use:{trace:'retain-on-failure',screenshot:'only-on-failure'}});
