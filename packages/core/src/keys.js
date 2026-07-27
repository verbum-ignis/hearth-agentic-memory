const HAN = /\p{Script=Han}/u;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

export function normalizeForKeyMatch(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function isWordChar(char) {
  return Boolean(char && WORD_CHAR.test(char));
}

function phraseAtWordBoundary(haystack, needle) {
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return false;
    const before = index === 0 ? '' : haystack[index - 1];
    const afterIndex = index + needle.length;
    const after = afterIndex >= haystack.length ? '' : haystack[afterIndex];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = index + 1;
  }
  return false;
}

export function keyMatchesInput(input, key) {
  const normalizedInput = normalizeForKeyMatch(input);
  const normalizedKey = normalizeForKeyMatch(key);
  if (!normalizedInput || !normalizedKey) return false;
  if (HAN.test(normalizedKey)) return normalizedInput.includes(normalizedKey);
  return phraseAtWordBoundary(normalizedInput, normalizedKey);
}

export function matchingKeys(input, keys) {
  if (!Array.isArray(keys)) return [];
  return keys.filter((key) => typeof key === 'string' && keyMatchesInput(input, key));
}
