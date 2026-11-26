import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const appUrl = process.env.CMMS_APP_URL || 'http://127.0.0.1:8082';
const outputDirectory = path.resolve('docs/screenshots');
const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const executablePath = edgeCandidates.find((candidate) => fs.existsSync(candidate));

if (!executablePath) {
  throw new Error('No installed Edge or Chrome executable was found for screenshot capture.');
}

fs.mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const browserErrors = [];

async function openApp(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Download the React DevTools')) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Hızlı Demo Giriş').waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByTestId('demo-login-admin').click();
  await page.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
  return { context, page };
}

async function capture(page, filename) {
  const destination = path.join(outputDirectory, filename);
  await page.screenshot({ path: destination, fullPage: false });
  console.log(`Captured ${destination}`);
}

const mobile = await openApp({ width: 390, height: 844 });
await capture(mobile.page, 'before-phase4-mobile-dashboard.png');
await mobile.page.getByTestId('tab-workorders').click();
await mobile.page.getByTestId('work-orders-section-orders').click();
await mobile.page.getByTestId('work-order-IE-2026-002').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile.page, 'before-phase4-mobile-work-orders.png');
await mobile.context.close();

const desktop = await openApp({ width: 1440, height: 900 });
await capture(desktop.page, 'before-phase4-desktop-dashboard.png');
await desktop.page.getByTestId('tab-workorders').click();
await desktop.page.getByTestId('work-orders-section-orders').click();
await desktop.page.getByTestId('work-order-IE-2026-002').waitFor({ state: 'visible', timeout: 30_000 });
await capture(desktop.page, 'before-phase4-desktop-work-orders.png');
await desktop.context.close();

await browser.close();

if (browserErrors.length) {
  console.error('Browser errors detected:');
  for (const error of browserErrors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('No browser runtime errors detected.');
}
