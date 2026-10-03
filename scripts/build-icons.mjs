import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const dir=new URL('../public/icon/',import.meta.url);await mkdir(dir,{recursive:true});
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
function chunk(name,data){const n=Buffer.from(name),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([n,data])));return Buffer.concat([size,n,data,check]);}
for(const size of [16,32,48,128]){
  const bytes=Buffer.alloc(size*(1+4*size));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size;const radius=.21;
    const dx=Math.max(radius-u,0,u-(1-radius)),dy=Math.max(radius-v,0,v-(1-radius));const visible=dx*dx+dy*dy<=radius*radius;
    const r=Math.hypot(u-.49,v-.5);const c=r>.19&&r<.30&&!(u>.52&&v>.37&&v<.63);
    const leaf=(u>.64&&u<.78&&v>.25&&v<.4&&Math.abs((u-.71)+(v-.325))<.085);
    const color=c||leaf?[236,248,224]:[25,91,76];const off=y*(1+4*size)+1+x*4;
    bytes[off]=color[0];bytes[off+1]=color[1];bytes[off+2]=color[2];bytes[off+3]=visible?255:0;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  await writeFile(new URL(`${size}.png`,dir),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]));
}
console.log('CuLingo icons generated.');
