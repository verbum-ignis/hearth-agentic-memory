import { claimNext, completeClaim, failClaim } from './repository.js';

export async function processOne(pool, provider, options = {}) {
  const job = await claimNext(pool, options);
  if (!job) return { status: 'idle' };
  try {
    const embedding = await provider.embed(job);
    return completeClaim(pool, job, {
      embedding,
      model: provider.model,
      specVersion: provider.specVersion,
      now: options.now ?? new Date(),
    });
  } catch (error) {
    return failClaim(pool, job, error, options);
  }
}
