import {it,expect,vi,afterEach} from 'vitest';
import {loadUsage,saveUsage,usageKey,type UsageSnapshot} from '../src/usageCache';
import {usageState} from '../src/cardinality';
import {checkDatadog} from '../src/datadog';
import * as stream from '../src/streamDatadog';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const metric='istio.mesh.request.duration.milliseconds',signal=()=>new AbortController().signal;
function snapshot():UsageSnapshot{return {schema:1,metric,tags:['pod_name'],savedAt:new Date().toISOString(),evidence:['queries','monitors','dashboards'].map(kind=>({kind:kind as 'queries'|'monitors'|'dashboards',complete:true,checked:0,references:[]})),dashboards:{}};}
function store(){const values=new Map<string,string>();vi.stubGlobal('window',{CRIBL_API_URL:'https://cribl.test/api/v1'});const fetch=vi.fn(async(address:string,init:RequestInit={})=>{const key=address.split('/kvstore/')[1];if(init.method==='PUT'){expect(init.headers).toMatchObject({'Content-Type':'text/plain;charset=UTF-8'});values.set(key,String(init.body));return new Response('');}return values.has(key)?new Response(values.get(key)):new Response('{}',{status:404});});vi.stubGlobal('fetch',fetch);return {values,fetch};}
it('round-trips app-scoped JSON chunks, canonical tag keys and ten-result history without credentials',async()=>{
 const {values}=store(),s=snapshot();s.dashboards.a={revision:'2026-11-13T00:00:00Z',checkedAt:s.savedAt};
 await saveUsage(s,signal());expect(await loadUsage(metric,['pod_name','pod_name'],signal(),true)).toMatchObject(s);
 expect(await usageKey(metric,['b','a'])).toBe(await usageKey(metric,['a','b','a']));expect(await loadUsage(metric,['other'],signal())).toBeUndefined();
 expect([...values.values()].join()).not.toMatch(/DD_API_KEY|dd-application-key|Bearer/);
});
it('expanded evidence and notebook chunks persist alongside legacy dashboard snapshots',async()=>{
 store();const s=snapshot();s.evidence.push({kind:'notebooks',complete:true,checked:1,references:[{id:'1',label:'Notebook',tags:['pod_name']}]},{kind:'slos',complete:true,checked:0,references:[]},{kind:'configuration',complete:false,checked:0,references:[]});s.notebooks={'1':{revision:s.savedAt,checkedAt:s.savedAt,reference:s.evidence[3].references[0]}};
 await saveUsage(s,signal());expect(await loadUsage(metric,s.tags,signal(),true)).toMatchObject(s);
});
it('a failed chunk write preserves the previous published result',async()=>{
 const {fetch}=store(),s=snapshot();await saveUsage(s,signal());const original=fetch.getMockImplementation()!;
 fetch.mockImplementation(async(address,init)=>init?.method==='PUT'&&address.includes('/snapshots/')?new Response('{}',{status:500}):original(address,init));
 const next={...s,savedAt:'2026-11-14T00:00:00Z',dashboards:{a:{checkedAt:s.savedAt}}};await expect(saveUsage(next,signal())).rejects.toThrow('HTTP 500');expect((await loadUsage(metric,s.tags,signal()))?.savedAt).toBe(s.savedAt);
});
it('corrupt manifests cannot produce a successful no-use result; historical negatives stay unverified',async()=>{
 const {values}=store();values.set('usage/v1/'+await usageKey(metric,['pod_name'])+'/latest',JSON.stringify({schema:1,metric,tags:['pod_name'],savedAt:new Date().toISOString(),evidence:[],chunks:[]}));
 await expect(loadUsage(metric,['pod_name'],signal())).rejects.toThrow('inválido');
 const e=snapshot().evidence.map(e=>({...e,stale:true}));expect(usageState(e,['pod_name'])).toBe('Uso não verificado');e[2].references.push({id:'a',label:'a',tags:['pod_name']});expect(usageState(e,['pod_name'])).toBe('Dependência encontrada');
});
it('incremental refresh reuses unchanged dashboards, reads changed/failed entries and drops deletions',async()=>{
 store();const s=snapshot(),revision='2026-11-13T00:00:00Z',reference={id:'same',label:'Dependency',tags:['pod_name']};
 s.dashboards={same:{revision,checkedAt:s.savedAt,reference},changed:{revision,checkedAt:s.savedAt},deleted:{revision,checkedAt:s.savedAt}};
 const read=vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>path.includes('active-configurations')?{data:{id:metric,attributes:{active_tags:[]}}}:path.includes('/monitor?')?[]:path.includes('/dashboard?')?{total:3,dashboards:[{id:'same',modified_at:revision},{id:'changed',modified_at:'2026-11-13T01:00:00Z'},{id:'failed',modified_at:revision}]}:path.endsWith('/failed')?Promise.reject(Error('HTTP 403')):{id:'changed',widgets:[]});
 const many=vi.spyOn(stream,'streamDatadogGetMany').mockRejectedValue(Error('batch failed'));let saved:UsageSnapshot|undefined;
 const result=await checkDatadog(metric,s.tags,signal(),undefined,{previous:s,onSnapshot:s=>{saved=s;}});
 expect(many.mock.calls[0][0]).toEqual(['/api/v1/dashboard/changed','/api/v1/dashboard/failed']);expect(read.mock.calls.some(([p])=>p.endsWith('/same'))).toBe(false);
 expect(result[2]).toMatchObject({checked:2,total:3,complete:false,references:[reference]});expect(saved?.dashboards.deleted).toBeUndefined();expect(saved?.dashboards.failed).toBeUndefined();
});
it('full scans, expired definitions and absent revision timestamps force rereads',async()=>{
 store();const s=snapshot();s.dashboards.a={revision:'2026-11-13T00:00:00Z',checkedAt:'2020-01-01T00:00:00Z'};
 vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>path.includes('active-configurations')?{data:{id:metric,attributes:{active_tags:[]}}}:path.includes('/monitor?')?[]:{total:1,dashboards:[{id:'a',modified_at:s.dashboards.a.revision}]});const many=vi.spyOn(stream,'streamDatadogGetMany').mockResolvedValue([{id:'a',widgets:[]}]);
 await checkDatadog(metric,s.tags,signal(),undefined,{previous:s});expect(many).toHaveBeenCalledTimes(1);s.dashboards.a.checkedAt=new Date().toISOString();await checkDatadog(metric,s.tags,signal(),undefined,{previous:s,full:true});expect(many).toHaveBeenCalledTimes(2);
});
