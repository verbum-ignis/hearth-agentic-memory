function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function scoreEvalCases(cases, candidatesById, { threshold, topK = 3 } = {}) {
  if (!Number.isFinite(threshold)) throw new TypeError('threshold must be finite');
  const retrieval = [];
  const noHit = [];
  const leakage = [];

  for (const item of cases) {
    const raw = candidatesById[item.id] ?? [];
    const returned = raw.filter((candidate) => candidate.score >= threshold).slice(0, topK);
    const ids = returned.map((candidate) => candidate.id);
    const forbiddenHits = ids.filter((id) => item.forbidden.includes(id));
    const result = { id: item.id, ids, forbiddenHits };
    leakage.push(result);

    if (item.scored !== 'retrieval') continue;
    if (item.expected.length === 0) {
      noHit.push({ ...result, correct: ids.length === 0 });
      continue;
    }

    const rankIndex = ids.findIndex((id) => item.expected.includes(id));
    retrieval.push({
      ...result,
      rank: rankIndex < 0 ? null : rankIndex + 1,
      hit1: rankIndex === 0,
      hit3: rankIndex >= 0 && rankIndex < 3,
      reciprocalRank: rankIndex < 0 ? 0 : 1 / (rankIndex + 1),
    });
  }

  const forbiddenViolations = leakage.filter((item) => item.forbiddenHits.length > 0);
  return {
    threshold,
    retrievalCount: retrieval.length,
    noHitCount: noHit.length,
    leakageProbeCount: cases.filter((item) => item.scored === 'leakage_only').length,
    hit1: average(retrieval.map((item) => Number(item.hit1))),
    hit3: average(retrieval.map((item) => Number(item.hit3))),
    mrr: average(retrieval.map((item) => item.reciprocalRank)),
    noHitAccuracy: average(noHit.map((item) => Number(item.correct))),
    forbiddenViolationCount: forbiddenViolations.length,
    failures: {
      retrieval: retrieval.filter((item) => !item.hit3),
      noHit: noHit.filter((item) => !item.correct),
      forbidden: forbiddenViolations,
    },
  };
}

export function calibrateThreshold(cases, candidatesById, {
  topK = 3,
  minimumNoHitAccuracy = 0.9,
} = {}) {
  const observed = cases.flatMap((item) => (candidatesById[item.id] ?? []).map((candidate) => candidate.score));
  const epsilon = 1e-9;
  const thresholds = [...new Set([
    0,
    1,
    ...observed,
    ...observed.map((score) => Math.min(1, score + epsilon)),
  ].filter(Number.isFinite))].sort((a, b) => a - b);

  const reports = thresholds.map((threshold) => scoreEvalCases(cases, candidatesById, { threshold, topK }));
  const viable = reports.filter((report) => (
    report.forbiddenViolationCount === 0
    && (report.noHitAccuracy === null || report.noHitAccuracy >= minimumNoHitAccuracy)
  ));
  if (!viable.length) throw new Error('No threshold satisfies leakage and no-hit constraints');

  viable.sort((a, b) => (
    (b.hit3 ?? -1) - (a.hit3 ?? -1)
    || (b.mrr ?? -1) - (a.mrr ?? -1)
    || (b.hit1 ?? -1) - (a.hit1 ?? -1)
    || a.threshold - b.threshold
  ));
  return viable[0];
}

export function percentile(values, percentileValue) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}
