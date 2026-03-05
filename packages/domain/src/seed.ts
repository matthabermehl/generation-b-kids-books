export function hash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) & 0x7fffffff;
}

export function pageSeed(bookId: string, pageIndex: number, version = "v1"): number {
  return hash32(`${bookId}:${pageIndex}:${version}`);
}
