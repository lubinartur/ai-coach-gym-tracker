/**
 * Trims surrounding whitespace, then shortens the string to at most `maxLength` characters,
 * appending a Unicode ellipsis (…) if truncated. Matches the historical AI Coach `cap` helpers.
 */
export function cap(text: string, maxLength: number): string {
  const t = text.trim();
  if (t.length <= maxLength) return t;
  return `${t.slice(0, maxLength - 1).trimEnd()}…`;
}
