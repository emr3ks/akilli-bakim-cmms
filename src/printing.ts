import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { BRAND_SVG } from './brand/generated-assets';
import { printHtmlInWebBrowser } from './serviceReportPrinting';
import { createQrDataUri } from './qr';
import { criticalityLabels, statusLabels } from './ui';
import type { Machine } from './types';

function escapeHtml(value: string): string {
  const amp = String.fromCodePoint(38, 97, 109, 112, 59);
  const lt = String.fromCodePoint(60, 108, 116, 59);
  const gt = String.fromCodePoint(62, 103, 116, 59);
  const quot = String.fromCodePoint(34, 113, 117, 111, 116, 59);
  return value
    .replaceAll('&', amp)
    .replaceAll('<', lt)
    .replaceAll('>', gt)
    .replaceAll('"', quot)
    .replaceAll("'", String.fromCodePoint(39, 38, 35, 48, 51, 57, 59));
}

export function buildMachineCardHtml(machine: Machine): string {
  const fields: [string, string][] = [
    ['Makine kodu', machine.code],
    ['Makine adı', machine.name],
    ['Üretim hattı / bölge', machine.line],
    ['Marka / model', `${machine.brand} ${machine.model}`],
    ['Seri numarası', machine.serialNumber],
    ['Kritik seviye', criticalityLabels[machine.criticality]],
    ['Anlık durum', statusLabels[machine.status]],
  ];

  return `
    <!doctype html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 32px; background: #eef2f7; color: #081735; font-family: Arial, sans-serif; }
          .card { width: 760px; max-width: 100%; margin: 0 auto; background: white; border: 2px solid #dce4ee; border-radius: 22px; overflow: hidden; box-shadow: 0 12px 30px rgba(16,35,63,.10); }
          .head { padding: 26px 30px; background: #081735; color: white; display: flex; justify-content: space-between; align-items: center; }
          .brand { display: flex; align-items: center; gap: 18px; }
          .brand-logo { width: 180px; height: 42px; display: flex; align-items: center; }
          .brand-logo svg { width: 180px; height: 42px; display: block; }
          h1 { margin: 0; font-size: 25px; }
          .subtitle { margin-top: 4px; color: #cfe0f7; font-size: 13px; }
          .content { padding: 30px; display: grid; grid-template-columns: 260px 1fr; gap: 30px; }
          .qr { text-align: center; }
          .qr img { width: 240px; height: 240px; border: 1px solid #dce4ee; border-radius: 16px; }
          .qr-code { margin-top: 10px; font-weight: 800; color: #087fe5; font-size: 15px; }
          .qr-help { margin-top: 4px; color: #53647a; font-size: 12px; }
          .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; align-content: start; }
          .field { border-bottom: 1px solid #dce4ee; padding-bottom: 10px; }
          .field.full { grid-column: 1 / -1; }
          .label { color: #6b7b90; font-size: 11px; text-transform: uppercase; letter-spacing: .8px; font-weight: 700; }
          .value { margin-top: 4px; font-size: 15px; font-weight: 700; }
          .footer { padding: 18px 30px; border-top: 1px solid #dce4ee; color: #6b7b90; font-size: 11px; display: flex; justify-content: space-between; }
          @media print { body { padding: 0; background: white; } .card { border: 0; box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="head">
            <div class="brand">
              <div class="brand-logo" aria-label="Meknivo">${BRAND_SVG.monochromeWhite}</div>
              <div><h1>Makine QR Kimlik Kartı</h1><div class="subtitle">Meknivo CMMS · Endüstriyel Ekipman Tanımlama</div></div>
            </div>
          </div>
          <div class="content">
            <div class="qr">
              <img src="${createQrDataUri(machine.qrCode || machine.code)}" alt="QR kod" />
              <div class="qr-code">${escapeHtml(machine.code)}</div>
              <div class="qr-help">Kartı okutarak makineye ulaşın</div>
            </div>
            <div class="fields">
              ${fields.map(([label, value], index) => `
                <div class="field ${index === 1 || index === 6 ? 'full' : ''}">
                  <div class="label">${escapeHtml(label)}</div>
                  <div class="value">${escapeHtml(value)}</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="footer"><span>Üretim ve bakım faaliyetlerinde ekipmanla eşleştirmek için kullanınız.</span><span>${escapeHtml(machine.code)}</span></div>
        </div>
      </body>
    </html>`;
}

export async function printMachineCard(machine: Machine): Promise<void> {
  const html = buildMachineCardHtml(machine);
  if (Platform.OS === 'web') {
    await printHtmlInWebBrowser(html);
    return;
  }
  await Print.printAsync({ html });
}

export async function exportMachineCardPdf(machine: Machine): Promise<string> {
  const html = buildMachineCardHtml(machine);
  if (Platform.OS === 'web') {
    await printHtmlInWebBrowser(html);
    return 'web-print';
  }
  const file = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${machine.code} makine kimlik kartı`,
      UTI: 'com.adobe.pdf',
    });
  }
  return file.uri;
}
