import type {Evidence} from './cardinality';
import type {DashboardSnapshot} from './usageCache';
type ObjectData=Record<string,unknown>;
type Scan=(def:ObjectData,metric:string,tags:string[])=>string[];
const error=(e:unknown)=>e instanceof Error?e.message:'A consulta Datadog falhou.';
export async function scanNotebooks(metric:string,tags:string[],signal:AbortSignal,get:(path:string,signal:AbortSignal)=>Promise<unknown>,scan:Scan,publish:(e:Evidence)=>unknown,previous:Record<string,DashboardSnapshot>={},readMany?:(paths:string[],signal:AbortSignal)=>Promise<unknown[]>){
 const snapshots:Record<string,DashboardSnapshot>={},references:Evidence['references']=[],seen=new Set<string>();let checked=0,total=0;const failed:string[]=[];
 try{
  for(const template of [false,true]){
   const list:ObjectData[]=[];let expected:number|undefined;
   for(let start=0;;start+=100){
    signal.throwIfAborted();const body=await get(`/api/v1/notebooks?count=100&start=${start}&include_cells=false&is_template=${template}&sort_field=name&sort_dir=asc`,signal) as {data?:ObjectData[];meta?:{page?:{total_count?:number}}};
    if(!Array.isArray(body.data)||body.data.length>100)throw Error('Lista de notebooks incompatível.');
    const count=body.meta?.page?.total_count;if(count!=null){if(!Number.isSafeInteger(count)||count<0||expected!=null&&expected!==count)throw Error('Total de notebooks mudou ou é inválido.');expected=count;}
    for(const item of body.data){const id=String(item?.id??'');if(!/^[1-9]\d*$/.test(id)||seen.has(id)||!item.attributes||typeof item.attributes!=='object')throw Error('ID ou atributos de notebook inválidos/repetidos.');seen.add(id);list.push(item);total++;}
    publish({kind:'notebooks',complete:false,checked,total,references:[...references],reason:`Descobrindo notebooks e templates · ${total} listados.`});
    if(body.data.length<100)break;
   }
   if(expected!=null&&expected!==list.length)throw Error('O inventário de notebooks não corresponde ao total informado.');
   const reusable=(item:ObjectData)=>{const attrs=item.attributes as ObjectData,revision=typeof attrs.modified==='string'&&Number.isFinite(Date.parse(attrs.modified))?attrs.modified:undefined,saved=previous[String(item.id)];return !!(saved&&revision&&revision===saved.revision&&Date.now()-Date.parse(saved.checkedAt)<7*86400000&&Date.parse(saved.checkedAt)<=Date.now());};
   const pending=list.filter(item=>!reusable(item)),responses=new Map<string,unknown>(),attempted=new Set<string>();
   for(const item of list){
    signal.throwIfAborted();const id=String(item.id),attrs=item.attributes as ObjectData,revision=typeof attrs.modified==='string'&&Number.isFinite(Date.parse(attrs.modified))?attrs.modified:undefined,saved=previous[id];
    if(saved&&revision===saved.revision&&revision&&Date.now()-Date.parse(saved.checkedAt)<7*86400000&&Date.parse(saved.checkedAt)<=Date.now()){snapshots[id]=saved;checked++;if(saved.reference)references.push(saved.reference);continue;}
    if(readMany&&!attempted.has(id)){
     responses.clear();const batch=pending.slice(pending.findIndex(item=>String(item.id)===id),pending.findIndex(item=>String(item.id)===id)+25);batch.forEach(item=>attempted.add(String(item.id)));
     try{const bodies=await readMany(batch.map(item=>'/api/v1/notebooks/'+item.id),signal);if(!Array.isArray(bodies)||bodies.length!==batch.length)throw Error('Lote de notebooks incompleto.');batch.forEach((item,i)=>responses.set(String(item.id),bodies[i]));}catch(e){if(signal.aborted)throw e;/* Retry failed batches through individual bounded reads below. */}
    }
    try{const response=(responses.get(id)??await get('/api/v1/notebooks/'+id,signal)) as {data?:{id?:number;attributes?:ObjectData}},def=response?.data?.attributes;
     if(String(response?.data?.id)!==id||!def||!Array.isArray(def.cells)||def.template_variables!=null&&!Array.isArray(def.template_variables))throw Error('Definição de notebook incompleta.');
     const used=scan({cells:def.cells,template_variables:def.template_variables||[]},metric,tags),reference=used.length?{id,label:String(def.name||'Notebook'),tags:used,url:'https://app.datadoghq.com/notebook/'+id}:undefined;
     snapshots[id]={revision,reference,checkedAt:new Date().toISOString()};checked++;if(reference)references.push(reference);
    }catch(e){if(signal.aborted)throw e;failed.push(id);}
    publish({kind:'notebooks',complete:false,checked,total,references:[...references],reason:`Notebooks e templates · ${checked}/${total} verificados; ${failed.length} falhas.`});
   }
  }
  return {evidence:{kind:'notebooks',complete:!failed.length,checked,total,references,reason:failed.length?'Notebooks sem leitura válida: '+failed.join(', '):undefined} as Evidence,snapshots};
 }catch(e){return {evidence:{kind:'notebooks',complete:false,checked,total,references,reason:error(e)} as Evidence,snapshots};}
}
export async function scanSlos(metric:string,tags:string[],signal:AbortSignal,get:(path:string,signal:AbortSignal)=>Promise<unknown>,scan:Scan,publish:(e:Evidence)=>unknown):Promise<Evidence>{
 const references:Evidence['references']=[],seen=new Set<string>();let checked=0;
 try{for(let offset=0;;offset+=100){signal.throwIfAborted();const body=await get(`/api/v1/slo?limit=100&offset=${offset}`,signal) as {data?:ObjectData[]};
  if(!Array.isArray(body.data)||body.data.length>100)throw Error('Lista de SLOs incompatível.');
  for(const item of body.data){if(!item||typeof item.id!=='string'||!item.id||seen.has(item.id)||!['metric','monitor','time_slice'].includes(String(item.type)))throw Error('Definição de SLO incompleta ou repetida.');seen.add(item.id);
   if(item.type!=='monitor'&&!item.query&&!item.sli_specification)throw Error('SLO omitiu a definição da consulta.');
   if(item.type==='monitor'&&!Array.isArray(item.monitor_ids))throw Error('SLO omitiu os monitores relacionados.');
   const used=scan({query:item.query,sli_specification:item.sli_specification},metric,tags);if(used.length)references.push({id:item.id,label:String(item.name||'SLO'),tags:used,url:'https://app.datadoghq.com/slo?slo_id='+encodeURIComponent(item.id)});checked++;
  }
  if(body.data.length<100)return {kind:'slos',complete:true,checked,total:checked,references};publish({kind:'slos',complete:false,checked,references:[...references],reason:`Verificando SLOs · ${checked} definições lidas.`});
 }}catch(e){return {kind:'slos',complete:false,checked,references,reason:error(e)};}
}
export async function readTagConfiguration(metric:string,signal:AbortSignal,get:(path:string,signal:AbortSignal)=>Promise<unknown>):Promise<Evidence>{
 try{const body=await get(`/api/v2/metrics/${metric}/tags`,signal) as {data?:{id?:string;type?:string;attributes?:{tags?:unknown;exclude_tags_mode?:unknown;metric_type?:unknown}}},attrs=body?.data?.attributes;
  if(body?.data?.id!==metric||body.data.type!=='manage_tags'||!attrs||!Array.isArray(attrs.tags)||!attrs.tags.every(t=>typeof t==='string')||attrs.exclude_tags_mode!=null&&typeof attrs.exclude_tags_mode!=='boolean'||!['gauge','count','rate','distribution'].includes(String(attrs.metric_type)))throw Error('Configuração de indexação incompatível.');
  return {kind:'configuration',complete:true,checked:1,references:[],configuration:{tags:attrs.tags,excludeTagsMode:attrs.exclude_tags_mode===true,metricType:String(attrs.metric_type)},reason:'Contexto de indexação; não comprova uso por consultas.'};
 }catch(e){return {kind:'configuration',complete:false,checked:0,references:[],reason:error(e)+' Configuração indisponível; ausência de configuração não comprova ausência de uso.'};}
}
