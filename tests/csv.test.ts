import { describe,it,expect } from 'vitest';
import { parseCsv } from '../src/core/csv';
describe('strict CSV import',()=>{
  it('rejects characters following a closed quoted field',()=>expect(()=>parseCsv('word,meaning\ncurious,"hello"oops')).toThrow('CSV'));
  it('supports escaped quotes, BOM, empty cells and CRLF',()=>expect(parseCsv('\uFEFFword,meaning,url\r\ncurious,"a ""quoted"" word",\r\n')).toEqual([['word','meaning','url'],['curious','a "quoted" word','']]));
});
