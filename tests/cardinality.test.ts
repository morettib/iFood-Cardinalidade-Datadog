import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {canonicalTags,combination,parseLake,pilotReview,rankChanges,simulate,tagValueCounts,usageState,distributionMetrics,type Observation,type Evidence} from '../src/cardinality';
import {checkDatadog,credentialPreflight,DATADOG_API_KEY_SOURCE,definitionTags,parseActive} from '../src/datadog';
import {logs} from '../src/api';
import * as stream from '../src/streamDatadog';
import * as additional from '../src/additionalUsage';
const metric=distributionMetrics[0];
beforeEach(()=>{vi.spyOn(additional,'scanNotebooks').mockResolvedValue({evidence:{kind:'notebooks',complete:true,checked:0,references:[]},snapshots:{}});vi.spyOn(additional,'scanSlos').mockResolvedValue({kind:'slos',complete:true,checked:0,references:[]});vi.spyOn(additional,'readTagConfiguration').mockResolvedValue({kind:'configuration',complete:true,checked:0,references:[]});vi.spyOn(stream,'streamDatadogGetMany').mockImplementation((paths,signal)=>Promise.all(paths.map(p=>stream.streamDatadogGet(p,signal))));});
const row=(tags:string[],host='h'):Observation=>({metric,host,tags,records:2,first:1,last:2});
it('125 combinations can stay unchanged for every individual tag while joint removal reduces combinations and tag bytes',()=>{
 const rows=Array.from({length:125},(_,i)=>row(['pod_name:p'+i,'image_id:i'+i,'service:one']));
 expect(tagValueCounts(rows)).toEqual({pod_name:125,image_id:125,service:1});
 for(const impact of rankChanges(rows).filter(r=>r.remove.length===1)){expect(impact.before).toBe(125);expect(impact.after).toBe(125);expect(impact.tagBytesAfter).toBeLessThan(impact.tagBytesBefore);expect(impact).toEqual(simulate(rows,impact.remove));}
 expect(simulate(rows,['pod_name','image_id']).after).toBe(1);
 const hosts=rows.map((r,i)=>({...r,host:'h'+i}));expect(simulate(hosts,['pod_name','image_id','service']).after).toBe(125);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('counts exact metric + host + canonical full tag set; multiple values for a key survive',()=>{
 const rows=[row(['env:a','pod_name:p','team:x','team:y']),row(['team:y','team:x','pod_name:p','env:a','env:a'])];
 expect(simulate(rows,[]).before).toBe(1);expect(canonicalTags(rows[1].tags)).toHaveLength(4);
 expect(combination(row(['team:x']))).not.toBe(combination(row(['team:y'])));expect(simulate([...rows,row(rows[0].tags,'different-host')],[]).before).toBe(2);
});
it('multiple removals preserve other dimensions and optimized ranking matches exact calculation',()=>{
 const rows=[row(['pod_name:a','image_id:1','team:x']),row(['pod_name:b','image_id:2','team:x']),row(['pod_name:b','image_id:2','team:y'])];
 expect(simulate(rows,['pod_name']).after).toBe(3);expect(simulate(rows,['pod_name','image_id']).after).toBe(2);
 for(const result of rankChanges(rows,['pod_name','image_id']))expect(result).toEqual(simulate(rows,result.remove));
 for(const result of rankChanges([row(['pod_name:a','pod_name:a','team:Ï€'])]))expect(result).toEqual(simulate([row(['pod_name:a','pod_name:a','team:Ï€'])],result.remove));
});
it('incomplete transport, missing tags and overflow never claim complete-window coverage',()=>{
 const valid={metric,host:'h',tags_json:'["pod_name:p"]',records:1,first:1,last:2};
 expect(parseLake([valid],false).coverage).toBe('partial');expect(parseLake([{...valid,tags_json:undefined}]).invalid).toBe(1);
 expect(parseLake([valid,valid]).duplicates).toBe(1);expect(parseLake([valid,valid]).coverage).toBe('partial');
 expect(parseLake(Array.from({length:10001},()=>valid)).coverage).toBe('truncated');
 expect(parseLake([{...valid,metric:metric+'.count'}]).invalid).toBe(1);
});
const evidence=(complete=true):Evidence[]=>['queries','monitors','dashboards','notebooks','slos'].map(kind=>({kind:kind as Evidence['kind'],complete,checked:1,references:[]}));
it('three evidence states keep failed/incomplete scans separate from successful no-use',()=>{
 expect(usageState(evidence(),['pod_name'])).toBe('Nenhum uso observado no escopo verificado');
 const e=evidence();e[2].complete=false;expect(usageState(e,['pod_name'])).toBe('Uso não verificado');
 e[1].references=[{id:'42',label:'monitor',tags:['pod_name']}];expect(usageState(e,['pod_name'])).toBe('Dependência encontrada');
 expect(parseActive({data:{id:metric,attributes:{active_tags:[]}}},metric).complete).toBe(true);
 expect(parseActive({data:{id:metric+'.count',attributes:{active_tags:[]}}},metric).complete).toBe(false);
});
it('scans exact dotted metric names, query group-bys and dashboard variable prefixes',()=>{
 expect(definitionTags({query:`avg:${metric}{env:a} by {pod_name}`},metric,['pod_name'])).toEqual(['pod_name']);
 expect(definitionTags({widgets:[{q:`p95:${metric}{pod_name:$pod}`}],template_variables:[{name:'pod',prefix:'pod_name'}]},metric,['pod_name'])).toEqual(['pod_name']);
 expect(definitionTags({query:`avg:${metric}.count{*} by {pod_name}`},metric,['pod_name'])).toEqual([]);
});
it('Stream success and access failure return truthful dependency evidence',async()=>{
 vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test'});
 const read=vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>path.includes('active-configurations')?{data:{id:metric,attributes:{active_tags:['pod_name','ifood_requester_service']}}}:path.includes('/monitor')?[]:{dashboards:[]});
 const result=await checkDatadog(metric,['pod_name','ifood_requester_service'],new AbortController().signal);
 expect(usageState(result,['pod_name'])).toBe('Dependência encontrada');expect(result.every(e=>e.complete)).toBe(true);
 expect(read).toHaveBeenCalledTimes(3);expect(DATADOG_API_KEY_SOURCE).toContain('secrets-datadog/dd-application-key');
 read.mockRejectedValue(Error('Stream Datadog Preview failed (upstream HTTP 403).'));
 vi.mocked(additional.scanNotebooks).mockResolvedValue({evidence:{kind:'notebooks',complete:false,checked:0,references:[],reason:'HTTP 403'},snapshots:{}});vi.mocked(additional.scanSlos).mockResolvedValue({kind:'slos',complete:false,checked:0,references:[],reason:'HTTP 403'});vi.mocked(additional.readTagConfiguration).mockResolvedValue({kind:'configuration',complete:false,checked:0,references:[],reason:'HTTP 403'});
 const denied=await checkDatadog(metric,['pod_name'],new AbortController().signal);
 expect(denied.every(e=>!e.complete&&e.checked===0&&e.reason?.includes('403'))).toBe(true);
});
it('dashboard scan reads beyond the old 20-definition cap',async()=>{
 vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test'});
 vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>path.includes('active-configurations')?{data:{id:metric,attributes:{active_tags:[]}}}:path.includes('/monitor')?[]:path.includes('/dashboard?')?{dashboards:Array.from({length:21},(_,i)=>({id:String(i)})),total:21}:{widgets:[],template_variables:[]});
 const result=await checkDatadog(metric,['pod_name'],new AbortController().signal);
 expect(result[2].checked).toBe(21);expect(result[2].complete).toBe(true);expect(usageState(result,['pod_name'])).toBe('Nenhum uso observado no escopo verificado');
});
it('standalone preflight requires Cribl and never reads credential values or KV',async()=>{
 vi.stubGlobal('window',{});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 expect(await credentialPreflight(new AbortController().signal)).toContain('Abra no Cribl');
 vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test'});expect(await credentialPreflight(new AbortController().signal)).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
});
it('disabled Stream review matches only exact metric + scope and preserves points',()=>{
 const r=row(['env:sandbox','pod_name:a,b"c','service:x']),plan=pilotReview(metric,{key:'env',value:'sandbox'},simulate([r],['pod_name']),{start:'2026-11-12T15:02:00Z',end:'2026-11-12T15:10:00Z'},[],true);
 expect(plan.proposedFunction.disabled).toBe(true);expect(plan.gates).toContain('Valide as evidências de dependência com os responsáveis');
 const sketch={metric,tagsList:r.tags,dogsketchesList:[{ts:1,cnt:2,kList:[1],nList:[2]}]};
 const transform=new Function('sketch','return '+plan.proposedFunction.conf.add[0].value);
 expect(transform(sketch)).toEqual(['env:sandbox','service:x']);expect(sketch.dogsketchesList[0].cnt).toBe(2);
 const slash=pilotReview(metric,{key:'env',value:'sandbox'},simulate([row(['ifood/impact-level:x','env:sandbox'])],['ifood/impact-level']),{start:'a',end:'b'},[],true);
 expect(new Function('sketch','return '+slash.proposedFunction.conf.add[0].value)({tagsList:['ifood/impact-level:x','env:sandbox']})).toEqual(['env:sandbox']);
 const applies=new Function('sketch','return '+plan.proposedFunction.filter);expect(applies(sketch)).toBe(true);expect(applies({...sketch,metric:metric+'.count'})).toBe(false);expect(applies({...sketch,tagsList:['env:prod']})).toBe(false);
});
it('a completed query missing reported rows is a query failure, not complete analysis',async()=>{
 vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test'});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({id:'partial'})).mockResolvedValueOnce(Response.json({status:'completed'})).mockResolvedValueOnce(new Response('{"isFinished":true,"items":[],"totalEventCount":2}')).mockResolvedValueOnce(Response.json({status:'completed'})).mockResolvedValueOnce(Response.json({})));
 await expect(logs('dataset="datadog_sketches" | limit 10001',{start:'2026-11-12T15:02:00Z',end:'2026-11-12T15:10:00Z'},new AbortController().signal,1000)).rejects.toMatchObject({kind:'query',message:expect.stringContaining('incompletos')});
});
it('sorted aggregation waits for completed status before reading any result pages',async()=>{
 vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test'});
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({id:'stable'})).mockResolvedValueOnce(Response.json({status:'running'})).mockResolvedValueOnce(Response.json({status:'completed'})).mockResolvedValueOnce(new Response('{"isFinished":true,"items":[],"totalEventCount":0}')).mockResolvedValueOnce(Response.json({status:'completed'}));vi.stubGlobal('fetch',fetch);
 await expect(logs('dataset="datadog_sketches" | summarize n=count()',{start:'2026-11-12T15:02:00Z',end:'2026-11-12T15:10:00Z'},new AbortController().signal,1000,true)).resolves.toEqual([]);
 expect(fetch.mock.calls[1][0]).toContain('/status');expect(fetch.mock.calls[2][0]).toContain('/status');expect(fetch.mock.calls[3][0]).toContain('lastJobStatus=completed');
});
