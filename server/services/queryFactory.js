/**
 * Maps natural language prompts and genres into verified SQLite genre clusters.
 */
export function mapPromptToGenres(genre = '', prompt = '') {
  const g = `${genre} ${prompt}`.toLowerCase();
  const matched = new Set();
  if (g.includes('grunge')) matched.add('Grunge');
  if (g.includes('classic rock')) matched.add('Classic Rock');
  if (g.includes('punk')) matched.add('Punk');
  if (g.includes('rock') && !g.includes('classic rock')) matched.add('Rock');
  if (g.includes('synthpop') || g.includes('synth pop')) {
    matched.add('Electronic');
    matched.add('Pop');
  }
  if (g.includes('city pop') || g.includes('citypop')) matched.add('City Pop');
  if (g.includes('french house') || g.includes('french touch')) matched.add('French House');
  if (g.includes('motown')) matched.add('Motown');
  if (g.includes('soul') && !g.includes('motown')) matched.add('Soul');
  if (g.includes('funk')) matched.add('Funk');
  if (g.includes('disco')) matched.add('Disco');
  if (g.includes('hip hop') || g.includes('hiphop') || g.includes('rap')) matched.add('Hip Hop');
  if (g.includes('r&b') || g.includes('rnb')) matched.add('R&B');
  if (g.includes('edm') || g.includes('dance') || g.includes('electronic')) matched.add('Electronic');
  if (g.includes('k-pop') || g.includes('kpop')) matched.add('K-Pop');
  if (g.includes('reggae') || g.includes('ska')) matched.add('Reggae');
  if (g.includes('bossa nova')) matched.add('Bossa Nova');
  if (g.includes('latin')) matched.add('Latin');
  if (g.includes('pop') && !g.includes('city pop') && !g.includes('k-pop')) matched.add('Pop');
  if (g.includes('anime')) matched.add('Anime');
  if (g.includes('japanese') && !g.includes('anime')) matched.add('Japanese');
  return Array.from(matched);
}
