import { run, transaction } from './db.js';
import { addUtcDays, todayPlantDate } from './utils/date-only.js';

export const DEMO_USERS = [
  {
    id: 1,
    name: 'Adın Yönetici',
    email: 'adin.yonetici@example.com',
    role: 'admin',
    initials: 'AY',
  },
  {
    id: 2,
    name: 'Deniz Teknisyen',
    email: 'deniz.teknisyen@example.com',
    role: 'technician',
    initials: 'DT',
  },
  {
    id: 3,
    name: 'Elif Operatör',
    email: 'elif.operator@example.com',
    role: 'operator',
    initials: 'EÖ',
  },
];

export const DEMO_MACHINES = [
  {
    code: 'MCH-2026-001',
    name: 'CNC Freze Merkezi',
    line: 'İşleme Hattı A',
    brand: 'Haas',
    model: 'VF-4SS',
    serialNumber: 'HSS-VF4-2021-8842',
    criticality: 'high',
    status: 'running',
  },
  {
    code: 'MCH-2026-002',
    name: 'Hidrolik Pres Hattı',
    line: 'Şekillendirme Hattı B',
    brand: 'Schuler',
    model: 'HP-400',
    serialNumber: 'SCH-HP400-2019-1047',
    criticality: 'high',
    status: 'maintenance',
  },
  {
    code: 'MCH-2026-003',
    name: 'Rotary Hava Kompresörü',
    line: 'Yardımcı Tesisler',
    brand: 'Atlas Copco',
    model: 'GA-90 VSD',
    serialNumber: 'ATL-GA90-2022-3371',
    criticality: 'medium',
    status: 'running',
  },
  {
    code: 'MCH-2026-004',
    name: 'Otomatik Paketleme Hattı',
    line: 'Paketleme Hattı C',
    brand: 'Krones',
    model: 'Contiform 3',
    serialNumber: 'KRO-CF3-2020-5519',
    criticality: 'medium',
    status: 'faulted',
  },
  {
    code: 'MCH-2026-005',
    name: 'Endüstriyel Buhar Kazanı',
    line: 'Yardımcı Tesisler',
    brand: 'Bosch',
    model: 'Steam 120',
    serialNumber: 'BOS-ST120-2018-2206',
    criticality: 'high',
    status: 'stopped',
  },
  {
    code: 'MCH-2026-006',
    name: 'Paletleme Konveyörü',
    line: 'Paketleme Hattı C',
    brand: 'Interroll',
    model: 'MultiControl AI',
    serialNumber: 'INT-MCAI-2023-9014',
    criticality: 'low',
    status: 'maintenance',
  },
  {
    code: 'MCH-2026-007',
    name: 'Robotik Kaynak Hücresi',
    line: 'Fabrication Hattı D',
    brand: 'FANUC',
    model: 'ARC Mate 120iD',
    serialNumber: 'FAN-AM120-2022-7128',
    criticality: 'medium',
    status: 'running',
  },
];

export const DEMO_FAULTS = [
  {
    code: 'ARZ-2026-001',
    machineCode: 'MCH-2026-004',
    title: 'Paketleme hattı kontrol ünitesi yanıt vermiyor',
    category: 'software_sensor',
    urgency: 'critical',
    description: 'Ürün sayacı hattan ayrıldı; kontrol ünitesi ekranı dondu ve hat tamamen durdu.',
    photo: null,
    reportedBy: 3,
    status: 'open',
    createdAt: '2026-11-26T06:20:00.000Z',
  },
  {
    code: 'ARZ-2026-002',
    machineCode: 'MCH-2026-005',
    title: 'Buhar kazanı seviye sensörü arızalı',
    category: 'electrical',
    urgency: 'high',
    description: 'Seviye sensörü kararsız ölçüm veriyor; emniyet valfi manuel konuma alındı.',
    photo: null,
    reportedBy: 3,
    status: 'open',
    createdAt: '2026-11-25T13:10:00.000Z',
  },
  {
    code: 'ARZ-2026-003',
    machineCode: 'MCH-2026-002',
    title: 'Pres hidrolik yağında ani basınç düşüşü',
    category: 'pneumatic_hydraulic',
    urgency: 'medium',
    description: 'Üretim sırasında yağ basıncı 180 bar seviyesinden düştü ve pres yavaşladı.',
    photo: null,
    reportedBy: 3,
    status: 'open',
    createdAt: '2026-11-24T08:40:00.000Z',
  },
  {
    code: 'ARZ-2026-004',
    machineCode: 'MCH-2026-006',
    title: 'Konveyör taşıma motoru sıcaklığı yükseldi',
    category: 'mechanical',
    urgency: 'low',
    description: '4. motorun sıcaklık alarmı verdi; taşıma akışı düşük hızda sürdürülüyor.',
    photo: null,
    reportedBy: 3,
    status: 'open',
    createdAt: '2026-11-23T10:05:00.000Z',
  },
  {
    code: 'ARZ-2026-005',
    machineCode: 'MCH-2026-003',
    title: 'Kompresör yağ basıncı sensörü kablo bağlantısı koptu',
    category: 'electrical',
    urgency: 'medium',
    description: 'Sensör kablosu hareketli bağlantı noktasında kopdu ve basınç alarmı üretti.',
    photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    reportedBy: 3,
    status: 'resolved',
    createdAt: '2026-11-20T07:30:00.000Z',
  },
];

export const DEMO_WORK_ORDERS = [
  {
    code: 'IE-2026-001',
    faultCode: 'ARZ-2026-001',
    assignedTo: null,
    status: 'open',
    createdBy: 1,
    createdAt: '2026-11-26T06:35:00.000Z',
  },
  {
    code: 'IE-2026-002',
    faultCode: 'ARZ-2026-002',
    assignedTo: 2,
    status: 'assigned',
    createdBy: 1,
    assignedAt: '2026-11-25T13:25:00.000Z',
    createdAt: '2026-11-25T13:20:00.000Z',
  },
  {
    code: 'IE-2026-003',
    faultCode: 'ARZ-2026-003',
    assignedTo: 2,
    status: 'in_progress',
    createdBy: 1,
    assignedAt: '2026-11-24T09:00:00.000Z',
    startedAt: '2026-11-24T09:20:00.000Z',
    createdAt: '2026-11-24T08:55:00.000Z',
  },
  {
    code: 'IE-2026-004',
    faultCode: 'ARZ-2026-004',
    assignedTo: 2,
    status: 'waiting_parts',
    createdBy: 1,
    assignedAt: '2026-11-23T10:30:00.000Z',
    startedAt: '2026-11-23T10:45:00.000Z',
    createdAt: '2026-11-23T10:25:00.000Z',
  },
  {
    code: 'IE-2026-005',
    faultCode: 'ARZ-2026-005',
    assignedTo: 2,
    status: 'closed',
    createdBy: 1,
    assignedAt: '2026-11-20T08:00:00.000Z',
    startedAt: '2026-11-20T08:15:00.000Z',
    interventionNote: 'Kablo bağlantısı yenilendi, sıcaklık izleme yapıldı ve sensör doğrulandı.',
    rootCause: 'Hareketli bağlantı noktasında kablo kopması',
    durationMinutes: 75,
    solutionPhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    closedAt: '2026-11-20T09:30:00.000Z',
    createdAt: '2026-11-20T07:45:00.000Z',
  },
];

export const DEMO_PREVENTIVE_PLANS = [
  {
    code: 'PB-2026-001',
    machineCode: 'MCH-2026-001',
    name: 'CNC spindle yağlama ve kontrolü',
    frequency: 'weekly',
    assignedTo: 2,
    dueOffsetDays: -3,
    checklist: [
      { title: 'Spindle yağ seviyesini kontrol et', measurementLabel: 'Yağ seviyesi (%)' },
      { title: 'Spindle titreşim seviyesini ölç', measurementLabel: 'Titreşim (mm/s)' },
      { title: 'Soğutma ve yağ kaçağını kontrol et' },
    ],
  },
  {
    code: 'PB-2026-002',
    machineCode: 'MCH-2026-002',
    name: 'Hidrolik pres yağ ve filtre bakımı',
    frequency: 'monthly',
    assignedTo: 2,
    dueOffsetDays: 0,
    checklist: [
      { title: 'Hidrolik yağ seviyesini kontrol et', measurementLabel: 'Yağ seviyesi (%)' },
      { title: 'Filtre tıkanıklık göstergesini kontrol et' },
      { title: 'Pres kaçaklarını ve hortum bağlantılarını incele' },
    ],
  },
  {
    code: 'PB-2026-003',
    machineCode: 'MCH-2026-003',
    name: 'Hava kompresörü güvenlik ve yağ bakımı',
    frequency: 'quarterly',
    assignedTo: 2,
    dueOffsetDays: 4,
    checklist: [
      { title: 'Kompresör yağ basıncını ölç', measurementLabel: 'Yağ basıncı (bar)' },
      { title: 'Emniyet valfi fonksiyonunu test et' },
      { title: 'Motor titreşimini ölç', measurementLabel: 'Titreşim (mm/s)' },
      { title: 'Hava kaçağını kontrol et' },
    ],
  },
  {
    code: 'PB-2026-004',
    machineCode: 'MCH-2026-004',
    name: 'Paketleme hattı sensör ve mekanik kontrolü',
    frequency: 'semiannual',
    assignedTo: 2,
    dueOffsetDays: 21,
    checklist: [
      { title: 'Ürün sayacı sensörlerini test et' },
      { title: 'Konveyör gerginliğini kontrol et' },
      { title: 'Elektrik panosunda termal kontrol yap' },
      { title: 'Güvenlik sensörlerini doğrula' },
    ],
  },
  {
    code: 'PB-2026-005',
    machineCode: 'MCH-2026-005',
    name: 'Buhar kazanı yıllık güvenlik bakımı',
    frequency: 'annual',
    assignedTo: 2,
    dueOffsetDays: 90,
    checklist: [
      { title: 'Su arıtma değerlerini ölç', measurementLabel: 'Kireç sertliği (ppm)' },
      { title: 'Emniyet valfini kalibrasyon cihazıyla test et' },
      { title: 'Yanmaç ve ateşleyici fonksiyonunu kontrol et' },
      { title: 'Buhar kaçağını ve manometreleri incele' },
    ],
  },
  {
    code: 'PB-2026-006',
    machineCode: 'MCH-2026-006',
    name: 'Paletleme konveyörü çalışma saati bakımı',
    frequency: 'working_hours',
    assignedTo: 2,
    dueOffsetDays: 2,
    intervalHours: 160,
    runtimeHours: 1200,
    checklist: [
      { title: 'Taşıma motoru yağını kontrol et' },
      { title: 'Rulman sıcaklığını ölç', measurementLabel: 'Sıcaklık (°C)' },
      { title: 'Emniyet switchlerini test et' },
    ],
  },
];

export async function resetDatabase(database) {
  await run(database, 'DELETE FROM maintenance_execution_items');
  await run(database, 'DELETE FROM maintenance_occurrence_keys');
  await run(database, 'DELETE FROM maintenance_executions');
  await run(database, 'DELETE FROM maintenance_checklist_items');
  await run(database, 'DELETE FROM maintenance_plans');
  await run(database, 'DELETE FROM work_orders');
  await run(database, 'DELETE FROM faults');
  await run(database, 'DELETE FROM maintenance_records');
  await run(database, 'DELETE FROM maintenance_runtime_readings');
  await run(database, 'DELETE FROM machines');
  await run(database, 'DELETE FROM users');
  await run(
    database,
    "DELETE FROM sqlite_sequence WHERE name IN ('maintenance_execution_items', 'maintenance_executions', 'maintenance_checklist_items', 'maintenance_plans', 'work_orders', 'faults', 'maintenance_records', 'machines', 'users')",
  );
}

/** Reset and populate the database with deterministic demo data. */
export async function seedDemoData(database) {
  await transaction(database, async () => {
    await resetDatabase(database);

    for (const user of DEMO_USERS) {
      await run(
        database,
        'INSERT INTO users (id, name, email, role, initials) VALUES (?, ?, ?, ?, ?)',
        [user.id, user.name, user.email, user.role, user.initials],
      );
    }

    const timestamp = new Date().toISOString();
    const machineIds = new Map();
    for (const machine of DEMO_MACHINES) {
      const result = await run(
        database,
        `INSERT INTO machines
          (code, name, line, brand, model, serial_number, criticality, status, qr_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          machine.code,
          machine.name,
          machine.line,
          machine.brand,
          machine.model,
          machine.serialNumber,
          machine.criticality,
          machine.status,
          machine.code,
          timestamp,
          timestamp,
        ],
      );
      machineIds.set(machine.code, result.lastID);
    }

    const faultIds = new Map();
    for (const fault of DEMO_FAULTS) {
      const result = await run(
        database,
        `INSERT INTO faults
          (code, machine_id, title, category, urgency, description, photo_data, status, reported_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fault.code,
          machineIds.get(fault.machineCode),
          fault.title,
          fault.category,
          fault.urgency,
          fault.description,
          fault.photo,
          fault.status,
          fault.reportedBy,
          fault.createdAt,
          fault.createdAt,
        ],
      );
      faultIds.set(fault.code, result.lastID);
    }

    for (const workOrder of DEMO_WORK_ORDERS) {
      await run(
        database,
        `INSERT INTO work_orders
          (code, fault_id, assigned_to, status, intervention_note, root_cause, duration_minutes,
           solution_photo_data, created_by, assigned_at, started_at, closed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workOrder.code,
          faultIds.get(workOrder.faultCode),
          workOrder.assignedTo,
          workOrder.status,
          workOrder.interventionNote ?? null,
          workOrder.rootCause ?? null,
          workOrder.durationMinutes ?? null,
          workOrder.solutionPhoto ?? null,
          workOrder.createdBy,
          workOrder.assignedAt ?? null,
          workOrder.startedAt ?? null,
          workOrder.closedAt ?? null,
          workOrder.createdAt,
          workOrder.createdAt,
        ],
      );
    }

    const demoToday = todayPlantDate();
    for (const plan of DEMO_PREVENTIVE_PLANS) {
      const nextDueDate = addUtcDays(demoToday, plan.dueOffsetDays);
      const result = await run(
        database,
        `INSERT INTO maintenance_plans
          (code, machine_id, name, frequency, assigned_to, next_due_date,
           next_due_runtime_hours, interval_hours, last_completed_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plan.code,
          machineIds.get(plan.machineCode),
          plan.name,
          plan.frequency,
          plan.assignedTo,
          nextDueDate,
          plan.frequency === 'working_hours'
            ? plan.runtimeHours + plan.intervalHours
            : null,
          plan.frequency === 'working_hours' ? plan.intervalHours : null,
          null,
          1,
          timestamp,
          timestamp,
        ],
      );

      for (const [index, item] of plan.checklist.entries()) {
        await run(
          database,
          `INSERT INTO maintenance_checklist_items (plan_id, position, title, measurement_label)
           VALUES (?, ?, ?, ?)`,
          [result.lastID, index + 1, item.title, item.measurementLabel ?? null],
        );
      }

      if (plan.frequency === 'working_hours') {
        await run(
          database,
          `INSERT INTO maintenance_runtime_readings
            (machine_id, runtime_hours, reported_at, reported_by)
           VALUES (?, ?, ?, ?)`,
          [machineIds.get(plan.machineCode), plan.runtimeHours, timestamp, plan.assignedTo],
        );
      }
    }
  });

  return {
    users: DEMO_USERS.length,
    machines: DEMO_MACHINES.length,
    faults: DEMO_FAULTS.length,
    workOrders: DEMO_WORK_ORDERS.length,
    preventivePlans: DEMO_PREVENTIVE_PLANS.length,
    checklistItems: DEMO_PREVENTIVE_PLANS.reduce(
      (total, plan) => total + plan.checklist.length,
      0,
    ),
  };
}
