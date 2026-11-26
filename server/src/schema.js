export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'technician', 'operator')),
  initials TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  line TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  criticality TEXT NOT NULL CHECK (criticality IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('running', 'maintenance', 'faulted', 'stopped')),
  qr_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('maintenance', 'fault')),
  description TEXT NOT NULL,
  severity TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_machines_line ON machines(line);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_criticality ON machines(criticality);
CREATE INDEX IF NOT EXISTS idx_records_machine ON maintenance_records(machine_id);
CREATE INDEX IF NOT EXISTS idx_records_type ON maintenance_records(type);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON maintenance_records(created_at);
`;
