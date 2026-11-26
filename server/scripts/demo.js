import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { closeDatabase, createDatabase, DEFAULT_DB_PATH } from '../src/db.js';
import { seedDemoData } from '../src/seed.js';

export async function runDemo(databasePath = process.env.CMMS_DB_PATH || DEFAULT_DB_PATH) {
  const database = await createDatabase(databasePath);
  try {
    const result = await seedDemoData(database);
    console.log(
      `Demo data reset: ${result.users} users, ${result.machines} machines, `
      + `${result.faults} faults, ${result.workOrders} work orders, `
      + `${result.preventivePlans} preventive plans and ${result.checklistItems} checklist items seeded in ${databasePath}`,
    );
    return result;
  } finally {
    await closeDatabase(database);
  }
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
