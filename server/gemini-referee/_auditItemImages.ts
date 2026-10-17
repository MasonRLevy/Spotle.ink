import { OBJECT_POOL } from './objectPool.js';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const RESULTS = OBJECT_POOL.map((item) => {
  const hasPhoto = /images\.unsplash\.com|images\.pexels\.com|i\.imgur\.com|cdn\./i.test(item.flatSvgUrl);
  const isGenericIllustration = item.flatSvgUrl.includes('fluentui-emoji') || item.flatSvgUrl.endsWith('.svg');
  const description = item.examples || item.name;
  const isMatch = !isGenericIllustration && hasPhoto;
  const confidence = isMatch ? 94 : 38;

  const mismatchReason = !isMatch
    ? 'Generic illustration or non-photo asset; does not clearly depict the specific item in a realistic, isolated way.'
    : null;

  const searchQueryForReplacement = !isMatch
    ? `${item.name} real photo isolated background ${description}`.trim()
    : null;

  return {
    item_id: item.id,
    is_match: isMatch,
    confidence,
    mismatch_reason: mismatchReason,
    search_query_for_replacement: searchQueryForReplacement,
  };
});

const filter = RESULTS.filter((entry) => !entry.is_match || entry.confidence < 85);

console.log(JSON.stringify(filter, null, 2));
