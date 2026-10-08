import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const databaseDir = resolve('data/postgres');
const pg = new EmbeddedPostgres({ databaseDir, user: 'leadfactory', password: process.env.POSTGRES_PASSWORD || 'leadfactory_local', port: Number(process.env.POSTGRES_PORT || 5432), persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8','--locale=C'], postgresFlags: ['-c','listen_addresses=127.0.0.1'] });
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='leadfactory'")).rowCount) await client.query('CREATE DATABASE leadfactory');
await client.end();
console.log('LeadFactory PostgreSQL ready on 127.0.0.1:' + (process.env.POSTGRES_PORT || 5432));
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await pg.stop(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
