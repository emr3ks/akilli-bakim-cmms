import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const appUrl = process.env.CMMS_APP_URL || 'http://127.0.0.1:8085';
const label = process.env.CMMS_CAPTURE_LABEL || 'before';
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

async function preparePage(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Download the React DevTools')) {
      const location = message.location();
      browserErrors.push(`console: ${message.text()} ${location.url || ''}`.trim());
    }
  });
  return page;
}

async function openApp(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await preparePage(context);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Hızlı Demo Giriş').waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByTestId('demo-login-admin').click();
  await page.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
  return { context, page };
}

async function capture(page, name) {
  const destination = path.join(outputDirectory, `${label}-phase6-${name}.png`);
  await page.screenshot({ path: destination, fullPage: false });
  console.log(`Captured ${destination}`);
}

async function assertNoHorizontalOverflow(page, scenario) {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (widths.scrollWidth > widths.clientWidth + 1) {
    throw new Error(`${scenario} has horizontal overflow (${widths.scrollWidth}px > ${widths.clientWidth}px).`);
  }
}

async function captureSharedScenarios(page, viewportName) {
  await capture(page, `${viewportName}-dashboard`);
  await assertNoHorizontalOverflow(page, `${viewportName} dashboard`);

  await page.getByTestId('tab-inventory').click();
  await page.getByTestId('inventory-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText('MCH-2026-001', { exact: true }).click();
  await page.getByTestId('machine-detail-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText('Makine QR kimliği').waitFor({ state: 'visible', timeout: 30_000 });
  await capture(page, `${viewportName}-machine-detail`);
  await assertNoHorizontalOverflow(page, `${viewportName} machine detail`);

  if (label === 'after') {
    const sensorPanel = page.getByTestId('machine-sensor-panel');
    await sensorPanel.waitFor({ state: 'visible', timeout: 30_000 });
    await sensorPanel.scrollIntoViewIfNeeded();
    await capture(page, `${viewportName}-machine-sensors`);
    await assertNoHorizontalOverflow(page, `${viewportName} machine sensors`);

    await page.getByLabel('Makine kartını kapat').click();
    await page.getByTestId('inventory-screen').waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByTestId('tab-handover').click();
    await page.getByTestId('shift-handover-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await capture(page, `${viewportName}-shift-handover`);
    await assertNoHorizontalOverflow(page, `${viewportName} shift handover`);

    await page.getByTestId('notification-bell').click();
    await page.getByTestId('notification-center-screen').waitFor({ state: 'visible', timeout: 30_000 });
    await capture(page, `${viewportName}-notifications`);
    await assertNoHorizontalOverflow(page, `${viewportName} notifications`);
  } else {
    await page.getByLabel('Makine kartını kapat').click();
  }
}

const mobile = await openApp({ width: 390, height: 844 });
await captureSharedScenarios(mobile.page, 'mobile');
await mobile.context.close();

const desktop = await openApp({ width: 1440, height: 900 });
await captureSharedScenarios(desktop.page, 'desktop');
await desktop.context.close();

await browser.close();

if (browserErrors.length) {
  console.error('Browser errors detected:');
  for (const error of browserErrors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('No browser runtime errors detected.');
}
