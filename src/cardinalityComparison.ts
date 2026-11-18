import {logs,request} from './api';
import {lakeQuery,parseLake,simulate,tagKey,type Impact} from './cardinality';
import {streamDatadogGet} from './streamDatadog';
import type {Range} from './domain';
import {usageKey} from './usageCache';
import {validMetricName} from './metricCatalog';
export type MetricVolumes={type:'distinct_metric_volumes'|'metric_volumes';distinct?:number;indexed?:number;ingested?:number};
export type MetricEstimate={series:number;type:string;estimatedAt:string};
export type CardinalityComparison={schema:1;dataset:'datadog_sketches';metric:string;remove:string[];range:Range;checkedAt:string;lake?:{impact:Impact;complete:boolean;groups:number;invalid:number;observedStart?:string;observedEnd?:string;tags:string[]};volumes?:MetricVolumes;estimateBefore?:MetricEstimate;estimateAfter?:MetricEstimate;errors:string[]};
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function parseVolumes(body:unknown,metric:string):MetricVolumes{
 const b=body as {data?:{id?:string;type?:string;attributes?:Record<string,unknown>}},d=b?.data,a=d?.attributes;if(d?.id!==metric||!a)throw Error('Cardinalidade Datadog sem a métrica exata.');
 if(d.type==='distinct_metric_volumes'&&count(a.distinct_volume))return {type:d.type,distinct:a.distinct_volume};
 if(d.type==='metric_volumes'&&count(a.indexed_volume)&&count(a.ingested_volume))return {type:d.type,indexed:a.indexed_volume,ingested:a.ingested_volume};
 throw Error('A API de cardinalidade Datadog retornou uma resposta incompatível.');
}
export function estimatePath(metric:string,tags:string[]){
 if(!validMetricName(metric)||tags.length===0||tags.some(t=>!/^[-a-zA-Z0-9_./]+$/.test(t)))throw Error('Configuração de tags para estimativa inválida.');
 return `/api/v2/metrics/${metric}/estimate?`+new URLSearchParams({'filter[groups]':[...new Set(tags)].sort().join(','),'filter[hours_ago]':'0','filter[timespan_h]':'1'});
}
export function parseEstimate(body:unknown,metric:string):MetricEstimate{
 const b=body as {data?:{id?:string;type?:string;attributes?:{estimated_output_series?:unknown;estimate_type?:string;estimated_at?:string}}},d=b?.data,a=d?.attributes;
 if(d?.id!==metric||d.type!=='metric_cardinality_estimate'||!a||!count(a.estimated_output_series)||!['distribution','count_or_gauge','percentile'].includes(a.estimate_type||'')||!Number.isFinite(Date.parse(a.estimated_at||'')))throw Error('Estimativa Datadog inválida ou de outra métrica.');
 if(a.estimate_type!=='distribution')throw Error('O estimador retornou '+a.estimate_type+' para uma distribuição. A projeção de redução no Datadog não foi validada.');
 return {series:a.estimated_output_series,type:a.estimate_type!,estimatedAt:a.estimated_at!};
}
const key=async(metric:string,remove:string[])=>'/kvstore/usage/comparison/v1/'+await usageKey(metric,remove);
export async function loadComparison(metric:string,remove:string[],signal:AbortSignal):Promise<CardinalityComparison|undefined>{
 if(!window.CRIBL_API_URL)return undefined;
 const response=await fetch(window.CRIBL_API_URL.replace(/\/$/,'')+await key(metric,remove),{signal});if(response.status===404)return undefined;if(!response.ok)throw Error(`Histórico de cardinalidade indisponível (HTTP ${response.status}).`);
 const value=await response.json() as CardinalityComparison;
 if(value.schema!==1||value.dataset!=='datadog_sketches'||value.metric!==metric||JSON.stringify(value.remove)!==JSON.stringify([...new Set(remove)].sort())||!Array.isArray(value.errors)||!Number.isFinite(Date.parse(value.checkedAt))||!value.range||!Number.isFinite(Date.parse(value.range.start))||!Number.isFinite(Date.parse(value.range.end))||value.lake&&!count(value.lake.impact?.before)||value.volumes&&![value.volumes.distinct,value.volumes.indexed].some(count)||value.estimateBefore&&value.estimateBefore.type!=='distribution'||value.estimateAfter&&value.estimateAfter.type!=='distribution')throw Error('Histórico de cardinalidade inválido. Atualize a comparação.');return value;
}
export async function saveComparison(value:CardinalityComparison,signal:AbortSignal){await request(await key(value.metric,value.remove),signal,{method:'PUT',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(value)});}
export async function compareCardinality(metric:string,remove:string[],signal:AbortSignal,onResult?:(value:CardinalityComparison)=>void):Promise<CardinalityComparison>{
 if(!validMetricName(metric))throw Error('Selecione uma métrica exata.');
 const now=Date.now(),range={start:new Date(now-3600000).toISOString(),end:new Date(now).toISOString()},result:CardinalityComparison={schema:1,dataset:'datadog_sketches',metric,remove:[...new Set(remove)].sort(),range,checkedAt:new Date(now).toISOString(),errors:[]};
 const capture=async(label:string,work:()=>Promise<void>)=>{try{await work();}catch(e){if(signal.aborted)throw e;result.errors.push(label+': '+(e instanceof Error?e.message:'falha na consulta'));}onResult?.({...result,errors:[...result.errors]});};
 await Promise.all([
  capture('Cribl Lakehouse',async()=>{const rows=await logs(lakeQuery([metric]),range,signal,1000,true),sample=parseLake(rows,true,[metric]),tags=[...new Set(['host',...sample.rows.flatMap(r=>r.tags.map(tagKey))])].sort();
   result.lake={impact:simulate(sample.rows,result.remove),complete:sample.complete,groups:sample.groups,invalid:sample.invalid,tags,observedStart:sample.rows.length?new Date(Math.min(...sample.rows.map(r=>r.first))*1000).toISOString():undefined,observedEnd:sample.rows.length?new Date(Math.max(...sample.rows.map(r=>r.last))*1000).toISOString():undefined};
   // Both estimates use the same observed tag configuration and rolling one-hour window.
   if(!sample.complete||!sample.rows.length){result.errors.push('Estimador Datadog: é necessário um conjunto completo e não vazio do Lakehouse para definir as tags de referência.');return;}
   const remaining=tags.filter(t=>t==='host'||!result.remove.includes(t));await Promise.all([
    capture('Estimativa Datadog antes',async()=>{result.estimateBefore=parseEstimate(await streamDatadogGet(estimatePath(metric,tags),signal),metric);}),
    capture('Estimativa Datadog depois',async()=>{result.estimateAfter=parseEstimate(await streamDatadogGet(estimatePath(metric,remaining),signal),metric);})
   ]);
  }),
  capture('Cardinalidade Datadog',async()=>{result.volumes=parseVolumes(await streamDatadogGet(`/api/v2/metrics/${metric}/volumes?window%5Bseconds%5D=3600`,signal),metric);})
 ]);
 return result;
}
