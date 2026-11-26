import { run, transaction } from './db.js';

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
    status: 'running',
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

export async function resetDatabase(database) {
  await run(database, 'DELETE FROM maintenance_records');
  await run(database, 'DELETE FROM machines');
  await run(database, 'DELETE FROM users');
  await run(database, "DELETE FROM sqlite_sequence WHERE name IN ('maintenance_records', 'machines', 'users')");
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
    for (const machine of DEMO_MACHINES) {
      await run(
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
    }
  });

  return { users: DEMO_USERS.length, machines: DEMO_MACHINES.length };
}
