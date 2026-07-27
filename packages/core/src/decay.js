const DAY_MS = 86_400_000;
const TIER_MULTIPLIER = { 0: 1, 1: 2, 2: 4 };

export function decayWindows(type, tier) {
  const base = type === 'stream'
    ? { activeDays: 7, deepAfterDays: 14 }
    : { activeDays: 60, deepAfterDays: 120 };
  const multiplier = TIER_MULTIPLIER[tier] ?? 1;
  return {
    activeDays: base.activeDays * multiplier,
    deepAfterDays: base.deepAfterDays * multiplier,
  };
}

export function bandForEntry(entry, asOf = new Date()) {
  if (entry.status === 'archived') return 'nebula';
  const tier = Number(entry.tier ?? entry.anchor ?? 0);
  if (tier === 3) return 'anchor';
  const { activeDays, deepAfterDays } = decayWindows(entry.type, tier);
  const days = (asOf.getTime() - new Date(entry.last_accessed).getTime()) / DAY_MS;
  if (days < activeDays) return tier === 1 ? 'glimmer' : tier === 2 ? 'beacon' : 'active';
  if (days <= deepAfterDays) return 'half_sunk';
  return 'deep';
}

export function isRecallEligible(entry, asOf = new Date()) {
  if (entry.status !== 'active' || entry.sealed || entry.type === 'rule') return false;
  if (entry.trigger_date && !entry.trigger_done && new Date(entry.trigger_date) > asOf) return false;
  return bandForEntry(entry, asOf) !== 'deep';
}
