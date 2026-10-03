export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false; let closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if(closed&&c!==','&&c!=='\r'&&c!=='\n')throw new Error('CSV 引号后存在无效字符。');
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (!quoted && value !== '') throw new Error('CSV 引号格式错误。');
      else {if(quoted)closed=true;quoted = !quoted;}
    } else if (!quoted && c === ',') { row.push(value); value = ''; closed=false; }
    else if (!quoted && (c === '\r' || c === '\n')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ''; closed=false; }
    else value += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  row.push(value); if (row.some(Boolean)) rows.push(row);
  return rows;
}
