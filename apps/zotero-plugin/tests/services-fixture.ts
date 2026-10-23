import initSqlJs from 'sql.js';
import { createHash } from 'node:crypto';
import type { SqlConnection,HostIO } from '../src/types';
export async function database():Promise<SqlConnection> {
  const SQL=await initSqlJs();const db=new SQL.Database();
  return {queryAsync:async(sql,params=[])=>{const statement=db.prepare(sql);try{statement.bind(params as any);const rows:any[]=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}},executeTransaction:async(fn)=>{db.run('BEGIN');try{const value=await fn();db.run('COMMIT');return value;}catch(e){db.run('ROLLBACK');throw e;}},closeDatabase:async()=>db.close()};
}
export const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
export function mockIO(request:typeof fetch=fetch):HostIO {
  const index=JSON.stringify({ranks:{analysis:6000},forms:{analyses:'analysis'}});
  const chunk=JSON.stringify([{word:'analysis',phonetic:'əˈnæləsɪs',definition:'analysis',translation:'分析',pos:'n',rank:6000}]);
  const manifest=JSON.stringify({version:'fixture',count:1,indexSha256:hash(index),chunks:[{file:'chunk-000.json',count:1,sha256:hash(chunk)}]});
  let secret='';return {readAsset:async(path)=>path.endsWith('manifest.json')?manifest:path.endsWith('index.json')?index:chunk,digest:async(t)=>hash(t),getSecret:async()=>secret,setSecret:async(v)=>{secret=v;},fetch:request};
}
