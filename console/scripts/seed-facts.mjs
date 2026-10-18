// Prints SQL that seeds fact_set version 1 (live) from kb/facts.json, the exact document production started from (key order
// matters: it is the order the model sees the facts in, and why the column is json, not jsonb). Does nothing if the table has rows.
//   node console/scripts/seed-facts.mjs | docker exec -i <postgres> psql -U <user> -d <db>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = JSON.stringify(JSON.parse(readFileSync(path.join(root, 'kb/facts.json'), 'utf8')));
if (json.includes('$seed$')) throw new Error('unexpected delimiter in document');
console.log(`insert into fact_set (status, doc, note, created_by, published_at, published_by)
select 'live', $seed$${json}$seed$::json, 'Seeded from kb/facts.json', 'seed', now(), 'seed'
where not exists (select 1 from fact_set);`);
