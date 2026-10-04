import {describe,it,expect} from 'vitest';
import {managerWindowFeatures} from '../src/host/window';

describe('learning-center window sizing',()=>{
 it('uses a compact high-DPI-safe default on a normal work area',()=>{
  expect(managerWindowFeatures({availWidth:1920,availHeight:1080})).toContain('width=900,height=600');
 });
 it('shrinks to fit a small work area while keeping usable minimums',()=>{
  expect(managerWindowFeatures({availWidth:760,availHeight:500})).toContain('width=720,height=420');
 });
});
