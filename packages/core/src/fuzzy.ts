/** Subsequence match score of `query` in `text`, case-insensitive; higher is better, -1 when it does not match. Substring hits rank above every subsequence. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const s = text.toLowerCase()
  const exact = s.indexOf(q)
  if (exact !== -1)
    return 2000 - Math.min(exact, 1000)
  let score = 0
  let at = -1
  for (const char of q) {
    const next = s.indexOf(char, at + 1)
    if (next === -1)
      return -1
    score += next === at + 1
      ? 2
      : 1
    at = next
  }
  return score
}
