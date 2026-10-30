import {isDeepStrictEqual} from 'node:util';
export class FakeDB {
 constructor(seed={}){this.rows=new Map(Object.entries(seed).map(([p,d])=>[p,{data:structuredClone(d),v:1}]));this.clock=2;}
 doc(path){return new Ref(this,path);}
 collection(path){return new Query(this,path);}
 collectionGroup(name){return new Query(this,name,true);}
 snap(path){const row=this.rows.get(path);return {id:path.split('/').at(-1),ref:this.doc(path),exists:!!row,data:()=>row?structuredClone(row.data):undefined,updateTime:row?{seconds:row.v,nanoseconds:0}:undefined};}
 async getAll(...refs){return refs.map(r=>this.snap(r.path));}
 apply(type,ref,data){if(type==='delete'){this.rows.delete(ref.path);return;}const old=this.rows.get(ref.path);if(type==='create'&&old)throw Error('already exists');if(type==='update'&&!old)throw Error('missing document');const out=type==='set'||type==='create'?{}:structuredClone(old.data);
  for(const[k,v]of Object.entries(data)){const parts=k.split('.');let dest=out;for(const part of parts.slice(0,-1))dest=dest[part]||=( {} );const name=parts.at(-1);if(v?.constructor?.name==='DeleteTransform')delete dest[name];else dest[name]=structuredClone(v);}
  this.rows.set(ref.path,{data:out,v:this.clock++});
 }
 async runTransaction(fn){const writes=[],reads=new Map();let writing=false;
  const read=async target=>{if(writing)throw Error('transaction read after write');if(target instanceof Query){const result=await target.get();for(const s of result.docs)reads.set(s.ref.path,this.rows.get(s.ref.path)?.v);return result;}reads.set(target.path,this.rows.get(target.path)?.v);return this.snap(target.path);};
  const tx={get:read,getAll:async(...refs)=>Promise.all(refs.map(read)),create:(r,d)=>{writing=true;writes.push(['create',r,d]);},update:(r,d)=>{writing=true;writes.push(['update',r,d]);},set:(r,d)=>{writing=true;writes.push(['set',r,d]);},delete:r=>{writing=true;writes.push(['delete',r]);}};
  const result=await fn(tx);for(const[p,v]of reads)if(this.rows.get(p)?.v!==v)throw Error('transaction precondition changed');for(const w of writes)this.apply(...w);return result;
 }
}
class Ref {
 constructor(db,path){this.firestore=db;this.db=db;this.path=path;this.id=path.split('/').at(-1);}
 get(){return Promise.resolve(this.db.snap(this.path));}
 collection(name){return new Query(this.db,this.path+'/'+name);}
 update(data){this.db.apply('update',this,data);return Promise.resolve();}
 set(data,options){if(options?.merge){const old=this.db.rows.get(this.path)?.data||{};this.db.apply('set',this,{...old,...data});}else this.db.apply('set',this,data);return Promise.resolve();}
}
class Query {
 constructor(db,path,group=false,options={}){Object.assign(this,{db,path,group,options});}
 with(options){return new Query(this.db,this.path,this.group,{...this.options,...options});}
 limit(n){return this.with({limit:n});}orderBy(){return this;}startAfter(id){return this.with({after:typeof id==='string'?id:id.id});}
 where(field,op,value){return this.with({where:[field,op,value]});}
 doc(id){return this.db.doc(this.path+'/'+id);}
 async get(){let paths=[...this.db.rows.keys()].filter(p=>this.group?p.split('/').at(-2)===this.path:p.startsWith(this.path+'/')&&p.slice(this.path.length+1).indexOf('/')===-1).sort();
  if(this.options.after)paths=paths.filter(p=>p.split('/').at(-1)>this.options.after);
  if(this.options.where){const [field,op,value]=this.options.where;paths=paths.filter(p=>{const data=this.db.rows.get(p).data,x=field.split('.').reduce((o,k)=>o?.[k],data);return op==='array-contains'?x?.includes(value):op==='=='?isDeepStrictEqual(x,value):op==='<='?x<=value:op==='>='?x>=value:false;});}
  const docs=paths.slice(0,this.options.limit??Infinity).map(p=>this.db.snap(p));return {docs,empty:!docs.length,size:docs.length};
 }
}
export class FakeBucket {
 constructor(files={}){this.files=new Map(Object.entries(files));this.saved=0;this.deleted=0;this.onSave=null;}
 file(path){const b=this;return {
  getMetadata:async()=>{const f=b.files.get(path);if(!f)throw Object.assign(Error('missing'),{code:404});return [{size:String(f.bytes.length),generation:f.generation||'1',metadata:f.metadata}];},
  download:async()=>[b.files.get(path).bytes],
  save:async(bytes,options)=>{if(b.files.has(path)&&options.preconditionOpts?.ifGenerationMatch===0)throw Object.assign(Error('exists'),{code:412});b.files.set(path,{bytes,metadata:options.metadata.metadata,generation:'1'});b.saved++;await b.onSave?.();},
  delete:async options=>{const f=b.files.get(path);if(!f)throw Object.assign(Error('missing'),{code:404});if(options.ifGenerationMatch!==(f.generation||'1'))throw Error('generation mismatch');b.files.delete(path);b.deleted++;}
 };}
}
