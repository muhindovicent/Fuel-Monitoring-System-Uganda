import { defineConfig,devices } from '@playwright/test';

export default defineConfig({
  testDir:'test/browser',fullyParallel:false,workers:1,retries:process.env.CI?1:0,
  use:{baseURL:'http://localhost:3100',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})}}],
  webServer:{command:'node test/browser-server.js',url:'http://localhost:3100/health/ready',timeout:60000,reuseExistingServer:false},
});
