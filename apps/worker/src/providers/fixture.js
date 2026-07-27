import {
  EMBEDDING_SPEC_VERSION,
  canonicalEmbeddingText,
  fixtureEmbedding,
  vectorLiteral,
} from '../../../../packages/core/src/embedding.js';

export const fixtureProvider = {
  name: 'fixture',
  model: 'fixture-sha256-v1',
  specVersion: EMBEDDING_SPEC_VERSION,
  async embed(entry) {
    return vectorLiteral(fixtureEmbedding(canonicalEmbeddingText(entry)));
  },
};
