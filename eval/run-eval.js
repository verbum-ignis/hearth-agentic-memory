import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createPool } from '../packages/db/src/pool.js';
import { recallByEmbedding } from '../packages/recall/src/recall.js';
import { createJinaProvider } from '../apps/worker/src/providers/jina.js';
import { calibrateThreshold, percentile, scoreEvalCases } from './lib/scoring.js';

function parseArgs(args) {
  const options = { command: args[0] };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    const value = args[index + 1];
    if (!value || value.startsWith('--')) options[name] = true;
    else {
      options[name] = value;
      index += 1;
    }
  }
  return options;
}

async function loadJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function saveJson(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function selectCases(document, split = 'all') {
  if (split === 'all') return document.queries;
  if (!['train', 'val', 'test'].includes(split)) throw new Error(`Invalid split: ${split}`);
  return document.queries.filter((item) => item.split === split);
}

async function collect(options) {
  const evalDocument = await loadJson(options.eval ?? 'eval/hearth-eval-v1.json');
  const dataDocument = await loadJson(options.data ?? 'data/demo-data-v1.json');
  const output = options.output ?? 'eval/results/jina-raw.json';
  const split = options.split ?? 'all';
  const cases = selectCases(evalDocument, split);
  const provider = createJinaProvider();
  const pool = createPool({ applicationName: 'hearth-eval-collect', max: 2 });
  const results = {};

  try {
    for (const [index, item] of cases.entries()) {
      const started = performance.now();
      const embedding = await provider.embedQuery(item.query);
      const candidates = await recallByEmbedding(pool, embedding, {
        scopeId: options.scope ?? 'demo_public',
        asOf: new Date(dataDocument.band_as_of),
        excludeIds: item.exclude_ids ?? [],
        threshold: -1,
        topK: 20,
        oversample: 20,
      });
      results[item.id] = {
        durationMs: Number((performance.now() - started).toFixed(3)),
        candidates: candidates.map(({ id, score }) => ({ id, score })),
      };
      process.stdout.write(`[${index + 1}/${cases.length}] ${item.id} ${results[item.id].durationMs}ms\n`);
    }
  } finally {
    await pool.end();
  }

  await saveJson(output, {
    schemaVersion: 'hearth-eval-raw-v1',
    evalVersion: evalDocument.version,
    dataset: evalDocument.dataset,
    split,
    provider: provider.name,
    model: provider.model,
    embeddingSpecVersion: provider.specVersion,
    collectedAt: new Date().toISOString(),
    results,
  });
  process.stdout.write(`Saved raw results to ${resolve(output)}\n`);
}

function scoreGroup(cases, candidatesById, threshold, durations) {
  return {
    ...scoreEvalCases(cases, candidatesById, { threshold }),
    queryCount: cases.length,
    p95Ms: percentile(cases.map((item) => durations[item.id]).filter(Number.isFinite), 0.95),
  };
}

async function score(options) {
  const evalDocument = await loadJson(options.eval ?? 'eval/hearth-eval-v1.json');
  const raw = await loadJson(options.input ?? 'eval/results/jina-raw.json');
  if (raw.evalVersion !== evalDocument.version) {
    throw new Error(`Eval version mismatch: raw=${raw.evalVersion}, current=${evalDocument.version}`);
  }
  const split = options.split ?? 'train';
  if (options.calibrate && split !== 'train') {
    throw new Error('Threshold calibration is restricted to the train split');
  }
  const cases = selectCases(evalDocument, split);
  const candidatesById = Object.fromEntries(Object.entries(raw.results).map(([id, item]) => [id, item.candidates]));
  const durations = Object.fromEntries(Object.entries(raw.results).map(([id, item]) => [id, item.durationMs]));
  const missing = cases.filter((item) => !raw.results[item.id]).map((item) => item.id);
  if (missing.length) throw new Error(`Raw results missing ${missing.length} cases: ${missing.join(', ')}`);

  const threshold = options.calibrate
    ? calibrateThreshold(cases, candidatesById).threshold
    : Number(options.threshold);
  if (!Number.isFinite(threshold)) throw new Error('Provide --threshold NUMBER or --calibrate');

  const groups = {
    en: cases.filter((item) => item.group === 'en'),
    zh: cases.filter((item) => item.group === 'zh'),
    cross: cases.filter((item) => item.group === 'cross'),
    combined: cases,
  };
  const report = {
    schemaVersion: 'hearth-eval-report-v1',
    evalVersion: evalDocument.version,
    rawCollectedAt: raw.collectedAt,
    split,
    threshold,
    provider: raw.provider,
    model: raw.model,
    groups: Object.fromEntries(Object.entries(groups).map(([name, items]) => [
      name,
      scoreGroup(items, candidatesById, threshold, durations),
    ])),
  };
  if (options.output) await saveJson(options.output, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const options = parseArgs(process.argv.slice(2));
if (options.command === 'collect') await collect(options);
else if (options.command === 'score') await score(options);
else throw new Error('Usage: node eval/run-eval.js <collect|score> [options]');
