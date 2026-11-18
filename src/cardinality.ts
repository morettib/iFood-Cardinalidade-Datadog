import type {Range,Row} from './domain';
export const distributionMetrics=['istio.mesh.request.duration.milliseconds','istio.mesh.request.size','istio.mesh.response.size'];
export const cardinalityWindow:Range={start:'2026-11-12T15:02:00Z',end:'2026-11-12T15:10:00Z'};
export const GROUP_LIMIT=10000;
export type Scope={key:string;value:string};
export type Observation={metric:string;host:string;tags:string[];records:number;first:number;last:number};
export type LakeSample={rows:Observation[];invalid:number;duplicates:number;complete:boolean;coverage:'complete'|'truncated'|'partial';groups:number};
export const tagKey=(tag:string)=>tag.slice(0,tag.indexOf(':'));
export const canonicalTags=(tags:string[])=>[...new Set(tags)].sort();
export function tagValueCounts(rows:Observation[]):Record<string,number>{
 const values=new Map<string,Set<string>>();for(const row of rows)for(const tag of row.tags){const key=tagKey(tag);if(!values.has(key))values.set(key,new Set());values.get(key)!.add(tag.slice(key.length+1));}
 return Object.fromEntries([...values].map(([key,items])=>[key,items.size]));
}
export const combination=(r:Observation,remove:string[]=[])=>JSON.stringify([r.metric,r.host,canonicalTags(r.tags.filter(t=>!remove.includes(tagKey(t))))]);
export function lakeQuery(metrics=distributionMetrics){
 return `dataset="datadog_sketches"\n| where tostring(sketch.metric) in (${metrics.map(m=>JSON.stringify(m)).join(',')})\n| project _time, metric=tostring(sketch.metric), host=tostring(sketch.host), tags_json=tostring(sketch.tagsList)\n| summarize records=count(), first=min(_time), last=max(_time) by metric,host,tags_json\n| order by metric asc, host asc, tags_json asc\n| limit ${GROUP_LIMIT+1}`;
}
export function parseLake(rows:Row[],transportComplete=true,allowedMetrics=distributionMetrics):LakeSample{
 let invalid=0,duplicates=0;const observations:Observation[]=[],seen=new Set<string>();
 for(const r of rows.slice(0,GROUP_LIMIT)){
  let tags:unknown;try{tags=typeof r.tags_json==='string'?JSON.parse(r.tags_json):r.tags;}catch{invalid++;continue;}
  if(!allowedMetrics.includes(String(r.metric))||typeof r.host!=='string'||!r.host||!Array.isArray(tags)||!tags.every(t=>typeof t==='string'&&t.indexOf(':')>0)||!Number.isFinite(Number(r.records))||Number(r.records)<=0||r.first==null||r.last==null||!Number.isFinite(Number(r.first))||!Number.isFinite(Number(r.last))){invalid++;continue;}
  const identity=JSON.stringify([r.metric,r.host,tags]);if(seen.has(identity)){duplicates++;continue;}seen.add(identity);
  observations.push({metric:String(r.metric),host:r.host,tags,records:Number(r.records),first:Number(r.first),last:Number(r.last)});
 }
 const coverage=rows.length>GROUP_LIMIT?'truncated':!transportComplete||invalid||duplicates?'partial':'complete';
 return {rows:observations,invalid,duplicates,complete:coverage==='complete',coverage,groups:rows.length};
}
export function availableScopes(rows:Observation[]):Scope[]{
 const scopes=new Map<string,Scope>();for(const r of rows)for(const tag of r.tags){const key=tagKey(tag);if(['env','kube_namespace','service'].includes(key))scopes.set(tag,{key,value:tag.slice(key.length+1)});}
 return [...scopes.values()].sort((a,b)=>(a.key+':'+a.value).localeCompare(b.key+':'+b.value));
}
export function scoped(rows:Observation[],metric:string,scope?:Scope){return rows.filter(r=>(metric==='all'||r.metric===metric)&&(!scope||r.tags.includes(scope.key+':'+scope.value)));}
export type Impact={remove:string[];before:number;after:number;reduction:number;percent:number;records:number;tagBytesBefore:number;tagBytesAfter:number};
export function simulate(rows:Observation[],remove:string[]):Impact{
 const keys=[...new Set(remove)].sort(),before=new Set<string>(),after=new Set<string>();let records=0,tagBytesBefore=0,tagBytesAfter=0;
 const utf8=new TextEncoder();for(const r of rows){before.add(combination(r));after.add(combination(r,keys));records+=r.records;tagBytesBefore+=utf8.encode(JSON.stringify(r.tags)).length*r.records;tagBytesAfter+=utf8.encode(JSON.stringify(r.tags.filter(t=>!keys.includes(tagKey(t))))).length*r.records;}
 return {remove:keys,before:before.size,after:after.size,reduction:before.size-after.size,percent:before.size?100*(before.size-after.size)/before.size:0,records,tagBytesBefore,tagBytesAfter};
}
export function rankChanges(rows:Observation[],custom:string[]=[]):Impact[]{
 const keys=[...new Set(rows.flatMap(r=>r.tags.map(tagKey)))].sort();
 // Compact exact IDs avoid repeatedly allocating full multi-kilobyte tag strings per candidate.
 const tagIds=new Map<string,number>(),hostIds=new Map<string,number>(),encoder=new TextEncoder();
 const prepared=rows.map(r=>{const identity=JSON.stringify([r.metric,r.host]);if(!hostIds.has(identity))hostIds.set(identity,hostIds.size);const tags=canonicalTags(r.tags).map(t=>{if(!tagIds.has(t))tagIds.set(t,tagIds.size);return {key:tagKey(t),id:tagIds.get(t)!};}).sort((a,b)=>a.id-b.id);
  const bytesByKey=new Map<string,number>();for(const t of r.tags)bytesByKey.set(tagKey(t),(bytesByKey.get(tagKey(t))||0)+encoder.encode(JSON.stringify(t)).length+1);
  return {host:hostIds.get(identity)!,tags,records:r.records,bytes:encoder.encode(JSON.stringify(r.tags)).length,bytesByKey,rawCount:r.tags.length};});
 const before=new Set(prepared.map(r=>r.host+':'+r.tags.map(t=>t.id).join(','))).size;
 const fast=(remove:string[]):Impact=>{const removed=new Set(remove),after=new Set<string>();let records=0,tagBytesBefore=0,tagBytesAfter=0;
  for(const r of prepared){const keep=r.tags.filter(t=>!removed.has(t.key));after.add(r.host+':'+keep.map(t=>t.id).join(','));const saved=remove.reduce((n,k)=>n+(r.bytesByKey.get(k)||0),0);records+=r.records;tagBytesBefore+=r.bytes*r.records;tagBytesAfter+=(r.bytes-saved+(r.rawCount&&keep.length===0?1:0))*r.records;}
  return {remove:[...new Set(remove)].sort(),before,after:after.size,reduction:before-after.size,percent:before?100*(before-after.size)/before:0,records,tagBytesBefore,tagBytesAfter};};
 const singles=keys.map(k=>fast([k])).sort((a,b)=>b.reduction-a.reduction||a.remove.join().localeCompare(b.remove.join()));
 const top=singles.slice(0,6).map(s=>s.remove[0]),pairs:Impact[]=[];for(let i=0;i<top.length;i++)for(let j=i+1;j<top.length;j++)pairs.push(fast([top[i],top[j]]));
 const all=[...singles,...pairs,...(custom.length?[fast([...new Set(custom)])]:[])];
 return [...new Map(all.map(s=>[s.remove.join('\0'),s])).values()].sort((a,b)=>b.reduction-a.reduction||a.remove.length-b.remove.length||a.remove.join().localeCompare(b.remove.join()));
}
export type UsageState='Dependência encontrada'|'Nenhum uso observado no escopo verificado'|'Uso não verificado';
export const requiredEvidence=['queries','monitors','dashboards','notebooks','slos'] as const;
export const evidenceLabel=(kind:Evidence['kind'])=>({queries:'Consultas ativas',monitors:'Monitores',dashboards:'Dashboards',notebooks:'Notebooks',slos:'SLOs',configuration:'Configuração de indexação'}[kind]);
export type Evidence={kind:typeof requiredEvidence[number]|'configuration';complete:boolean;checked:number;total?:number;references:{id:string;label:string;url?:string;tags:string[]}[];reason?:string;lookback?:number;checkedAt?:string;stale?:boolean;configuration?:{tags:string[];excludeTagsMode:boolean;metricType:string}};
export function usageState(evidence:Evidence[],tags:string[]):UsageState{
 if(evidence.some(e=>e.kind!=='configuration'&&e.references.some(r=>r.tags.some(t=>tags.includes(t)))))return 'Dependência encontrada';
 return requiredEvidence.every(kind=>evidence.filter(e=>e.kind===kind).length===1&&evidence.find(e=>e.kind===kind)?.complete&&!evidence.find(e=>e.kind===kind)?.stale)?'Nenhum uso observado no escopo verificado':'Uso não verificado';
}
export function indexingState(evidence:Evidence[],tag:string):string{
 const config=evidence.find(e=>e.kind==='configuration');
 if(!config?.complete||config.stale||!config.configuration)return 'Indexação não verificada';
 const listed=config.configuration.tags.includes(tag),included=config.configuration.excludeTagsMode?!listed:listed;
 return included?'Incluída na indexação':'Excluída da indexação';
}
export function pilotReview(metric:string,scope:Scope|undefined,impact:Impact,range:Range,evidence:Evidence[],complete:boolean){
 const filter=`typeof sketch !== 'undefined' && sketch != null && sketch.metric === ${JSON.stringify(metric)} && Array.isArray(sketch.tagsList)${scope?' && sketch.tagsList.includes('+JSON.stringify(scope.key+':'+scope.value)+')':''}`;
 // Match complete JSON strings rather than splitting comma-containing tag values.
 const escaped=impact.remove.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\//g,'\\/')).join('|');
 const value=`JSON.parse(JSON.stringify(sketch.tagsList).replace(/"(?:${escaped}):(?:\\\\.|[^"\\\\])*"(?:,|(?=\\]))|("(?:\\\\.|[^"\\\\])*")/g, '$1').replace(/,\\]$/, ']'))`;
 const state=usageState(evidence,impact.remove);
 const originalDetailQuery=`dataset="datadog_sketches"\n| where tostring(sketch.metric) == ${JSON.stringify(metric)}${scope?'\n| where tostring(sketch.tagsList) contains '+JSON.stringify(JSON.stringify(scope.key+':'+scope.value)):''}\n| project _time, metric=sketch.metric, host=sketch.host, tags=sketch.tagsList, dogsketches=sketch.dogsketchesList, distributions=sketch.distributionsList\n| limit 101`;
 return {version:1,status:'Rascunho para revisão — sem deploy',metric,scope,window:range,observedImpact:impact,usage:state,coverage:complete?'complete':'incomplete',
  gates:[...(scope?[]:['Escolha um escopo restrito']),...(impact.remove.length?[]:['Escolha pelo menos uma tag']),...(impact.reduction>0?[]:['Nenhuma redução de combinações medida neste escopo']),...(metric==='all'?['Escolha uma métrica exata']:[]),...(state==='Nenhum uso observado no escopo verificado'?[]:['Valide as evidências de dependência com os responsáveis']),...(!complete?['Repita com cobertura completa do Lake']:[]),'Valide o Eval em um Preview do Stream; a serialização de distribuições/sketches e a aceitação Datadog devem ser verificadas antes de habilitar'],
  proposedFunction:{id:'eval',disabled:true,filter,description:'Rascunho do piloto: alterar apenas sketch.tagsList no pipeline exclusivo do Datadog; preservar todos os pontos do sketch',conf:{add:[{name:'sketch.tagsList',value}]}},
  attach:'Após revisão, adicione ao pipeline exclusivo do Datadog em datadog-agent-intake → ifood-sandbox-datadog. Preserve as funções health-prune. Não use o pipeline comum de entrada nem substitua as conexões da origem.',
  retain:'Preserve o ramo original de ingestão sem esta transformação. Consulte os sketches originais no dataset datadog_sketches do Lakehouse Engine.',originalDetailQuery,
  rollback:'Desabilite/remova apenas o novo Eval e restaure a revisão salva do pipeline exclusivo do Datadog. Preserve o Lake e confirme a retomada das tags originais.',
  validation:['Registre a revisão imutável do pipeline/origem e a referência da mesma janela antes da aprovação','Preview: alterar somente a métrica exata no escopo original; preservar eventos fora do piloto; dogsketchesList/distributionsList idênticos; cnt/kList/nList/ts/min/max/sum preservados','Valide o isolamento do fan-out: a transformação exclusiva do Datadog não deve alterar tags ou pontos no ramo original do Lake','Compare métrica + host + tags restantes normalizadas antes/depois na mesma janela do piloto','Meça os bytes reais de saída comprimidos e não comprimidos no destino Datadog; a simulação JSON das tags não mede o volume de saída','Compare o volume ingerido/indexado informado pelo Datadog com a janela e os termos de cobrança corretos; não deduza economia pela quantidade de combinações','Valide cópias originais e transformadas da mesma captura em métricas de referência/piloto isoladas ou em uma organização de teste, após verificar a serialização. Compare sum(cnt), quantidade de pontos, p95 e p99 nos mesmos horários e dimensões preservadas. Conjuntos de tags coincidentes devem ser mesclados sem perda de amostras. Não envie duas vezes a mesma métrica de produção nem calcule a média dos percentis dos sketches','Reexecute monitores/dashboards/variáveis vinculados e obtenha aprovação dos responsáveis; interrompa e reverta em caso de dados ausentes, percentis fora da tolerância ou erros de envio'],evidence};
}
