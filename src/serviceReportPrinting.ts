import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { buildServiceReportHtml } from './serviceReportHtml';
import type { ServiceReport } from './types';

export async function printHtmlInWebBrowser(html: string): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('Web yazdırma ortamı bulunamadı.');
  }
  const frame = document.createElement('iframe');
  frame.title = 'Meknivo servis formu yazdırma';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.srcdoc = html;
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.onerror = () => resolve();
    document.body.appendChild(frame);
  });
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 1000);
}

export async function printServiceReport(report: ServiceReport): Promise<void> {
  const html = buildServiceReportHtml(report);
  if (Platform.OS === 'web') {
    await printHtmlInWebBrowser(html);
    return;
  }
  await Print.printAsync({ html });
}

export async function exportServiceReportPdf(report: ServiceReport): Promise<string> {
  const html = buildServiceReportHtml(report);
  if (Platform.OS === 'web') {
    await printHtmlInWebBrowser(html);
    return 'web-print';
  }

  const file = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${report.documentCode} teknik servis formu`,
      UTI: 'com.adobe.pdf',
    });
  }
  return file.uri;
}

export { buildServiceReportHtml } from './serviceReportHtml';
