import { defineConfig,devices } from '@playwright/test';

// Separate real app/database instances prevent suite data and shared-IP rate buckets
// leaking between journeys. Production rate limits remain unchanged.
const suites=[['public-portal','portal',3100],['stakeholder-workflows','workflows',3101],['workspace-shell','workspace',3102],['stakeholder-access','access',3103]];
export default defineConfig({
  testDir:'test/browser',fullyParallel:false,workers:1,retries:process.env.CI?1:0,
  use:{...devices['Desktop Chrome'],...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:suites.map(([name,file,port])=>({name,testMatch:`**/${file}.spec.js`,use:{baseURL:`http://localhost:${port}`}})),
  webServer:suites.map(([_name,_file,port])=>({command:'node test/browser-server.js',env:{BROWSER_TEST_PORT:String(port)},url:`http://localhost:${port}/health/ready`,timeout:90000,reuseExistingServer:false})),
});
