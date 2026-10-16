// In-memory test database only. No credentials or network.
import assert from 'node:assert/strict';
export class Database{
 values=new Map();sequence=100;writes=[];afterClaim;
 constructor(entries){for(const [p,d]of entries)this.values.set(p,{data:d,version:++this.sequence});}
 doc(p){return{path:p,id:p.split('/').at(-1),get:async()=>this.snapshot(p)};}
 snapshot(p){const v=this.values.get(p),ref=this.doc(p);return{ref,id:ref.id,exists:!!v,updateTime:v?{seconds:0,nanoseconds:v.version,toMillis:()=>v.version,toDate:()=>new Date(v.version)}:undefined,data:()=>v?.data,get:k=>k.split('.').reduce((x,n)=>x?.[n],v?.data)};}
 collection(name){return this.query(name,false);}
 collectionGroup(name){return this.query(name,true);}
 query(name,group,filters=[],sort,limit=Infinity){const q={query:true,name,group,filters,sort,limit};q.where=(key,op,value)=>this.query(name,group,[...filters,[key,op,value]],sort,limit);q.orderBy=(key,direction)=>this.query(name,group,filters,[key,direction],limit);q.limit=n=>this.query(name,group,filters,sort,n);q.get=async()=>{
  let docs=[...this.values.keys()].filter(p=>group?p.split('/').at(-2)===name:p.split('/').slice(0,-1).join('/')===name).map(p=>this.snapshot(p));
  for(const [k,op,v]of filters)docs=docs.filter(d=>op==='=='?d.get(k)===v:op==='>='?d.get(k)>=v:d.get(k)<=v);
  if(sort)docs.sort((a,b)=>(a.get(sort[0])>b.get(sort[0])?1:-1)*(sort[1]==='desc'?-1:1));docs=docs.slice(0,limit);return{docs,size:docs.length};};return q;}
 async getAll(...refs){return refs.map(r=>this.snapshot(r.path));}
 async runTransaction(fn){const pending=[];const tx={get:async r=>r.query?r.get():this.snapshot(r.path),getAll:(...refs)=>this.getAll(...refs),set:(r,d)=>pending.push([r.path,d]),create:(r,d)=>{assert(!this.values.has(r.path));pending.push([r.path,d]);},update:(r,d)=>{assert(this.values.has(r.path));pending.push([r.path,{...this.values.get(r.path).data,...d}]);}};
  const out=await fn(tx);for(const [p,d]of pending){this.values.set(p,{data:d,version:++this.sequence});this.writes.push(p);}if(pending.some(([p,d])=>p.startsWith('festival_link_jobs/')&&d.status==='running')&&this.afterClaim){const hook=this.afterClaim;this.afterClaim=undefined;hook(this);}return out;
 }
}
