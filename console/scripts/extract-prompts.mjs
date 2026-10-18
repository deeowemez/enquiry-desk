// Writes server/prompts.generated.json from the live workflow export: the instructions each model stage is given, and which
// model runs it. The Prompts tab shows this snapshot (the console never calls n8n). `npm test` fails if the file is stale.
//   node scripts/extract-prompts.mjs            # write
//   node scripts/extract-prompts.mjs --check    # exit 1 if the committed file is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(readFileSync(path.resolve(here, '../../workflows/01-intake.mine.json'), 'utf8'));
const node = name => wf.nodes.find(n => n.name === name);

function literalText(code, constName) {
  const start = code.indexOf(`const ${constName} = [`);
  if (start < 0) throw new Error(`no ${constName} in node`);
  const m = /\]\.join\((['"])(.*?)\1\)/.exec(code.slice(start));          // joined with a newline or a space, depending on the stage
  if (!m) throw new Error(`no .join() after ${constName}`);
  const end = start + m.index + m[0].length;
  const src = code.slice(start + `const ${constName} = `.length, end);
  // A prompt can interpolate a value computed at run time (e.g. the missing detail). Show it as a visible placeholder.
  const sandbox = Object.create(null);
  for (let i = 0; i < 20; i++) {
    try { return vm.runInNewContext(src, sandbox, { timeout: 1000 }); }
    catch (e) {
      const m = /^(\w+) is not defined$/.exec(e.message);
      if (!m) throw e;
      sandbox[m[1]] = `\u2039${m[1]}\u203a`;
    }
  }
  throw new Error('too many runtime variables in ' + constName);
}

const config = Object.fromEntries(node('config').parameters.assignments.assignments.map(a => [a.name, a.value]));
const STAGES = [
  ['classify', 'Classify', 'build classify request', 'INSTRUCTIONS', 'Reads the enquiry and reports what it is (category, details, safety flags). Code decides the routing.'],
  ['draft', 'Draft', 'build draft request', 'RULES', 'Writes the reply, only from the facts it is given.'],
  ['verify', 'Verify', 'build verify request', 'RULES', 'A second model lists every claim in the reply and quotes the evidence for each.'],
  ['clarify', 'Clarify', 'build clarify request', 'RULES', 'Writes one question when a detail is missing.'],
];
const out = {
  source: 'workflows/01-intake.mine.json (live intake workflow export)',
  stages: STAGES.map(([stage, label, nodeName, constName, purpose]) => ({
    stage, label, purpose, node: nodeName,
    model: String(config[`${stage}_model`] ?? '').replace(/^(global|apac)\.amazon\./, '').replace(/-v1:0$/, ''),
    text: literalText(node(nodeName).parameters.jsCode, constName),
  })),
};
const json = JSON.stringify(out, null, 2) + '\n';
const target = path.resolve(here, '../server/prompts.generated.json');
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(target, 'utf8'); } catch { /* missing */ }
  if (cur !== json) { console.error('server/prompts.generated.json is out of date: run `npm run prompts`'); process.exit(1); }
} else { writeFileSync(target, json); console.log(`wrote ${target}`); }
