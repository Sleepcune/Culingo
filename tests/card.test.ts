// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../src/shared/client',()=>({rpc}));
import {ReadingCard} from '../src/content/card';

afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});

it('keeps the lookup card inside the viewport after async dictionary content grows and supports dragging',async()=>{
  vi.stubGlobal('innerWidth',800);vi.stubGlobal('innerHeight',600);vi.stubGlobal('crypto',{randomUUID:()=>`request-${Date.now()}`});
  rpc.mockResolvedValue({translation:'释义',phonetic:'fəʊ',pos:'n'});
  const card=new ReadingCard(()=>({theme:'system',apiConfigured:false} as any),()=>{},async()=>{});
  await card.show({text:'extraordinary',sentence:'An extraordinary sentence.',x:100,y:100});
  const panel=card.root.querySelector('.card') as HTMLElement;Object.defineProperty(panel,'offsetWidth',{configurable:true,value:340});Object.defineProperty(panel,'offsetHeight',{configurable:true,value:520});panel.getBoundingClientRect=()=>({left:parseFloat(panel.style.left)||0,top:parseFloat(panel.style.top)||0,width:340,height:520,right:(parseFloat(panel.style.left)||0)+340,bottom:(parseFloat(panel.style.top)||0)+520} as DOMRect);
  const top=panel.querySelector('.top')!;top.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:110,clientY:120}));window.dispatchEvent(new MouseEvent('pointermove',{clientX:180,clientY:190}));window.dispatchEvent(new MouseEvent('pointerup'));
  expect(parseFloat(panel.style.left)).toBe(170);expect(parseFloat(panel.style.top)).toBe(68);
  card.destroy();
});
