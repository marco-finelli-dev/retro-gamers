// One logical survey shared by the published IT/EN Community Survey documents.
export const HOME_SURVEY_KEY = 'home-amiga-platformer-2026';

// Largest-remainder rounding: editorial order breaks ties; non-zero totals sum to 100.
export function surveyPercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map(count => count * 100 / total);
  const rounded = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remaining; i++) rounded[order[i].index]++;
  return rounded;
}
