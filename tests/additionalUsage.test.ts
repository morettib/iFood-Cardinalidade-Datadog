import {it,expect,vi} from 'vitest';
import {scanNotebooks,scanSlos,readTagConfiguration} from '../src/additionalUsage';
import {definitionTags} from '../src/datadog';
import {requiredEvidence,usageState,indexingState,type Evidence} from '../src/cardinality';
import {validateDatadogPath,upstreamCode} from '../src/streamDatadog';
const metric='istio.mesh.request.duration.milliseconds',signal=()=>new AbortController().signal,publish=()=>{};
it('bounded notebook batches reuse snapshots and individual fallback preserves failed-definition coverage',async()=>{
 const read=vi.fn(async(p:string)=>p.includes('?')?{data:p.includes('is_template=true')?[]:[1,2].map(id=>({id,attributes:{}}))}:{data:{id:Number(p.split('/').at(-1)),attributes:{cells:[]}}});
 const many=vi.fn(async(paths:string[]):Promise<unknown[]>=>paths.map(path=>({data:{id:Number(path.split('/').at(-1)),attributes:{cells:[]}}})));
 expect((await scanNotebooks(metric,[],signal(),read,definitionTags,publish,{},many)).evidence.complete).toBe(true);expect(many.mock.calls[0][0]).toEqual(['/api/v1/notebooks/1','/api/v1/notebooks/2']);expect(read.mock.calls.filter(([p])=>!p.includes('?'))).toHaveLength(0);
 many.mockRejectedValue(Error('HTTP 403'));expect((await scanNotebooks(metric,[],signal(),read,definitionTags,publish,{},many)).evidence.complete).toBe(true);expect(read.mock.calls.filter(([p])=>!p.includes('?'))).toHaveLength(2);
});
it('job-error reporting extracts only HTTP codes without surfacing raw credential-bearing logs',()=>{
 expect(upstreamCode('DD-APPLICATION-KEY: private-value statusCode: 403')).toBe('403');expect(upstreamCode('HTTP 404')).toBe('404');expect(upstreamCode('headers contain private-value')).toBeUndefined();
});
it('notebooks page all definitions and templates; changed definitions are reread and unchanged ones reused',async()=>{
 const revision=new Date().toISOString(),read=vi.fn(async(path:string)=>{
  if(path.includes('/notebooks?')){const u=new URL(path,'https://test'),template=u.searchParams.get('is_template')==='true',start=Number(u.searchParams.get('start'));const items=template?[{id:102,attributes:{modified:revision}}]:Array.from({length:101},(_,i)=>({id:i+1,attributes:{modified:revision}}));return {data:items.slice(start,start+100),meta:{page:{total_count:items.length}}};}
  const id=Number(path.split('/').at(-1));return {data:{id,attributes:{name:'Notebook '+id,cells:[{query:`p95:${metric}{*} by {pod_name}`}],template_variables:[]}}};
 });
 const previous={'1':{revision,checkedAt:revision,reference:{id:'1',label:'cached',tags:['pod_name']}}};
 const result=await scanNotebooks(metric,['pod_name'],signal(),read,definitionTags,publish,previous);expect(result.evidence).toMatchObject({complete:true,checked:102,total:102});expect(read.mock.calls.some(([p])=>p==='/api/v1/notebooks/1')).toBe(false);expect(result.evidence.references).toHaveLength(102);
 const changedRead=vi.fn(async(p:string)=>p.includes('/notebooks?')?{data:p.includes('is_template=true')?[]:[{id:1,attributes:{modified:'2027-01-01T00:00:00Z'}}]}:{data:{id:1,attributes:{cells:[],name:'changed'}}});
 const changed=await scanNotebooks(metric,['pod_name'],signal(),changedRead,definitionTags,publish,result.snapshots);expect(changed.snapshots['2']).toBeUndefined();expect(changed.snapshots['1'].reference).toBeUndefined();expect(changedRead.mock.calls.some(([p])=>p==='/api/v1/notebooks/1')).toBe(true);
});
it('failed, repeated and truncated notebook inventories cannot establish absent usage',async()=>{
 const read=async(p:string)=>p.includes('/notebooks?')?{data:[{id:1,attributes:{}}],meta:{page:{total_count:2}}}:{};
 expect((await scanNotebooks(metric,[],signal(),read,definitionTags,publish)).evidence.complete).toBe(false);
 const denied=async(p:string)=>{if(!p.includes('?'))throw Error('HTTP 403');return {data:p.includes('is_template=true')?[]:[{id:1,attributes:{}}]};};expect((await scanNotebooks(metric,[],signal(),denied,definitionTags,publish)).evidence).toMatchObject({complete:false,checked:0,total:1});
 const repeat=async()=>({data:Array.from({length:100},()=>({id:1,attributes:{}}))});expect((await scanNotebooks(metric,[],signal(),repeat,definitionTags,publish)).evidence.complete).toBe(false);
});
it('SLO paging covers legacy metric queries, time-slice specifications and validates monitor links',async()=>{
 const read=vi.fn(async(path:string)=>{const start=Number(new URL(path,'https://test').searchParams.get('offset'));return {data:Array.from({length:101},(_,i)=>({id:String(i),type:i===100?'time_slice':'metric',name:'SLO',...(i===100?{sli_specification:{time_slice:{query:{queries:[{query:`avg:${metric}{*} by {pod_name}`}]}}}}:{query:{numerator:'sum:other{*}',denominator:'sum:other{*}'}})})).slice(start,start+100)};});
 const result=await scanSlos(metric,['pod_name'],signal(),read,definitionTags,publish);expect(result).toMatchObject({complete:true,checked:101,references:[{id:'100',tags:['pod_name']}]});expect(read).toHaveBeenCalledTimes(2);
 expect((await scanSlos(metric,[],signal(),async()=>({data:[{id:'1',type:'monitor'}]}),definitionTags,publish)).complete).toBe(false);
 expect((await scanSlos(metric,[],signal(),async()=>({data:[{id:'1',type:'metric'}]}),definitionTags,publish)).complete).toBe(false);
});
it('SLO access failures and malformed pages retain incomplete coverage',async()=>{
 expect(await scanSlos(metric,[],signal(),async()=>{throw Error('HTTP 403');},definitionTags,publish)).toMatchObject({complete:false,checked:0,reason:'HTTP 403'});
 expect((await scanSlos(metric,[],signal(),async()=>({data:null}),definitionTags,publish)).complete).toBe(false);
});
it('tag indexing is contextual and respects include/exclude mode without treating it as usage',async()=>{
 const config=await readTagConfiguration(metric,signal(),async()=>({data:{id:metric,type:'manage_tags',attributes:{tags:['pod_name'],exclude_tags_mode:true,metric_type:'distribution'}}}));
 expect(indexingState([config],'pod_name')).toBe('Excluída da indexação');expect(indexingState([config],'service')).toBe('Incluída na indexação');expect(usageState([{...config,references:[{id:'x',label:'x',tags:['pod_name']}]}],['pod_name'])).toBe('Uso não verificado');
 const missing=await readTagConfiguration(metric,signal(),async()=>{throw Error('HTTP 404');});expect(missing.complete).toBe(false);expect(indexingState([missing],'pod_name')).toBe('Indexação não verificada');
});
it('old three-source evidence remains readable but cannot qualify an opportunity under expanded coverage',()=>{
 const all:Evidence[]=requiredEvidence.map(kind=>({kind,complete:true,checked:0,references:[]}));expect(usageState(all,['pod_name'])).toBe('Nenhum uso observado no escopo verificado');expect(usageState(all.slice(0,3),['pod_name'])).toBe('Uso não verificado');all[3].stale=true;expect(usageState(all,['pod_name'])).toBe('Uso não verificado');all[4].references.push({id:'slo',label:'SLO',tags:['pod_name']});expect(usageState(all,['pod_name'])).toBe('Dependência encontrada');
});
it('expanded Stream allowlist admits only fixed read endpoints and rejects writes or arbitrary filters',()=>{
 for(const path of ['/api/v1/notebooks?count=100&start=0&include_cells=false&is_template=true&sort_field=name&sort_dir=asc','/api/v1/notebooks/123','/api/v1/slo?limit=100&offset=100',`/api/v2/metrics/${metric}/tags`])expect(()=>validateDatadogPath(path)).not.toThrow();
 for(const path of ['/api/v1/slo/1','/api/v1/notebooks?query=secret','/api/v1/notebooks/1/delete',`/api/v2/metrics/other/tags?write=1`])expect(()=>validateDatadogPath(path)).toThrow();
});
