import { createApp } from './app.js';
import { closeDatabase, createDatabase, DEFAULT_DB_PATH } from './db.js';

const port = Number.parseInt(process.env.CMMS_PORT || '3006', 10);
const dbPath = process.env.CMMS_DB_PATH || DEFAULT_DB_PATH;
const database = await createDatabase(dbPath);
const app = createApp({ db: database });

const server = app.listen(Number.isInteger(port) && port > 0 ? port : 3006, () => {
  console.log(`CMMS API listening on port ${Number.isInteger(port) && port > 0 ? port : 3006}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down CMMS API`);
  server.close(async () => {
    await closeDatabase(database);
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
