export function splitText(text: string): string[] {
  const result: string[] = []; let remaining = text;
  while (remaining.length > 2000) {
    const portion = remaining.slice(0, 2000);
    const boundaries = [...portion.matchAll(/[.!?。！？]\s*/g)];
    const last = boundaries.at(-1);
    let cut = last ? last.index! + last[0].length : 2000;
    if (cut < 800) cut = 2000;
    if (/[\uD800-\uDBFF]/.test(remaining[cut - 1] ?? '')) cut--;
    result.push(remaining.slice(0, cut)); remaining = remaining.slice(cut);
  }
  if (remaining) result.push(remaining);
  return result;
}
