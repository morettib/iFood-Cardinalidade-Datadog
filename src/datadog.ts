import {scanNotebooks,scanSlos,readTagConfiguration} from './additionalUsage';
import type {Evidence} from './cardinality';
import {streamDatadogGet,streamDatadogGetMany,STREAM_SECRET_SOURCE} from './streamDatadog';
import {canonicalUsageTags,type UsageSnapshot} from './usageCache';
export const DD_SITE='https://api.datadoghq.com';
export const QUERY_LOOKBACK=604800;
export const DATADOG_API_KEY_SOURCE=STREAM_SECRET_SOURCE;
export async function credentialPreflight(signal:AbortSignal):Promise<string|undefined>{
 if(!window.CRIBL_API_URL)return 'Abra no Cribl; a configuração de credenciais não foi verificada.';
 if(signal.aborted)throw signal.reason;
 return undefined;
}
type Definition=Record<string,unknown>;
function strings(v:unknown):string[]{if(typeof v==='string')return [v];if(Array.isArray(v))return v.flatMap(strings);if(v&&typeof v==='object')return Object.values(v).flatMap(strings);return [];}
const escape=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function definitionTags(def:Definition,metric:string,tags:string[]):string[]{
 const text=strings(def).join('\n');const exact=new RegExp(`(^|[^a-zA-Z0-9_.])${escape(metric)}($|[^a-zA-Z0-9_.])`,'m');if(!exact.test(text))return [];
 // Conservative syntactic reference scan: includes filters, group-bys and dashboard variable prefixes.
 return tags.filter(t=>new RegExp(`(^|[^a-zA-Z0-9_])${escape(t)}($|[^a-zA-Z0-9_])`,'m').test(text));
}
export function parseActive(body:unknown,metric:string):Evidence{
 const b=body as {data?:{id?:string;attributes?:{active_tags?:unknown}}};const active=b?.data?.attributes?.active_tags;
 if(b?.data?.id!==metric||!Array.isArray(active)||!active.every(t=>typeof t==='string'))return {kind:'queries',complete:false,checked:0,references:[],reason:'A resposta omitiu a métrica exata ou active_tags válidas.',lookback:QUERY_LOOKBACK};
 return {kind:'queries',complete:true,checked:1,references:active.length?[{id:metric,label:'Tags de consultas ativas (o Datadog não fornece IDs de consultas nesta API)',tags:active.map(t=>String(t).split(':')[0]),url:'https://app.datadoghq.com/metric/explorer?exp_metric='+encodeURIComponent(metric)}]:[],lookback:QUERY_LOOKBACK};
}
async function get(path:string,signal:AbortSignal):Promise<unknown>{
 for(let attempt=0;;attempt++){
  try{return await streamDatadogGet(path,signal);}catch(e){
   const message=e instanceof Error?e.message:'';
   if(signal.aborted||attempt>=2||!(/HTTP (429|5\d\d)|could not be reached|response capture failed|did not capture exactly one|Não foi possível acessar|captura do Stream falhou|não capturou exatamente uma/.test(message)))throw e;
   await pause(2000*2**attempt,signal);
  }
 }
}
const pause=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
 if(signal.aborted){reject(signal.reason);return;}
 const abort=()=>{clearTimeout(timer);reject(signal.reason);};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});
});
function blocked(kind:Evidence['kind'],e:unknown,checked=0,references:Evidence['references']=[]):Evidence{return {kind,complete:false,checked,references,reason:e instanceof Error?e.message:'A verificação Datadog falhou.'};}
export async function checkDatadog(metric:string,tags:string[],signal:AbortSignal,onEvidence?:(e:Evidence)=>void,options:{previous?:UsageSnapshot;full?:boolean;onSnapshot?:(s:UsageSnapshot)=>void}={}):Promise<Evidence[]>{
 const old=options.previous;const previous=!options.full&&old?.schema===1&&old.metric===metric&&JSON.stringify(old.tags)===JSON.stringify(canonicalUsageTags(tags))?old.dashboards:{};
 const snapshots:UsageSnapshot['dashboards']={};
 signal=AbortSignal.any([signal,AbortSignal.timeout(1800000)]);
 const publish=(e:Evidence)=>{const stamped={...e,checkedAt:new Date().toISOString()};if(!signal.aborted)onEvidence?.(stamped);return stamped;};
 const missing=await credentialPreflight(signal);
 if(missing)return (['queries','monitors','dashboards','notebooks','slos','configuration'] as const).map(kind=>({...blocked(kind,new Error(missing)),lookback:kind==='queries'?QUERY_LOOKBACK:undefined,checkedAt:new Date().toISOString()}));
 const active=async()=>{try{return parseActive(await get(`/api/v2/metrics/${encodeURIComponent(metric)}/active-configurations?window%5Bseconds%5D=${QUERY_LOOKBACK}`,signal),metric);}catch(e){return {...blocked('queries',e),lookback:QUERY_LOOKBACK};}};
 const monitors=async()=>{
  let checked=0;const refs:Evidence['references']=[];
  const seen=new Set<string>();
  try{for(let page=0;;page++){
   if(signal.aborted)throw Error('Verificação de monitores cancelada ou limite de 30 minutos atingido; cobertura incompleta.');
   const body=await get(`/api/v1/monitor?page_size=100&page=${page}`,signal);if(!Array.isArray(body))throw Error('A lista de monitores retornou uma resposta incompatível.');
   if(body.length>100)throw Error('A página de monitores excedeu o tamanho solicitado.');
   for(const item of body){if(!item||typeof item!=='object'||item.id==null||typeof item.query!=='string')throw Error('Definições de monitores incompletas.');const id=String(item.id);if(seen.has(id))throw Error('A paginação de monitores repetiu um ID; o inventário pode ter mudado durante a verificação.');seen.add(id);checked++;const used=definitionTags({query:item.query},metric,tags);if(used.length)refs.push({id,label:String(item.name||'Monitor'),tags:used,url:'https://app.datadoghq.com/monitors/'+encodeURIComponent(id)});}
   if(body.length<100)return {kind:'monitors' as const,complete:true,checked,total:checked,references:refs};
   publish({kind:'monitors',complete:false,checked,references:[...refs],reason:`Verificando todos os monitores acessíveis · ${checked} verificados; solicitando página ${page+2}.`});
  }}catch(e){return blocked('monitors',e,checked,refs);}
 };
 const dashboards=async()=>{
  let checked=0;const refs:Evidence['references']=[],list:Definition[]=[],seen=new Set<string>(),failed:string[]=[];let reportedTotal:number|undefined;
  try{
   for(let start=0;;start+=100){
    if(signal.aborted)throw Error('Verificação de dashboards cancelada ou limite de 30 minutos atingido; cobertura incompleta.');
    const body=await get(`/api/v1/dashboard?count=100&start=${start}`,signal) as {dashboards?:Definition[];total?:number};
    if(!Array.isArray(body.dashboards)||body.dashboards.length>100)throw Error('A lista de dashboards retornou uma resposta incompatível.');
    if(body.total!=null){if(!Number.isSafeInteger(body.total)||body.total<0||reportedTotal!=null&&reportedTotal!==body.total)throw Error('A contagem do inventário de dashboards mudou ou é inválida.');reportedTotal=body.total;}
    for(const item of body.dashboards){if(item?.id==null)throw Error('A lista de dashboards omitiu um ID.');const id=String(item.id);if(seen.has(id))throw Error('A paginação de dashboards repetiu um ID; o inventário pode ter mudado durante a verificação.');seen.add(id);list.push(item);}
    publish({kind:'dashboards',complete:false,checked,total:reportedTotal,references:[],reason:`Descobrindo todos os dashboards acessíveis · ${list.length} listados.`});
    if(body.dashboards.length<100)break;
   }
   if(reportedTotal!=null&&list.length!==reportedTotal)throw Error('A paginação retornou menos definições do que o total informado.');
   const pending:Definition[]=[];let reused=0;
   for(const item of list){const id=String(item.id),saved=previous[id],revision=typeof item.modified_at==='string'&&Number.isFinite(Date.parse(item.modified_at))?item.modified_at:undefined;
    if(saved&&revision&&saved.revision===revision&&Date.now()-Date.parse(saved.checkedAt)<7*86400000&&Date.parse(saved.checkedAt)<=Date.now()){snapshots[id]=saved;checked++;reused++;if(saved.reference)refs.push(saved.reference);}else pending.push(item);
   }
   publish({kind:'dashboards',complete:false,checked,total:list.length,references:[...refs],reason:`${reused} definições sem alteração reutilizadas; ${pending.length} definições novas, alteradas ou pendentes para leitura.`});
   for(let start=0;start<pending.length;start+=25){
    if(signal.aborted)throw Error('Verificação de dashboards cancelada ou limite de 30 minutos atingido; cobertura incompleta.');
    const batch=pending.slice(start,start+25),paths=batch.map(item=>'/api/v1/dashboard/'+encodeURIComponent(String(item.id)));
    let bodies:unknown[]|undefined;
    try{bodies=await streamDatadogGetMany(paths,signal);if(!Array.isArray(bodies)||bodies.length!==paths.length)throw Error('Lote de dashboards incompleto.');}
    catch{
     if(signal.aborted)throw Error('Verificação de dashboards cancelada ou prazo excedido.');
     bodies=[];
     for(const path of paths){if(signal.aborted)throw Error('Verificação de dashboards cancelada ou prazo excedido.');try{bodies.push(await get(path,signal));}catch{bodies.push(undefined);}}
    }
    await Promise.all(batch.map(async(item,index)=>{
     const id=String(item.id);
     try{const def=bodies?.[index] as Definition;
      if(!def||!Array.isArray(def.widgets)||def.template_variables!=null&&!Array.isArray(def.template_variables)||def.id!=null&&String(def.id)!==id)throw Error('Definição de dashboard incompleta.');
      checked++;const used=definitionTags({widgets:def.widgets,template_variables:def.template_variables||[]},metric,tags);const reference=used.length?{id,label:String(def.title||'Dashboard'),tags:used,url:'https://app.datadoghq.com/dashboard/'+encodeURIComponent(id)}:undefined;if(reference)refs.push(reference);
      snapshots[id]={revision:typeof item.modified_at==='string'&&Number.isFinite(Date.parse(item.modified_at))?item.modified_at:undefined,reference,checkedAt:new Date().toISOString()};
     }catch{failed.push(id);}
    }));
    publish({kind:'dashboards',complete:false,checked,total:list.length,references:[...refs],reason:`Lendo todos os dashboards acessíveis · ${checked} / ${list.length} verificados${failed.length?`; ${failed.length} falharam após novas tentativas`:''}.`});
   }
   return {kind:'dashboards' as const,complete:failed.length===0,checked,total:list.length,references:refs,reason:failed.length?`${failed.length} definições de dashboards falharam após novas tentativas: ${failed.slice(0,10).join(', ')}${failed.length>10?'…':''}. A cobertura restante não foi verificada.`:undefined};
  }catch(e){return {...blocked('dashboards',e,checked,refs),total:list.length||reportedTotal};}
 };
 const notebookResult=scanNotebooks(metric,tags,signal,get,definitionTags,publish,!options.full&&old?.metric===metric&&JSON.stringify(old.tags)===JSON.stringify(canonicalUsageTags(tags))?old.notebooks||{}:{},streamDatadogGetMany);
 const evidence=await Promise.all([active(),monitors(),dashboards(),notebookResult.then(r=>r.evidence),scanSlos(metric,tags,signal,get,definitionTags,publish),readTagConfiguration(metric,signal,get)].map(p=>p.then(publish)));
 const notebooks=(await notebookResult).snapshots;
 if(!signal.aborted)options.onSnapshot?.({schema:1,metric,tags:canonicalUsageTags(tags),savedAt:new Date().toISOString(),evidence,dashboards:snapshots,notebooks});
 return evidence;
}
