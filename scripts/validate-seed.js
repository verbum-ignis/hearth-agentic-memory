import { loadDemoData, validateDemoData } from './lib/demo-data.js';

const args = process.argv.slice(2);
const path = args.find((arg) => !arg.startsWith('--')) ?? 'data/demo-sample.json';
const allowPartial = args.includes('--allow-partial');
const document = await loadDemoData(path);
const result = validateDemoData(document, { allowPartial });

if (!result.ok) {
  for (const error of result.errors) process.stderr.write(`- ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${document.entries.length} entries against ${document.schema_version}.\n`);
}
