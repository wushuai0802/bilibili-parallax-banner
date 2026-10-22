import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'tests/browser',
  timeout:45000,
  expect:{timeout:10000},
  fullyParallel:true,
  workers:2,
  retries:process.env.CI?1:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:25996',screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:25996/',reuseExistingServer:!process.env.CI,timeout:10000},
  projects:[
    {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1280,height:900}}},
    {name:'chromium-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}},
    {name:'webkit-mobile',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}},
  ],
});
