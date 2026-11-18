import {it,expect,vi,afterEach} from 'vitest';
import {previewRequest,previewBatchRequest,capturedResponse,readCapture,streamDatadogGet} from '../src/streamDatadog';
const path='/api/v2/metrics/istio.mesh.request.duration.milliseconds/active-configurations?window%5Bseconds%5D=604800';
const id='1794599758.26504.adhoc.test';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
it('restricts collection to known Datadog read endpoints and resolves both global secrets on Stream',()=>{
 const body=previewRequest(path);expect(body.collector.conf.collectRequestHeaders.map(h=>h.value)).toEqual([
  "C.Secret('DD_API_KEY', 'text', 'secrets-datadog').value","C.Secret('dd-application-key', 'text', 'secrets-datadog').value"]);
 expect(body.run.mode).toBe('preview');expect(body.input.sendToRoutes).toBe(false);expect(body.input.output).toBe('devnull');
 expect(body.input.breakerRulesets).toEqual(['ifood_datadog_api_json']);
 expect(previewRequest('/api/v1/monitor?page_size=100&page=31')).toBeDefined();
 expect(previewRequest('/api/v1/dashboard?count=100&start=200')).toBeDefined();
 expect(body.collector.conf.retryRules.enableHeader).toBe(true);
 for(const p of ['https://evil.test','//evil.test/api/v1/monitor','/api/v1/dashboard/../../admin','/api/v1/monitor?page_size=100&page=-1','/api/v2/metrics/other/active-configurations','/api/v1/dashboard?count=100&start=0#x'])expect(()=>previewRequest(p)).toThrow();
});
it('accepts only the exact job and source and rejects duplicate, malformed and missing responses',()=>{
 const event={__inputId:'collection:'+id,source:'https://api.datadoghq.com'+path,_raw:JSON.stringify({data:{id:'metric'}})};
 expect(capturedResponse(JSON.stringify(event),id,path)).toEqual({data:{id:'metric'}});
 expect(capturedResponse(JSON.stringify({...event,source:event.source.split('?')[0]}),id,path)).toEqual({data:{id:'metric'}});
 for(const text of ['',JSON.stringify({...event,__inputId:'collection:other'}),JSON.stringify({...event,source:'https://evil.test'}),JSON.stringify(event)+'\n'+JSON.stringify(event),JSON.stringify({...event,_raw:'broken'})])expect(()=>capturedResponse(text,id,path)).toThrow();
});
it('batches only unique dashboard read paths and closes a multi-Worker capture once every response arrives',async()=>{
 const paths=['/api/v1/dashboard/a-1','/api/v1/dashboard/b-2'];const body=previewBatchRequest(paths);
 expect(body.collector.conf.discovery.itemList).toEqual(paths);expect(body.run.capture.maxEvents).toBe(2);
 expect(()=>previewBatchRequest([paths[0],paths[0]])).toThrow();expect(()=>previewBatchRequest([path])).toThrow();
 const cancel=vi.fn(),encoder=new TextEncoder();
 const source=new ReadableStream<Uint8Array>({start(controller){for(const p of paths)controller.enqueue(encoder.encode(JSON.stringify({__inputId:'collection:'+id,source:'https://api.datadoghq.com'+p,_raw:'{"widgets":[]}'})+'\n'));},cancel});
 const text=await readCapture(new Response(source),id,paths);
 expect(cancel).toHaveBeenCalledOnce();for(const p of paths)expect(capturedResponse(text,id,p)).toEqual({widgets:[]});
});
function mockTransport(failed=false,wrongJob=false){
 let resumed=false;
 const fetch=vi.fn(async(url:string,init:RequestInit={})=>{
  if(url.endsWith('/jobs')&&init.method==='POST')return Response.json({items:[id]});
  if(url.endsWith('/system/capture'))return new Response(JSON.stringify({__inputId:'collection:'+(wrongJob?'other':id),source:'https://api.datadoghq.com'+path,_raw:'{"data":{"ok":true}}'}));
  if(url.endsWith('/resume')){resumed=true;return Response.json({items:[{state:'pending'}]});}
  if(url.endsWith('/cancel'))return Response.json({items:[]});
  return Response.json({items:[{status:resumed?{state:failed?'failed':'finished',reason:{message:'statusCode: 403'}}:{state:'paused'},stats:{tasks:{failed:failed?1:0},collectedEvents:failed?0:1}}]});
 });vi.stubGlobal('window',{CRIBL_API_URL:'https://cribl.test/api/v1'});vi.stubGlobal('fetch',fetch);return fetch;
}
it('registers a job-specific capture before resume and waits for successful execution',async()=>{
 vi.useFakeTimers();const fetch=mockTransport();const result=streamDatadogGet(path,new AbortController().signal);await vi.advanceTimersByTimeAsync(1100);
 expect(await result).toEqual({data:{ok:true}});
 const calls=fetch.mock.calls;expect(calls.findIndex(([u])=>u.endsWith('/system/capture'))).toBeLessThan(calls.findIndex(([u])=>u.endsWith('/resume')));
 const body=JSON.parse(String(calls.find(([u])=>u.endsWith('/system/capture'))?.[1]?.body));expect(body.filter).toBe('__inputId === '+JSON.stringify('collection:'+id));
 expect(calls.every(([u])=>u.startsWith('https://cribl.test'))).toBe(true);
});
it('failed execution and cross-job capture never become successful empty Datadog results',async()=>{
 vi.useFakeTimers();mockTransport(true);const failed=streamDatadogGet(path,new AbortController().signal);const check=expect(failed).rejects.toThrow('HTTP 403');await vi.advanceTimersByTimeAsync(1100);await check;
 mockTransport(false,true);const mismatch=streamDatadogGet(path,new AbortController().signal);const rejected=expect(mismatch).rejects.toThrow('exatamente uma resposta');await vi.advanceTimersByTimeAsync(1100);await rejected;
});
it('cancels an unfinished paused job when the operator changes the selection',async()=>{
 vi.useFakeTimers();const fetch=mockTransport(),abort=new AbortController();
 const task=streamDatadogGet(path,abort.signal);const rejected=expect(task).rejects.toThrow();
 await vi.advanceTimersByTimeAsync(10);abort.abort();await vi.advanceTimersByTimeAsync(10);await rejected;
 expect(fetch.mock.calls.some(([url,init])=>url.endsWith('/cancel')&&init?.method==='PATCH')).toBe(true);
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/resume'))).toBe(false);
});

