import {request,metrics,logs} from './api';
import type {Range,Row} from './domain';
export const METRICS_ROOT='/products/lakehouse_engine_metrics/engines/ifood_logs/datasets/metrics/';
export const SKETCH_SEARCH_ID='ifood_cardinality_v3_sketch_inventory';
export const SKETCH_QUERY='dataset="datadog_sketches"\n| summarize records=count(), first=min(_time), last=max(_time) by metric=tostring(sketch.metric)\n| where isnotempty(metric)\n| order by records desc\n| limit 5001';
export const SKETCH_SAVED_QUERY=SKETCH_QUERY+'\n| extend cacheVersion="ifood-cardinality-v3", cacheAt=now()';
export type MetricEntry={name:string;type:string;source:'metrics'|'sketch';series?:number;totalSeries?:number;records?:number;band?:string;lastSeen?:number;service?:string;team?:string};
export type Catalog={entries:MetricEntry[];checkedAt:string;building:boolean;notes:string[]};
export type LabelEntry={key:string;distinct?:number;values:{value:string;series?:number}[]};
export function validMetricName(name:string){return /^[a-zA-Z_:][a-zA-Z0-9_.:]{0,255}$/.test(name);}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function windowParams(range:Range){const start=Date.parse(range.start),end=Date.parse(range.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>7*86400000)throw Error('Escolha uma janela válida de até sete dias.');return new URLSearchParams({earliest_ms:String(start),latest_ms:String(end)});}
export function parseSummary(body:unknown):{entries:MetricEntry[];building:boolean}{
 const b=body as {rows?:Row[];building?:boolean};if(!Array.isArray(b?.rows)||typeof b.building!=='boolean')throw Error('Resumo de métricas incompatível.');
 const seen=new Set<string>();const entries=b.rows.map(r=>{if(typeof r.name!=='string'||!validMetricName(r.name)||seen.has(r.name)||!finite(r.seriesCount))throw Error('Contagem ou nome de métrica inválido.');seen.add(r.name);return {name:r.name,type:String(r.type||'unknown'),source:'metrics' as const,series:r.seriesCount,totalSeries:finite(r.totalSeriesCount)?r.totalSeriesCount:undefined,band:typeof r.cardBand==='string'?r.cardBand:undefined,lastSeen:finite(r.lastSeenMs)?r.lastSeenMs:undefined,service:typeof r.service==='string'?r.service:undefined,team:typeof r.team==='string'?r.team:undefined};});return {entries,building:b.building};
}
export function parseLabels(body:unknown):LabelEntry[]{
 const b=body as {labels?:Row[]};if(!Array.isArray(b?.labels))throw Error('Inventário de labels incompatível.');const seen=new Set<string>();
 return b.labels.map(r=>{if(typeof r.key!=='string'||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(r.key)||seen.has(r.key)||r.distinct!=null&&!finite(r.distinct)||!Array.isArray(r.topValues))throw Error('Label ou contagem inválida.');seen.add(r.key);return {key:r.key,distinct:finite(r.distinct)?r.distinct:undefined,values:r.topValues.map(v=>{if(typeof v==='string')return {value:v};const x=v as Row;if(typeof x.value!=='string')throw Error('Valor de label incompatível.');return {value:x.value,series:finite(x.seriesCount)?x.seriesCount:undefined};})};});
}
export async function readLabels(name:string,range:Range,signal:AbortSignal,key?:string){if(!validMetricName(name))throw Error('Nome de métrica inválido.');const params=windowParams(range);if(key)params.set('key',key);const labels=parseLabels(await (await request(METRICS_ROOT+'metrics/'+encodeURIComponent(name)+'/labels?'+params,signal)).json());if(!key&&labels.some(l=>l.distinct==null))throw Error('Inventário omitiu as contagens das labels.');return labels;}
export function parseSketchRows(rows:Row[],cached=false,now=Date.now()):MetricEntry[]{
 if(rows.length>5000)throw Error('Inventário de distribuições excede 5.000 métricas; cobertura incompleta.');
 const seen=new Set<string>();return rows.map(r=>{if(typeof r.metric!=='string'||!validMetricName(r.metric)||!finite(r.records)||seen.has(r.metric))throw Error('Inventário de distribuições inválido.');seen.add(r.metric);
 if(cached){const at=typeof r.cacheAt==='number'?r.cacheAt*1000:Date.parse(String(r.cacheAt));if(r.cacheVersion!=='ifood-cardinality-v3'||!Number.isFinite(at)||now-at< -60000||now-at>20*60000)throw Error('Saved search expirada ou de outra versão.');}
 return {name:r.metric,type:'distribution',source:'sketch',records:r.records,lastSeen:finite(r.last)?r.last*1000:undefined};});
}
export async function loadCatalog(range:Range,signal:AbortSignal,force=false):Promise<Catalog>{
 const params=windowParams(range),notes:string[]=[];const entries:MetricEntry[]=[];let building=false;
 const results=await Promise.allSettled([
  request(METRICS_ROOT+'metrics/summary?'+params,signal).then(r=>r.json()).then(parseSummary),
  request(METRICS_ROOT+'prom/api/v1/metadata',signal).then(r=>r.json()),
  (async()=>{const current=Math.abs(Date.now()-Date.parse(range.end))<60000&&Math.abs(Date.parse(range.end)-Date.parse(range.start)-3600000)<1000;
   if(!force&&current){try{const rows=await logs('dataset="$vt_results" jobName="'+SKETCH_SEARCH_ID+'"',{start:new Date(Date.now()-86400000).toISOString(),end:new Date().toISOString()},signal,1000);if(rows.length)return {rows:parseSketchRows(rows,true),cached:true};}catch(e){if(signal.aborted)throw e;}}
   return {rows:parseSketchRows(await logs(SKETCH_QUERY,range,signal,1000)),cached:false};})()
 ]);
 if(signal.aborted)throw signal.reason;
 const summary=results[0];if(summary.status==='fulfilled'){entries.push(...summary.value.entries);building=summary.value.building;}else notes.push('Resumo Search: '+String(summary.reason instanceof Error?summary.reason.message:summary.reason));
 const metadata=results[1];if(metadata.status==='fulfilled'){const b=metadata.value;if(b?.status!=='success'||!b.data||typeof b.data!=='object'||Array.isArray(b.data))notes.push('Inventário de nomes indisponível.');else{const known=new Set(entries.map(e=>e.name));for(const [name,defs]of Object.entries(b.data)){if(!validMetricName(name)||!Array.isArray(defs)){notes.push('Inventário de nomes parcial.');continue;}if(!known.has(name))entries.push({name,type:String(defs[0]?.type||'unknown'),source:'metrics'});}}}else notes.push('Inventário de nomes: '+String(metadata.reason instanceof Error?metadata.reason.message:metadata.reason));
 const sketches=results[2];if(sketches.status==='fulfilled'){entries.push(...sketches.value.rows);notes.push(sketches.value.cached?'Distribuições: saved search recente da última hora.':'Distribuições: consulta da janela selecionada.');}else notes.push('Distribuições: '+String(sketches.reason instanceof Error?sketches.reason.message:sketches.reason));
 if(!entries.length)throw Error(notes.join(' · ')||'Nenhuma métrica disponível.');
 return {entries,checkedAt:new Date().toISOString(),building,notes};
}
export function countQuery(name:string,range:Range,remove:string[]=[],scope?:{key:string;value:string}){
 if(!validMetricName(name)||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(name))throw Error('Nome não suportado pelo seletor Prometheus.');windowParams(range);
 if(remove.some(k=>!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(k)||['host','__name__','le','upper_bound'].includes(k)))throw Error('Dimensão protegida ou inválida.');
 if(scope&&!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(scope.key))throw Error('Escopo inválido.');
 const seconds=Math.ceil((Date.parse(range.end)-Date.parse(range.start))/1000);const selector=name+(scope?'{'+scope.key+'='+JSON.stringify(scope.value)+'}':'');const base='count_over_time('+selector+'['+seconds+'s])';
 return 'count('+(remove.length?'count without ('+[...new Set(remove)].sort().join(',')+') ('+base+')':base)+')';
}
export async function countSeries(name:string,range:Range,remove:string[],signal:AbortSignal,scope?:{key:string;value:string}){
 const result=await metrics(countQuery(name,range,remove,scope),range,signal,true);
 if(result.length===0)return 0;if(result.length!==1||!result[0].value)throw Error('Contagem de séries incompatível.');const count=Number(result[0].value[1]);if(!finite(count)||!Number.isInteger(count))throw Error('Contagem de séries inválida.');return count;
}
export function originalMetricQuery(name:string){
 if(!validMetricName(name))throw Error('Nome de métrica inválido.');
 const pattern='^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replaceAll('_','[._]')+'$';
 return 'dataset="ifood_datadog"\n| where _metric matches regex '+JSON.stringify(pattern)+'\n| project metric=tostring(_metric)\n| distinct metric\n| limit 101';
}
export async function originalMetricNames(name:string,range:Range,signal:AbortSignal){
 const rows=await logs(originalMetricQuery(name),range,signal,1000);
 if(rows.length>100)throw Error('Busca de nomes limitada; confirme o nome no Datadog.');
 return [...new Set(rows.map(r=>String(r.metric||'')))].filter(value=>validMetricName(value)&&value.replaceAll('.','_')===name).sort();
}
