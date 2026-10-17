/** Saved read inventory, exact nanosecond versions, network and writes forbidden. */
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/artifacts/oct17-festival-corroboration-release/assembly/package.json',import.meta.url));
const {Timestamp}=require('firebase-admin/firestore');
export class FrozenDatabase {
 constructor(entries){this.entries=new Map(entries.filter(x=>x.exists!==false).map(x=>[x.path,structuredClone(x)]));this.writes=[];}
 revive(x){if(Array.isArray(x))return x.map(v=>this.revive(v));if(x&&typeof x==='object'){if(Number.isInteger(x._seconds))return new Timestamp(x._seconds,x._nanoseconds||0);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,this.revive(v)]));}return x;}
 doc(path){return{path,id:path.split('/').at(-1),get:async()=>this.snapshot(path)};}
 snapshot(path){const x=this.entries.get(path),data=this.revive(x?.data),ms=Date.parse(x?.updateTime||'2026-10-17T19:00:00Z'),v=x?.version||{seconds:Math.floor(ms/1000),nanoseconds:(ms%1000)*1e6};return{ref:this.doc(path),id:path.split('/').at(-1),exists:!!x,updateTime:x?new Timestamp(v.seconds,v.nanoseconds):undefined,data:()=>data,get:k=>k.split('.').reduce((o,n)=>o?.[n],data)};}
 collection(n){return this.query(n,false);}collectionGroup(n){return this.query(n,true);}
 query(n,group,filters=[],sort,limit=Infinity){return{where:(...a)=>this.query(n,group,[...filters,a],sort,limit),orderBy:(...a)=>this.query(n,group,filters,a,limit),limit:l=>this.query(n,group,filters,sort,l),get:async()=>{let docs=[...this.entries.keys()].filter(p=>group?p.split('/').at(-2)===n:p.split('/').slice(0,-1).join('/')===n).map(p=>this.snapshot(p));for(const[k,op,v]of filters)docs=docs.filter(d=>op==='=='?d.get(k)===v:op==='>='?d.get(k)>=v:d.get(k)<=v);if(sort)docs.sort((a,b)=>(a.get(sort[0])>b.get(sort[0])?1:-1)*(sort[1]==='desc'?-1:1));docs=docs.slice(0,limit);return{docs,size:docs.length};}};}
 async getAll(...refs){return refs.map(r=>this.snapshot(r.path));}
 async runTransaction(){throw Error('Offline writes forbidden');}
}
