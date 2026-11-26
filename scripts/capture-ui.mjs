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
await capture(mobile, 'after-phase3-mobile-login.png');

await mobile.getByTestId('demo-login-admin').click();
await mobile.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-dashboard.png');
await capture(mobile, 'after-phase3-mobile-dashboard.png');
await assertNoHorizontalOverflow(mobile, 'Mobile dashboard');

await mobile.getByTestId('tab-preventive').click();
await mobile.getByTestId('preventive-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('Bakım Planları', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-phase3-mobile-preventive-plans.png');
await assertNoHorizontalOverflow(mobile, 'Mobile preventive plan screen');
await mobile.getByText('+ Yeni plan', { exact: true }).click();
const preventiveForm = mobile.getByTestId('preventive-plan-modal');
await preventiveForm.waitFor({ state: 'visible', timeout: 30_000 });
await preventiveForm.getByText('Çalışma Saati Bazlı', { exact: true }).click();
await preventiveForm.getByText('MCH-2026-006 · Paletleme Konveyörü', { exact: true }).click();
const prefilledRuntime = preventiveForm.getByLabel('Mevcut çalışma saati');
if ((await prefilledRuntime.inputValue()) !== '1200') {
  throw new Error('Working-hours plan form did not prefill the machine runtime reading.');
}
await capture(mobile, 'after-phase3-mobile-preventive-create.png');
await preventiveForm.getByText('Kapat', { exact: true }).click();

await mobile.getByTestId('tab-workorders').click();
await mobile.getByTestId('work-orders-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByTestId('work-orders-section-orders').click();
await mobile.getByTestId('work-order-IE-2026-002').waitFor({ state: 'visible', timeout: 30_000 });
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
await capture(mobile, 'after-phase3-mobile-machine-detail.png');

await mobile.getByTestId('open-fault-report').click();
const faultModal = mobile.getByTestId('fault-report-modal');
await faultModal.waitFor({ state: 'visible', timeout: 30_000 });
const photoChooserPromise = mobile.waitForEvent('filechooser');
await faultModal.getByText('Galeri / dosya', { exact: true }).click();
const photoChooser = await photoChooserPromise;
await photoChooser.setFiles(path.resolve('docs/screenshots/before-mobile-dashboard.png'));
await faultModal.getByText(/Görsel hazır/).waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-fault-report.png');
await assertNoHorizontalOverflow(mobile, 'Mobile fault-report form');
await mobile.getByTestId('fault-title').fill('Playwright doğrulama arıza kaydı');
await mobile.getByTestId('fault-description').fill('Gerçek tarayıcı akışında fotoğraf önizlemesi ve API gönderimi doğrulandı.');
await mobile.getByTestId('submit-fault').click();
await faultModal.waitFor({ state: 'hidden', timeout: 30_000 });
await mobile.getByText(/ARZ-2026-\d{3} numaralı arıza bildirimi oluşturuldu/).waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-fault-reported.png');

await mobile.getByLabel('Makine kartını kapat').click();
await mobile.getByText('QR Okut', { exact: true }).click();
await mobile.getByTestId('scanner-screen').waitFor({ state: 'visible', timeout: 30_000 });
await capture(mobile, 'after-mobile-scanner.png');
await mobile.getByTestId('manual-machine-code').fill('MCH-2026-004');
await mobile.getByText('Bul', { exact: true }).click();
await mobile.getByTestId('machine-detail-screen').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('MCH-2026-004').first().waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('ARZ-2026-001').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.getByText('ARZ-2026-001').scrollIntoViewIfNeeded();
await capture(mobile, 'after-mobile-fault-history.png');
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
await capture(admin, 'after-phase3-desktop-dashboard.png');
await admin.getByTestId('tab-preventive').click();
await admin.getByTestId('preventive-screen').waitFor({ state: 'visible', timeout: 30_000 });
await capture(admin, 'after-phase3-desktop-preventive-plans.png');
await assertNoHorizontalOverflow(admin, 'Desktop preventive plan screen');
await admin.getByTestId('tab-workorders').click();
await admin.getByTestId('work-orders-screen').waitFor({ state: 'visible', timeout: 30_000 });
await admin.getByTestId('work-orders-section-orders').click();
await admin.getByTestId('work-order-IE-2026-002').waitFor({ state: 'visible', timeout: 30_000 });
await capture(admin, 'after-desktop-work-orders.png');
await assertNoHorizontalOverflow(admin, 'Desktop work-order screen');
await adminContext.close();

const technicianContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const technician = await preparePage(technicianContext);
await technician.goto(appUrl, { waitUntil: 'domcontentloaded' });
await technician.getByText('Hızlı Demo Giriş').waitFor({ state: 'visible', timeout: 90_000 });
await technician.getByTestId('demo-login-technician').click();
await technician.getByText('Bakım özeti').waitFor({ state: 'visible', timeout: 30_000 });
await technician.getByTestId('tab-preventive').click();
await technician.getByTestId('preventive-screen').waitFor({ state: 'visible', timeout: 30_000 });
const preventiveCard = technician.getByTestId('preventive-plan-PB-2026-001');
await preventiveCard.waitFor({ state: 'visible', timeout: 30_000 });
await preventiveCard.getByText('Kontrol listesini uygula', { exact: true }).click();
const preventiveCompletion = technician.getByTestId('preventive-completion-modal');
await preventiveCompletion.waitFor({ state: 'visible', timeout: 30_000 });
await capture(technician, 'after-phase3-mobile-preventive-checklist.png');
await assertNoHorizontalOverflow(technician, 'Mobile preventive checklist');
await preventiveCompletion.getByText('Kapat', { exact: true }).click();
const runtimeCard = technician.getByTestId('preventive-plan-PB-2026-006');
await runtimeCard.getByText('Çalışma saatini güncelle', { exact: true }).click();
const preventiveRuntime = technician.getByTestId('preventive-runtime-modal');
await preventiveRuntime.waitFor({ state: 'visible', timeout: 30_000 });
await capture(technician, 'after-phase3-mobile-preventive-runtime.png');
await assertNoHorizontalOverflow(technician, 'Mobile preventive runtime update');
await preventiveRuntime.getByText('Kapat', { exact: true }).click();
await technician.getByTestId('tab-workorders').click();
await technician.getByTestId('work-orders-screen').waitFor({ state: 'visible', timeout: 30_000 });
await technician.getByTestId('work-orders-section-orders').click();
const workOrderCard = technician.getByTestId('work-order-IE-2026-002');
await workOrderCard.waitFor({ state: 'visible', timeout: 30_000 });
await workOrderCard.getByText('Müdahaleye başla', { exact: true }).click();
await workOrderCard.getByText('Müdahale ediliyor', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await workOrderCard.getByText('Parça bekle', { exact: true }).click();
await workOrderCard.getByText('Parça bekliyor', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await workOrderCard.getByText('Müdahaleye dön', { exact: true }).click();
await workOrderCard.getByText('Müdahale ediliyor', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await workOrderCard.getByText('Çözüldü', { exact: true }).click();
const completionModal = technician.getByTestId('work-order-completion-modal');
await completionModal.waitFor({ state: 'visible', timeout: 30_000 });
await completionModal.getByLabel('Müdahale notu').fill('Sensör kablosu yenilendi ve saha doğrulaması tamamlandı.');
await completionModal.getByLabel('Kök neden açıklaması').fill('Hareketli bağlantı noktasında kablo kopması');
await completionModal.getByLabel('Harcanan süre (dakika)').fill('55');
const solutionChooserPromise = technician.waitForEvent('filechooser');
await completionModal.getByText('Galeri / dosya', { exact: true }).click();
const solutionChooser = await solutionChooserPromise;
await solutionChooser.setFiles(path.resolve('docs/screenshots/before-mobile-dashboard.png'));
await completionModal.getByText(/Görsel hazır/).waitFor({ state: 'visible', timeout: 30_000 });
await completionModal.getByText('Çözüldü olarak kaydet', { exact: true }).click();
await completionModal.waitFor({ state: 'hidden', timeout: 30_000 });
await workOrderCard.getByText('Çözüldü', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await workOrderCard.getByText('İş emrini kapat', { exact: true }).click();
await workOrderCard.getByText('Kapatıldı', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
await capture(technician, 'after-mobile-work-order-closure.png');
await assertNoHorizontalOverflow(technician, 'Mobile work-order closure');
await technicianContext.close();

await browser.close();

if (browserErrors.length) {
  console.error('Browser errors detected:');
  for (const error of browserErrors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('No browser runtime errors detected.');
}
