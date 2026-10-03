import type { SqlConnection } from '../types';
const tables=['vocabulary','examples','cards','logs','dictionary','meta','cache'] as const;
export type Table=typeof tables[number];
/** JSON preserves stable application schema while SQLite owns atomicity and durability. */
export class Store {
  private tail=Promise.resolve();
  constructor(readonly db:SqlConnection){}
  async initialize() {
    await this.db.queryAsync('CREATE TABLE IF NOT EXISTS culingo_schema (version INTEGER NOT NULL)');
    const rows=await this.db.queryAsync('SELECT version FROM culingo_schema');
    if(rows.length&&rows[0].version!==1)throw new Error('CuLingo 数据库版本不兼容，请使用对应插件版本；原数据已保留。');
    await this.transaction(async()=>{
      for(const table of tables)await this.db.queryAsync(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`);
      if(!rows.length)await this.db.queryAsync('INSERT INTO culingo_schema (version) VALUES (1)');
    });
  }
  async get<T>(table:Table,id:string):Promise<T|undefined>{const rows=await this.db.queryAsync(`SELECT data FROM ${table} WHERE id=?`,[id]);return rows[0]?JSON.parse(rows[0].data):undefined;}
  async all<T>(table:Table):Promise<T[]>{return(await this.db.queryAsync(`SELECT data FROM ${table}`)).map(row=>JSON.parse(row.data));}
  async put(table:Table,id:string,value:unknown){await this.db.queryAsync(`INSERT OR REPLACE INTO ${table} (id,data) VALUES (?,?)`,[id,JSON.stringify(value)]);}
  async putMany(table:Table,rows:{id:string;value:unknown}[]){for(let offset=0;offset<rows.length;offset+=200){const batch=rows.slice(offset,offset+200);await this.db.queryAsync(`INSERT OR REPLACE INTO ${table} (id,data) VALUES ${batch.map(()=>'(?,?)').join(',')}`,batch.flatMap(row=>[row.id,JSON.stringify(row.value)]));}}
  async remove(table:Table,id:string){await this.db.queryAsync(`DELETE FROM ${table} WHERE id=?`,[id]);}
  async clear(table:Table){await this.db.queryAsync(`DELETE FROM ${table}`);}
  transaction<T>(fn:()=>Promise<T>):Promise<T>{const result=this.tail.then(()=>this.db.executeTransaction(fn));this.tail=result.then(()=>{},()=>{});return result;}
  async close(){await this.tail;await this.db.closeDatabase();}
}
