import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import * as stream from '../src/streamDatadog';
import {checkDatadog} from '../src/datadog';
import type {Evidence} from '../src/cardinality';
const metric='istio.mesh.request.duration.milliseconds';
beforeEach(()=>{vi.spyOn(stream,'streamDatadogGetMany').mockImplementation((paths,signal)=>Promise.all(paths.map(p=>stream.streamDatadogGet(p,signal))));});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
function inventory(monitors=350,dashboards=125){
 vi.stubGlobal('window',{CRIBL_API_URL:'https://cribl.test'});
 return async(path:string):Promise<unknown>=>{
  const u=new URL(path,'https://api.datadoghq.com');
  if(path.includes('active-configurations'))return {data:{id:metric,attributes:{active_tags:[]}}};
  if(u.pathname==='/api/v1/monitor'){const start=Number(u.searchParams.get('page'))*100;return Array.from({length:Math.max(0,Math.min(100,monitors-start))},(_,i)=>({id:start+i,query:start+i===monitors-1?`p95:${metric}{*} by {pod_name}`:'avg:other{*}'}));}
  if(u.pathname==='/api/v1/dashboard'){const start=Number(u.searchParams.get('start'));return {total:dashboards,dashboards:Array.from({length:Math.max(0,Math.min(100,dashboards-start))},(_,i)=>({id:'dash-'+(start+i)}))};}
  const id=u.pathname.split('/').at(-1);return {id,widgets:id==='dash-'+(dashboards-1)?[{q:`p95:${metric}{*} by {pod_name}`}]:[],template_variables:[]};
 };
}
it('scans every page beyond both old caps and finds dependencies on the last definitions',async()=>{
 const read=vi.spyOn(stream,'streamDatadogGet').mockImplementation(inventory()),progress:Evidence[]=[];
 const result=await checkDatadog(metric,['pod_name'],new AbortController().signal,e=>progress.push(e));
 expect(result[1]).toMatchObject({complete:true,checked:350,total:350});expect(result[1].references[0].id).toBe('349');
 expect(result[2]).toMatchObject({complete:true,checked:125,total:125});expect(result[2].references[0].id).toBe('dash-124');
 expect(read.mock.calls.some(([p])=>p.endsWith('page=3'))).toBe(true);expect(read.mock.calls.some(([p])=>p.endsWith('start=100'))).toBe(true);
 expect(progress.some(e=>e.kind==='monitors'&&!e.complete&&e.checked===300)).toBe(true);
 expect(progress.some(e=>e.kind==='dashboards'&&!e.complete&&e.checked>20)).toBe(true);
});
it('requests an empty terminal monitor page when the total is an exact page multiple',async()=>{
 const read=vi.spyOn(stream,'streamDatadogGet').mockImplementation(inventory(400,0));
 const result=await checkDatadog(metric,[],new AbortController().signal);expect(result[1].checked).toBe(400);expect(result[1].complete).toBe(true);expect(read.mock.calls.some(([p])=>p.endsWith('page=4'))).toBe(true);
});
it('duplicate pagination and unreadable dashboard details never claim full coverage',async()=>{
 const source=inventory();vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>{
  if(path.endsWith('page=1'))return source('/api/v1/monitor?page_size=100&page=0');
  if(path.endsWith('/dash-4'))throw Error('HTTP 403');return source(path);
 });
 const result=await checkDatadog(metric,['pod_name'],new AbortController().signal);
 expect(result[1]).toMatchObject({complete:false,checked:100});expect(result[1].reason).toContain('repetiu um ID');
 expect(result[2]).toMatchObject({complete:false,checked:124,total:125});expect(result[2].reason).toContain('dash-4');expect(result[2].references[0].id).toBe('dash-124');
});
it('retries transient rate limits without retrying access denials',async()=>{
 vi.useFakeTimers();const source=inventory(0,1);let calls=0;
 const read=vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>{
  if(path.endsWith('/dash-0')&&calls++===0)throw Error('Stream Datadog Preview failed (upstream HTTP 429).');return source(path);
 });
 const task=checkDatadog(metric,[],new AbortController().signal);await vi.advanceTimersByTimeAsync(2100);const result=await task;
 expect(result[2]).toMatchObject({complete:true,checked:1});expect(read.mock.calls.filter(([p])=>p.endsWith('/dash-0'))).toHaveLength(2);
});
