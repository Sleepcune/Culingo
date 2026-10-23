import {describe,it,expect} from 'vitest';
import {shouldHighlight} from '../src/core/words';
import type {WordIndex} from '../src/types';

const index:WordIndex={ranks:{analysis:9000,t:9000,a:9000,i:9000},forms:{analyses:'analysis'}};

describe('Zotero word highlighting safeguards',()=>{
 it('ignores single-letter formula variables while preserving a and i',()=>{
  expect(shouldHighlight('t',index,{},5000)).toBe(false);
  expect(shouldHighlight('x',index,{x:'learning'},5000)).toBe(false);
  expect(shouldHighlight('a',index,{},5000)).toBe(true);
  expect(shouldHighlight('I',index,{},5000)).toBe(true);
 });
 it('always lets mastered status win over rank and form matching',()=>{
  expect(shouldHighlight('t',index,{t:'mastered'},5000)).toBe(false);
  expect(shouldHighlight('analyses',index,{analysis:'mastered'},5000)).toBe(false);
 });
});
