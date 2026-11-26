import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const appUrl = process.env.CMMS_APP_URL || 'http://127.0.0.1:8081';
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

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobile = await preparePage(mobileContext);
await mobile.goto(appUrl, { waitUntil: 'domcontentloaded' });
await mobile.getByText('Hızlı Demo Giriş').waitFor({ state: 'visible', timeout: 90_000 });
await capture(mobile, 'after-mobile-login.png');

await mobile.getByTestId('demo-login-admin').click();
await mobile.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-dashboard.png');
await assertNoHorizontalOverflow(mobile, 'Mobile dashboard');

await mobile.getByTestId('tab-workorders').click();
await mobile.getByTestId('work-orders-screen').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-work-orders.png');
await assertNoHorizontalOverflow(mobile, 'Mobile work-order screen');

await mobile.getByTestId('tab-inventory').click();
await mobile.getByTestId('inventory-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('MCH-2026-001').waitFor({ state: 'visible', timeout: 30_000 });
if (!(await mobile.getByText('+ Makine ekle').isVisible())) {
  throw new Error('Admin inventory did not expose the machine creation action.');
}
await capture(mobile, 'after-mobile-inventory.png');

await mobile.getByLabel('MCH-2026-001 makinesini düzenle').click();
await mobile.getByText('Makineyi düzenle', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('Kapat', { exact: true }).click();

await mobile.getByText('MCH-2026-001').click();
await mobile.getByTestId('machine-detail-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('Makine QR kimliği').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-machine-detail.png');

await mobile.getByTestId('open-fault-report').click();
await mobile.getByTestId('fault-report-modal').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-fault-report.png');
await assertNoHorizontalOverflow(mobile, 'Mobile fault-report form');
await mobile.getByTestId('fault-report-modal').getByText('Kapat', { exact: true }).click();

await mobile.getByLabel('Makine kartını kapat').click();
await mobile.getByText('QR Okut', { exact: true }).click();
await mobile.getByTestId('scanner-screen').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-scanner.png');
await mobile.getByTestId('manual-machine-code').fill('MCH-2026-002');
await mobile.getByText('Bul', { exact: true }).click();
await mobile.getByTestId('machine-detail-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('MCH-2026-002').first().waitFor({ state: 'visible', timeout: 30_000 });
await mobileContext.close();

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const desktop = await preparePage(desktopContext);
await desktop.goto(appUrl, { waitUntil: 'domcontentloaded' });
await desktop.getByText('Hızlı Demo Giriş').waitFor({ state: 'visible', timeout: 90_000 });
await desktop.getByTestId('demo-login-technician').click();
await desktop.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
await capture(desktop, 'after-desktop-dashboard.png');
await desktop.getByTestId('tab-inventory').click();
await desktop.getByTestId('inventory-screen').waitFor({ state: 'visible', timeout: 30_000 });
if (await desktop.getByText('+ Makine ekle').count()) {
  throw new Error('Technician inventory unexpectedly exposed the admin machine creation action.');
}
await desktopContext.close();

const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const admin = await preparePage(adminContext);
await admin.goto(appUrl, { waitUntil: 'domcontentloaded' });
await admin.getByText('Hızlı Demo Giriş').waitFor({ state: 'visible', timeout: 90_000 });
await admin.getByTestId('demo-login-admin').click();
await admin.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
await admin.getByTestId('tab-workorders').click();
await admin.getByTestId('work-orders-screen').waitFor({ state: 'visible', timeout: 30_000 });
await capture(admin, 'after-desktop-work-orders.png');
await assertNoHorizontalOverflow(admin, 'Desktop work-order screen');
await adminContext.close();

await browser.close();

if (browserErrors.length) {
  console.error('Browser errors detected:');
  for (const error of browserErrors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('No browser runtime errors detected.');
}
