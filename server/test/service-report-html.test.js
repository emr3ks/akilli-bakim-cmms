import { describe, expect, it } from 'vitest';

import { buildServiceReportHtml } from '../../src/serviceReportHtml.ts';

const machine = {
  id: 1,
  code: 'MCH-2026-001',
  name: 'CNC Freze Merkezi',
  line: 'İşleme Hattı A',
  brand: 'Haas',
  model: 'VF-4SS',
  serialNumber: 'HSS-VF4-2021-8842',
  criticality: 'high',
  status: 'running',
  qrCode: 'MCH-2026-001',
  currentRuntimeHours: 1200,
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
};

const report = {
  kind: 'work_order',
  documentCode: 'IE-2026-005',
  title: 'Teknik Servis Formu',
  generatedAt: '2026-11-27T08:00:00.000Z',
  machine,
  workOrder: {
    id: 5,
    code: 'IE-2026-005',
    status: 'closed',
    interventionNote: 'Kablo bağlantısı yenilendi.',
    rootCause: 'Hareketli bağlantı noktasında <kablo> kopması',
    durationMinutes: 75,
    assignedTo: { id: 2, name: 'Deniz Teknisyen', initials: 'DT' },
    startedAt: '2026-11-20T08:15:00.000Z',
    closedAt: '2026-11-20T09:30:00.000Z',
    createdAt: '2026-11-20T07:45:00.000Z',
  },
  fault: {
    id: 5,
    code: 'ARZ-2026-005',
    title: 'Sensör kablosu koptu',
    category: 'electrical',
    urgency: 'medium',
    description: 'Hareketli kablo bağlantısı koptu.',
    status: 'resolved',
    reportedBy: { id: 3, name: 'Elif Operatör', initials: 'EÖ' },
    createdAt: '2026-11-20T07:30:00.000Z',
  },
  parts: [
    {
      id: 1,
      partId: 1,
      code: 'YDK-2026-001',
      name: 'Rulman 6205-2RS',
      quantity: 2,
      unit: 'piece',
      unitCost: 480.75,
      totalCost: 961.5,
    },
  ],
  partsScope: 'work_order',
  totals: { partsCost: 961.5 },
};

describe('Meknivo service-report HTML', () => {
  it('embeds the official dark logo and all required service-report sections', () => {
    const html = buildServiceReportHtml(report);

    expect(html).toContain('<title id="title">MEKNIVO</title>');
    expect(html).toContain('Makine künyesi');
    expect(html).toContain('MCH-2026-001');
    expect(html).toContain('Kök neden');
    expect(html).toContain('YDK-2026-001');
    expect(html).toContain('961,50 ₺');
    expect(html).toContain('75 dk');
    expect(html).toContain('Teknisyen');
    expect(html).toContain('Bakım Yöneticisi');
    expect(html).toContain('İmza');
  });

  it('escapes dynamic report content before embedding it in HTML', () => {
    const html = buildServiceReportHtml(report);
    const escapedTag = `${String.fromCodePoint(60, 108, 116, 59)}kablo${String.fromCodePoint(62, 103, 116, 59)}`;

    expect(html).not.toContain('<kablo>');
    expect(html).toContain(escapedTag);
  });
});
