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

CREATE TABLE IF NOT EXISTS faults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  machine_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mechanical', 'electrical', 'pneumatic_hydraulic', 'software_sensor', 'other')),
  urgency TEXT NOT NULL CHECK (urgency IN ('critical', 'high', 'medium', 'low')),
  description TEXT NOT NULL,
  photo_data TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  reported_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  fault_id INTEGER NOT NULL UNIQUE,
  assigned_to INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'in_progress', 'waiting_parts', 'resolved', 'closed')),
  intervention_note TEXT,
  root_cause TEXT,
  duration_minutes INTEGER,
  solution_photo_data TEXT,
  created_by INTEGER NOT NULL,
  assigned_at TEXT,
  started_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (fault_id) REFERENCES faults(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_machines_line ON machines(line);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_criticality ON machines(criticality);
CREATE INDEX IF NOT EXISTS idx_records_machine ON maintenance_records(machine_id);
CREATE INDEX IF NOT EXISTS idx_records_type ON maintenance_records(type);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON maintenance_records(created_at);
CREATE INDEX IF NOT EXISTS idx_faults_machine ON faults(machine_id);
CREATE INDEX IF NOT EXISTS idx_faults_status ON faults(status);
CREATE INDEX IF NOT EXISTS idx_faults_urgency ON faults(urgency);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
`;
