export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'technician', 'operator')),
  initials TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spare_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bearing', 'belt_sprocket', 'sensor_automation', 'hydraulic_pneumatic', 'electrical', 'consumable')),
  compatible_machine TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('piece', 'meter', 'liter', 'set')),
  current_stock REAL NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  location TEXT NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS maintenance_runtime_readings (
  machine_id INTEGER PRIMARY KEY,
  runtime_hours REAL NOT NULL CHECK (runtime_hours >= 0),
  reported_at TEXT NOT NULL,
  reported_by INTEGER,
  FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS maintenance_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  machine_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'working_hours')),
  assigned_to INTEGER,
  next_due_date TEXT NOT NULL,
  next_due_runtime_hours REAL,
  interval_hours REAL,
  last_completed_at TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS maintenance_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  measurement_label TEXT,
  FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  UNIQUE (plan_id, position)
);

CREATE TABLE IF NOT EXISTS maintenance_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  plan_id INTEGER NOT NULL,
  completed_by INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  notes TEXT,
  runtime_hours REAL,
  next_due_date TEXT NOT NULL,
  next_due_runtime_hours REAL,
  FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS maintenance_occurrence_keys (
  plan_id INTEGER NOT NULL,
  occurrence_key TEXT NOT NULL,
  execution_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, occurrence_key),
  FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES maintenance_executions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_execution_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  checklist_item_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed = 1),
  measurement_value REAL,
  note TEXT,
  FOREIGN KEY (execution_id) REFERENCES maintenance_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (checklist_item_id) REFERENCES maintenance_checklist_items(id) ON DELETE RESTRICT,
  UNIQUE (execution_id, checklist_item_id)
);

CREATE TABLE IF NOT EXISTS stock_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL,
  work_order_id INTEGER,
  preventive_plan_id INTEGER,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  returned_at TEXT,
  returned_by INTEGER,
  returned_quantity REAL,
  CHECK (
    (work_order_id IS NOT NULL AND preventive_plan_id IS NULL)
    OR (work_order_id IS NULL AND preventive_plan_id IS NOT NULL)
  ),
  FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (preventive_plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (returned_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER,
  part_code TEXT NOT NULL,
  part_name TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'return')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  user_id INTEGER NOT NULL,
  work_order_id INTEGER,
  preventive_plan_id INTEGER,
  usage_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (preventive_plan_id) REFERENCES maintenance_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (usage_id) REFERENCES stock_usages(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_usages_active_work_order_part
  ON stock_usages(part_id, work_order_id) WHERE work_order_id IS NOT NULL AND returned_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_usages_active_preventive_part
  ON stock_usages(part_id, preventive_plan_id) WHERE preventive_plan_id IS NOT NULL AND returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_spare_parts_category ON spare_parts(category);
CREATE INDEX IF NOT EXISTS idx_stock_usages_part ON stock_usages(part_id);
CREATE INDEX IF NOT EXISTS idx_stock_usages_work_order ON stock_usages(work_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_usages_preventive_plan ON stock_usages(preventive_plan_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_part ON stock_movements(part_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
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
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_machine ON maintenance_plans(machine_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_assigned_to ON maintenance_plans(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_due_date ON maintenance_plans(next_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_checklist_plan ON maintenance_checklist_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_executions_plan ON maintenance_executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_executions_completed_at ON maintenance_executions(completed_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_execution_items_execution ON maintenance_execution_items(execution_id);
CREATE INDEX IF NOT EXISTS idx_faults_machine_created_at ON faults(machine_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_faults_category ON faults(category);
CREATE INDEX IF NOT EXISTS idx_work_orders_closed ON work_orders(closed_at, id) WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_stock_usages_active_work_order ON stock_usages(work_order_id) WHERE returned_at IS NULL;
`;
