import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const appUrl = process.env.CMMS_APP_URL || 'http://127.0.0.1:8091';
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
      browserErrors.push(`console: ${message.text()}`);
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

async function capture(page, filename) {
  const destination = path.join(outputDirectory, filename);
  await page.screenshot({ path: destination, fullPage: false });
  console.log(`Captured ${destination}`);
}

async function assertNoHorizontalOverflow(page, label) {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (widths.scrollWidth > widths.clientWidth + 1) {
    throw new Error(`${label} has horizontal overflow (${widths.scrollWidth}px > ${widths.clientWidth}px).`);
  }
}

const mobile = await openApp({ width: 390, height: 844 });
await capture(mobile.page, 'after-phase4-mobile-dashboard.png');
await assertNoHorizontalOverflow(mobile.page, 'Mobile dashboard');

await mobile.page.getByTestId('tab-spares').click();
await mobile.page.getByTestId('spare-parts-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.page.getByTestId('spare-part-YDK-2026-003').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile.page, 'after-phase4-mobile-spare-parts.png');
await assertNoHorizontalOverflow(mobile.page, 'Mobile spare-parts screen');

await mobile.page.getByTestId('spare-parts-section-alerts').click();
await mobile.page.getByTestId('spare-part-alert-YDK-2026-003').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile.page, 'after-phase4-mobile-stock-alerts.png');
await assertNoHorizontalOverflow(mobile.page, 'Mobile stock-alerts screen');

await mobile.page.getByTestId('tab-workorders').click();
await mobile.page.getByTestId('work-orders-section-orders').click();
await mobile.page.getByTestId('work-order-IE-2026-002').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile.page, 'after-phase4-mobile-work-orders.png');
await assertNoHorizontalOverflow(mobile.page, 'Mobile work-order screen');
await mobile.page.getByTestId('work-order-parts-IE-2026-002').click();
await mobile.page.getByTestId('part-usage-modal').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.page.getByText('Toplam parça maliyeti').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile.page, 'after-phase4-mobile-part-usage.png');
await assertNoHorizontalOverflow(mobile.page, 'Mobile part-usage modal');
await mobile.context.close();

const desktop = await openApp({ width: 1440, height: 900 });
await capture(desktop.page, 'after-phase4-desktop-dashboard.png');
await desktop.page.getByTestId('tab-spares').click();
await desktop.page.getByTestId('spare-parts-screen').waitFor({ state: 'visible', timeout: 30_000 });
await desktop.page.getByTestId('spare-part-YDK-2026-003').waitFor({ state: 'visible', timeout: 30_000 });
await capture(desktop.page, 'after-phase4-desktop-spare-parts.png');
await assertNoHorizontalOverflow(desktop.page, 'Desktop spare-parts screen');
await desktop.page.getByTestId('tab-workorders').click();
await desktop.page.getByTestId('work-orders-section-orders').click();
await desktop.page.getByTestId('work-order-IE-2026-002').waitFor({ state: 'visible', timeout: 30_000 });
await capture(desktop.page, 'after-phase4-desktop-work-orders.png');
await assertNoHorizontalOverflow(desktop.page, 'Desktop work-order screen');
await desktop.context.close();

await browser.close();

if (browserErrors.length) {
  console.error('Browser errors detected:');
  for (const error of browserErrors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('No browser runtime errors detected.');
}
