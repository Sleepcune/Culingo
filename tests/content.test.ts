// @vitest-environment jsdom
import { beforeEach,describe,it,expect } from 'vitest';
import { extractBlock,rangeFor,tokens,sentenceAt } from '../src/content/text';
beforeEach(()=>{document.body.innerHTML='<p id="article">A <em>resilient</em> system works. Keep <b>learn</b>ing!</p><pre>resilient</pre><div><p>Nested text.</p>Direct words.</div>';});
describe('non-destructive reading text',()=>{
  it('extracts inline text while keeping original markup unchanged',()=>{const p=document.querySelector('p')!;const original=p.innerHTML;const block=extractBlock(p);expect(block.text).toBe('A resilient system works. Keep learning!');const token=tokens(block.text).find(t=>t.word==='learning')!;expect(rangeFor(block.parts,token.start,token.end)?.toString()).toBe('learning');expect(p.innerHTML).toBe(original);});
  it('does not process nested paragraphs twice or editable code',()=>{expect(extractBlock(document.querySelector('div')!).text).toBe('Direct words.');const p=document.querySelector('p')!;p.setAttribute('contenteditable','true');expect(extractBlock(p).text).toBe('');});
  it('captures the sentence of the selected occurrence',()=>{expect(sentenceAt('One word. A resilient system! Last line.',15)).toBe('A resilient system!');});
});
