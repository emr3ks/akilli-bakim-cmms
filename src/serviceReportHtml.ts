import { BRAND_SVG } from './brand/generated-assets';
import { formatDate, formatDateTime, formatNumber } from './format';
import type { ServiceReport } from './types';

const machineStatusLabels: Record<ServiceReport['machine']['status'], string> = {
  running: 'Çalışıyor',
  maintenance: 'Bakımda',
  faulted: 'Arızalı',
  stopped: 'Duruşta',
};

function escapeHtml(value: string | number | null | undefined): string {
  const amp = String.fromCodePoint(38, 97, 109, 112, 59);
  const lt = String.fromCodePoint(60, 108, 116, 59);
  const gt = String.fromCodePoint(62, 103, 116, 59);
  const quot = String.fromCodePoint(34, 113, 117, 111, 116, 59);
  return String(value ?? '')
    .replaceAll('&', amp)
    .replaceAll('<', lt)
    .replaceAll('>', gt)
    .replaceAll('"', quot)
    .replaceAll("'", String.fromCodePoint(39, 38, 35, 48, 51, 57, 59));
}

function reportParts(report: ServiceReport): string {
  if (!report.parts.length) {
    return '<tr><td colspan="5" class="empty">Bu kayıt için yedek parça kullanımı bulunmuyor.</td></tr>';
  }
  return report.parts.map((part) => `
    <tr>
      <td>${escapeHtml(part.code)}</td>
      <td>${escapeHtml(part.name)}</td>
      <td class="number">${escapeHtml(formatNumber(part.quantity, 3))}</td>
      <td class="number">${escapeHtml(formatNumber(part.unitCost, 2))} ₺</td>
      <td class="number">${escapeHtml(formatNumber(part.totalCost, 2))} ₺</td>
    </tr>`).join('');
}

function workOrderDetails(report: ServiceReport): string {
  if (!report.workOrder || !report.fault) return '';
  return `
    <section class="section">
      <h2>Arıza ve müdahale özeti</h2>
      <div class="summary-grid">
        <div><span>Arıza kodu</span><strong>${escapeHtml(report.fault.code)}</strong></div>
        <div><span>Arıza başlığı</span><strong>${escapeHtml(report.fault.title)}</strong></div>
        <div><span>Teknisyen</span><strong>${escapeHtml(report.workOrder.assignedTo?.name || 'Atanmadı')}</strong></div>
        <div><span>İş emri durumu</span><strong>${escapeHtml(report.workOrder.status)}</strong></div>
        <div class="wide"><span>Arıza açıklaması</span><strong>${escapeHtml(report.fault.description)}</strong></div>
        <div class="wide"><span>Müdahale / çözüm</span><strong>${escapeHtml(report.workOrder.interventionNote)}</strong></div>
        <div class="wide"><span>Kök neden</span><strong>${escapeHtml(report.workOrder.rootCause)}</strong></div>
      </div>
    </section>`;
}

function preventiveDetails(report: ServiceReport): string {
  if (!report.preventive) return '';
  const results = report.preventive.results.map((result) => `
    <tr>
      <td>${escapeHtml(result.title)}</td>
      <td>${result.measurementValue === null ? '—' : escapeHtml(formatNumber(result.measurementValue, 3))}</td>
      <td>${escapeHtml(result.note || '—')}</td>
    </tr>`).join('');
  return `
    <section class="section">
      <h2>Periyodik bakım özeti</h2>
      <div class="summary-grid">
        <div><span>Bakım planı</span><strong>${escapeHtml(report.preventive.planCode)}</strong></div>
        <div><span>Plan adı</span><strong>${escapeHtml(report.preventive.name)}</strong></div>
        <div><span>Teknisyen</span><strong>${escapeHtml(report.preventive.completedBy.name)}</strong></div>
        <div><span>Tamamlanma</span><strong>${escapeHtml(formatDateTime(report.preventive.completedAt))}</strong></div>
        <div class="wide"><span>Bakım notu</span><strong>${escapeHtml(report.preventive.notes || '—')}</strong></div>
        <div><span>Sonraki bakım</span><strong>${escapeHtml(formatDate(report.preventive.nextDueDate))}</strong></div>
        <div><span>Çalışma saati</span><strong>${report.preventive.runtimeHours === null ? '—' : escapeHtml(formatNumber(report.preventive.runtimeHours, 1))}</strong></div>
      </div>
      <h3>Kontrol listesi sonuçları</h3>
      <table>
        <thead><tr><th>Kontrol maddesi</th><th>Ölçüm</th><th>Not</th></tr></thead>
        <tbody>${results}</tbody>
      </table>
    </section>`;
}

export function buildServiceReportHtml(report: ServiceReport): string {
  const durationMinutes = report.workOrder?.durationMinutes ?? null;
  const durationLabel = report.preventive
    ? 'Müdahale süresi kaydı bulunmuyor'
    : durationMinutes === null
      ? '—'
      : `${durationMinutes} dk`;
  const partsScopeNote = report.partsScope === 'preventive_plan'
    ? '<p class="note">Parça maliyetleri bakım planı seviyesindeki aktif kullanımlardır; mevcut veri modeli belirli bir tamamlama anına bağlı değildir.</p>'
    : '';
  return `
    <!doctype html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 26px; color: #081735; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
          .page { width: 100%; max-width: 760px; margin: 0 auto; }
          .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 3px solid #087FE5; padding-bottom: 18px; }
          .brand-logo { width: 190px; height: 44px; }
          .brand-logo svg { width: 190px; height: 44px; display: block; }
          h1 { margin: 0 0 3px; font-size: 22px; }
          .subtitle { color: #53647a; font-size: 12px; }
          .document { text-align: right; }
          .document strong { display: block; color: #087fe5; font-size: 15px; }
          .document span { color: #53647a; }
          .section { margin-top: 18px; }
          h2 { margin: 0 0 9px; color: #081735; font-size: 14px; border-left: 4px solid #087FE5; padding-left: 8px; }
          h3 { margin: 16px 0 7px; font-size: 12px; }
          .summary-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #dce4ee; }
          .summary-grid > div { min-height: 54px; padding: 9px 11px; border-right: 1px solid #dce4ee; border-bottom: 1px solid #dce4ee; }
          .summary-grid > div:nth-child(2n) { border-right: 0; }
          .summary-grid .wide { grid-column: 1 / -1; border-right: 0; }
          .summary-grid span { display: block; margin-bottom: 4px; color: #6b7b90; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
          .summary-grid strong { font-size: 12px; line-height: 1.45; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #dce4ee; padding: 7px 8px; text-align: left; vertical-align: top; }
          th { background: #eaf4fc; color: #0646a8; font-size: 10px; text-transform: uppercase; }
          td.number { text-align: right; white-space: nowrap; }
          td.empty { text-align: center; color: #6b7b90; padding: 14px; }
          .note { margin: 8px 0 0; color: #6b7b90; font-size: 9px; line-height: 14px; }
          .totals { margin-top: 8px; margin-left: auto; width: 260px; border: 1px solid #dce4ee; }
          .totals div { display: flex; justify-content: space-between; padding: 8px 10px; }
          .totals .total { border-top: 1px solid #dce4ee; background: #eaf4fc; color: #0646a8; font-size: 14px; font-weight: 800; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 44px; }
          .signature { min-height: 78px; border-top: 1px solid #081735; padding-top: 6px; text-align: center; }
          .signature strong { display: block; font-size: 11px; }
          .signature span { color: #6b7b90; font-size: 9px; }
          .footer { margin-top: 26px; padding-top: 9px; border-top: 1px solid #dce4ee; display: flex; justify-content: space-between; color: #6b7b90; font-size: 9px; }
          table, .totals, .signatures { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4; margin: 12mm; }
          @media print { body { padding: 0; } .page { max-width: none; } }
        </style>
      </head>
      <body>
        <div class="page">
          <header class="header">
            <div class="brand-logo" aria-label="Meknivo">${BRAND_SVG.primaryDark}</div>
            <div>
              <h1>${escapeHtml(report.title)}</h1>
              <div class="subtitle">Meknivo CMMS · Teknik Servis Kaydı</div>
            </div>
            <div class="document">
              <span>Belge No</span>
              <strong>${escapeHtml(report.documentCode)}</strong>
              <span>${escapeHtml(formatDateTime(report.generatedAt))}</span>
            </div>
          </header>

          <section class="section">
            <h2>Makine künyesi</h2>
            <div class="summary-grid">
              <div><span>Makine kodu</span><strong>${escapeHtml(report.machine.code)}</strong></div>
              <div><span>Makine adı</span><strong>${escapeHtml(report.machine.name)}</strong></div>
              <div><span>Hat / bölge</span><strong>${escapeHtml(report.machine.line)}</strong></div>
              <div><span>Marka / model</span><strong>${escapeHtml(report.machine.brand)} ${escapeHtml(report.machine.model)}</strong></div>
              <div><span>Seri numarası</span><strong>${escapeHtml(report.machine.serialNumber)}</strong></div>
              <div><span>Durum</span><strong>${escapeHtml(machineStatusLabels[report.machine.status])}</strong></div>
            </div>
          </section>

          ${workOrderDetails(report)}
          ${preventiveDetails(report)}

          <section class="section">
            <h2>Kullanılan yedek parçalar ve maliyet</h2>
            ${partsScopeNote}
            <table>
              <thead><tr><th>Kod</th><th>Parça</th><th>Miktar</th><th>Birim maliyet</th><th>Toplam</th></tr></thead>
              <tbody>${reportParts(report)}</tbody>
            </table>
            <div class="totals">
              <div><span>Harcanan süre</span><strong>${durationLabel}</strong></div>
              <div class="total"><span>Toplam parça maliyeti</span><strong>${escapeHtml(formatNumber(report.totals.partsCost, 2))} ₺</strong></div>
            </div>
          </section>

          <div class="signatures">
            <div class="signature"><strong>Teknisyen</strong><span>Ad Soyad / Tarih / İmza</span></div>
            <div class="signature"><strong>Bakım Yöneticisi</strong><span>Ad Soyad / Tarih / İmza</span></div>
          </div>

          <footer class="footer">
            <span>Bu form Meknivo CMMS tarafından üretilmiştir.</span>
            <span>${escapeHtml(report.documentCode)}</span>
          </footer>
        </div>
      </body>
    </html>`;
}
