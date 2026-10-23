import { Reader } from '../src/content/reader';
export default defineContentScript({matches:['https://*/*','http://*/*'],registration:'runtime',runAt:'document_idle',main(ctx){
  const guard=globalThis as typeof globalThis&{__culingoReader?:Reader};
  if(guard.__culingoReader)return;
  const reader=new Reader();guard.__culingoReader=reader;
  ctx.onInvalidated(()=>{reader.destroy();delete guard.__culingoReader;});
}});
