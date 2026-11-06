export function codePointCount(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}
