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
  const destination = path.join(outputDirectory, `${label}-phase5-${name}.png`);
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

async function verifyServiceReportPrint(page, testId, required = false) {
  const reportButton = page.getByTestId(testId);
  if (!(await reportButton.count())) {
    if (required) {
      await reportButton.waitFor({ state: 'visible', timeout: 30_000 });
    } else {
      return;
    }
  }
  await reportButton.scrollIntoViewIfNeeded();
  await reportButton.click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).some((frame) => (
    frame.getAttribute('srcdoc')?.includes('MEKNIVO') === true
  )), null, { timeout: 30_000 });
}

async function captureSharedScenarios(page, viewportName) {
  await capture(page, `${viewportName}-dashboard`);
  await assertNoHorizontalOverflow(page, `${viewportName} dashboard`);

  await page.getByTestId('tab-workorders').click();
  await page.getByTestId('work-orders-section-orders').click();
  await page.getByTestId('work-order-IE-2026-005').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('work-order-IE-2026-005').scrollIntoViewIfNeeded();
  await capture(page, `${viewportName}-work-orders`);
  await assertNoHorizontalOverflow(page, `${viewportName} work-order screen`);

  await verifyServiceReportPrint(page, 'work-order-service-report-IE-2026-005');

  await page.getByTestId('tab-inventory').click();
  await page.getByTestId('inventory-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText('MCH-2026-001', { exact: true }).click();
  await page.getByTestId('machine-detail-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText('Makine QR kimliği').waitFor({ state: 'visible', timeout: 30_000 });
  await capture(page, `${viewportName}-machine-detail`);
  await assertNoHorizontalOverflow(page, `${viewportName} machine detail`);

  const historyTab = page.getByText('Makine Bakım Geçmişi', { exact: true });
  if (await historyTab.count()) {
    await historyTab.click();
    await page.getByText('Kronolojik bakım kayıtları', { exact: false }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await capture(page, `${viewportName}-machine-history`);
    await assertNoHorizontalOverflow(page, `${viewportName} machine history`);
  }
  await page.getByLabel('Makine kartını kapat').click();
  await page.getByTestId('inventory-screen').waitFor({ state: 'visible', timeout: 30_000 });
}

const mobile = await openApp({ width: 390, height: 844 });
await captureSharedScenarios(mobile.page, 'mobile');

const analyticsTab = mobile.page.getByTestId('tab-analytics');
if (await analyticsTab.count()) {
  await analyticsTab.click();
  await mobile.page.getByTestId('maintenance-analytics-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await capture(mobile.page, 'mobile-analytics');
  await assertNoHorizontalOverflow(mobile.page, 'Mobile analytics screen');
}
if (label === 'after') {
  await mobile.page.getByTestId('tab-preventive').click();
  const mobilePreventiveCard = mobile.page.getByTestId('preventive-plan-PB-2026-001');
  await mobilePreventiveCard.waitFor({ state: 'visible', timeout: 30_000 });
  await mobilePreventiveCard.getByText('Bakım geçmişi', { exact: true }).click();
  await verifyServiceReportPrint(mobile.page, 'preventive-service-report-PB-2026-001-H001', true);
}
await mobile.context.close();

const desktop = await openApp({ width: 1440, height: 900 });
await captureSharedScenarios(desktop.page, 'desktop');

const desktopAnalyticsTab = desktop.page.getByTestId('tab-analytics');
if (await desktopAnalyticsTab.count()) {
  await desktopAnalyticsTab.click();
  await desktop.page.getByTestId('maintenance-analytics-screen').waitFor({ state: 'visible', timeout: 30_000 });
  await capture(desktop.page, 'desktop-analytics');
  await assertNoHorizontalOverflow(desktop.page, 'Desktop analytics screen');
}
if (label === 'after') {
  await desktop.page.getByTestId('tab-preventive').click();
  const desktopPreventiveCard = desktop.page.getByTestId('preventive-plan-PB-2026-001');
  await desktopPreventiveCard.waitFor({ state: 'visible', timeout: 30_000 });
  await desktopPreventiveCard.getByText('Bakım geçmişi', { exact: true }).click();
  await verifyServiceReportPrint(desktop.page, 'preventive-service-report-PB-2026-001-H001', true);
}
await desktop.context.close();

await browser.close();

if (browserErrors.length) {
  console.error('Browser errors detected:');
  for (const error of browserErrors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('No browser runtime errors detected.');
}
