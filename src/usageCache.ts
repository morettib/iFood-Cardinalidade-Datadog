import {request} from './api';
import type {Evidence} from './cardinality';
export type DashboardSnapshot={revision?:string;reference?:Evidence['references'][number];checkedAt:string};
export type UsageSnapshot={schema:1;metric:string;tags:string[];savedAt:string;evidence:Evidence[];dashboards:Record<string,DashboardSnapshot>;notebooks?:Record<string,DashboardSnapshot>};
type Manifest=Omit<UsageSnapshot,'dashboards'|'notebooks'>&{chunks:string[];notebookChunks?:string[];history:{savedAt:string;evidence:Evidence[]}[]};
const prefix='/kvstore/usage/v1/';
export const canonicalUsageTags=(tags:string[])=>[...new Set(tags)].sort();
export async function usageKey(metric:string,tags:string[]){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([metric,canonicalUsageTags(tags)])));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function read(key:string,signal:AbortSignal){
 const response=await fetch(window.CRIBL_API_URL!.replace(/\/$/,'')+prefix+key,{signal});
 if(response.status===404)return undefined;
 if(!response.ok)throw Error(`Não foi possível ler o histórico (HTTP ${response.status}).`);
 return response.json();
}
function validEvidence(value:unknown):value is Evidence[]{return Array.isArray(value)&&[3,6].includes(value.length)&&new Set(value.map(e=>e.kind)).size===value.length&&value.every(e=>['queries','monitors','dashboards','notebooks','slos','configuration'].includes(e.kind)&&typeof e.complete==='boolean'&&Number.isSafeInteger(e.checked)&&Array.isArray(e.references)&&e.references.every((r:Evidence['references'][number])=>typeof r.id==='string'&&typeof r.label==='string'&&Array.isArray(r.tags)&&r.tags.every(t=>typeof t==='string')));}
export async function loadUsage(metric:string,tags:string[],signal:AbortSignal,details=false):Promise<(UsageSnapshot&{history:Manifest['history']})|undefined>{
 if(!window.CRIBL_API_URL)return undefined;
 const value=await read(await usageKey(metric,tags)+'/latest',signal) as Manifest|undefined;if(!value)return undefined;
 if(value.schema!==1||value.metric!==metric||JSON.stringify(value.tags)!==JSON.stringify(canonicalUsageTags(tags))||!Number.isFinite(Date.parse(value.savedAt))||!validEvidence(value.evidence)||!Array.isArray(value.chunks)||value.chunks.some(k=>typeof k!=='string'||!/^snapshots\/[a-zA-Z0-9-]+\/\d+$/.test(k)))throw Error('Histórico incompatível ou inválido. Faça uma análise completa.');
 const dashboards:UsageSnapshot['dashboards']={},notebooks:UsageSnapshot['dashboards']={};
 if(value.notebookChunks!=null&&(!Array.isArray(value.notebookChunks)||value.notebookChunks.some(k=>typeof k!=='string'||!/^snapshots\/[a-zA-Z0-9-]+\/\d+$/.test(k))))throw Error('Histórico de notebooks inválido.');
 if(details)for(let start=0;start<value.chunks.length;start+=4){const parts=await Promise.all(value.chunks.slice(start,start+4).map(k=>read(k,signal)));for(const part of parts){if(!part||typeof part!=='object'||Array.isArray(part))throw Error('Histórico de definições incompleto.');for(const [id,entry]of Object.entries(part) as [string,DashboardSnapshot][]){if(!/^[a-zA-Z0-9-]+$/.test(id)||!entry||typeof entry.checkedAt!=='string'||entry.revision!=null&&typeof entry.revision!=='string')throw Error('Definição salva inválida.');if(entry.reference&&!validEvidence([{kind:'queries',complete:true,checked:1,references:[entry.reference]},{kind:'monitors',complete:true,checked:0,references:[]},{kind:'dashboards',complete:true,checked:0,references:[]}]))throw Error('Referência salva inválida.');dashboards[id]=entry;}}}
 if(details)for(const key of value.notebookChunks||[]){const part=await read(key,signal);if(!part||typeof part!=='object'||Array.isArray(part))throw Error('Histórico de notebooks incompleto.');for(const [id,entry]of Object.entries(part) as [string,DashboardSnapshot][]){if(!/^[1-9]\d*$/.test(id)||!entry||typeof entry.checkedAt!=='string'||!Number.isFinite(Date.parse(entry.checkedAt))||entry.revision!=null&&typeof entry.revision!=='string')throw Error('Notebook salvo inválido.');if(entry.reference&&!validEvidence([{kind:'queries',complete:true,checked:1,references:[entry.reference]},{kind:'monitors',complete:true,checked:0,references:[]},{kind:'dashboards',complete:true,checked:0,references:[]}]))throw Error('Referência de notebook inválida.');notebooks[id]=entry;}}
 return {...value,dashboards,notebooks,history:Array.isArray(value.history)?value.history:[]};
}
export async function saveUsage(snapshot:UsageSnapshot,signal:AbortSignal){
 const key=await usageKey(snapshot.metric,snapshot.tags),previous=await loadUsage(snapshot.metric,snapshot.tags,signal).catch(()=>undefined),id=crypto.randomUUID(),entries=Object.entries(snapshot.dashboards),chunks:string[]=[];
 const put=(key:string,value:unknown)=>request(prefix+key,signal,{method:'PUT',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(value)});
 for(let start=0;start<entries.length;start+=300){const key=`snapshots/${id}/${start/300}`;await put(key,Object.fromEntries(entries.slice(start,start+300)));chunks.push(key);}
 const notebookChunks:string[]=[],notebookEntries=Object.entries(snapshot.notebooks||{}),notebookId=crypto.randomUUID();
 for(let start=0;start<notebookEntries.length;start+=300){const key=`snapshots/${notebookId}/${start/300}`;await put(key,Object.fromEntries(notebookEntries.slice(start,start+300)));notebookChunks.push(key);}
 const {dashboards:_,notebooks:__,...summary}=snapshot;
 // Publish the manifest last; cancellation or partial writes never replace a usable result.
 await put(key+'/latest',{...summary,chunks,notebookChunks,history:[{savedAt:snapshot.savedAt,evidence:snapshot.evidence},...(previous?.history||[])].slice(0,10)} satisfies Manifest);
 await put('metrics/'+await usageKey(snapshot.metric,[])+'/latest',{schema:1,metric:snapshot.metric,tags:snapshot.tags});
}
export async function loadLatestUsage(metric:string,signal:AbortSignal){if(!window.CRIBL_API_URL)return undefined;const pointer=await read('metrics/'+await usageKey(metric,[])+'/latest',signal);if(!pointer)return undefined;if(pointer.schema!==1||pointer.metric!==metric||!Array.isArray(pointer.tags)||!pointer.tags.every((t:unknown)=>typeof t==='string'))throw Error('Índice de histórico inválido.');return loadUsage(metric,pointer.tags,signal);}
