import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

import { SCHEMA_SQL } from './schema.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

/** The default database lives beside the server, outside the source tree. */
export const DEFAULT_DB_PATH = path.resolve(moduleDirectory, '../data/cmms.sqlite');

export function resolveDatabasePath(databasePath = process.env.CMMS_DB_PATH || DEFAULT_DB_PATH) {
  if (!databasePath || databasePath === ':memory:' || databasePath.startsWith('file:')) {
    return databasePath || ':memory:';
  }

  const absolutePath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

/** Open a sqlite3 connection. The promise resolves after sqlite has opened the file. */
export function openDatabase(databasePath = process.env.CMMS_DB_PATH || DEFAULT_DB_PATH) {
  const resolvedPath = resolveDatabasePath(databasePath);

  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(resolvedPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(database);
    });
  });
}

export function run(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

export function all(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

export function exec(database, sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const initializedDatabases = new WeakSet();

export async function initializeDatabase(database) {
  if (!database || typeof database.run !== 'function') {
    throw new TypeError('A sqlite3 database connection is required');
  }
  if (initializedDatabases.has(database)) return database;
  await exec(database, SCHEMA_SQL);
  initializedDatabases.add(database);
  return database;
}

export async function createDatabase(databasePath = process.env.CMMS_DB_PATH || DEFAULT_DB_PATH) {
  const database = await openDatabase(databasePath);
  try {
    await initializeDatabase(database);
    return database;
  } catch (error) {
    await closeDatabase(database).catch(() => {});
    throw error;
  }
}

export function closeDatabase(database) {
  if (!database || typeof database.close !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    database.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const transactionQueues = new WeakMap();

/**
 * Execute a unit of work in a transaction. Transactions on one connection are
 * queued so concurrent API writes cannot begin a second transaction early.
 */
export async function transaction(database, callback) {
  const previous = transactionQueues.get(database) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  transactionQueues.set(database, previous.then(() => gate));
  await previous;

  try {
    await run(database, 'BEGIN IMMEDIATE');
  } catch (error) {
    release();
    throw error;
  }

  try {
    const result = await callback();
    await run(database, 'COMMIT');
    return result;
  } catch (error) {
    await run(database, 'ROLLBACK').catch(() => {});
    throw error;
  } finally {
    release();
  }
}
