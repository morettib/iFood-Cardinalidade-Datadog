import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {containers,cpuQuery,eventsQuery,resolveCluster,seeds,sparkPath,tight,timeline,validRange,parseTags} from '../src/domain';
import {logs,parsePoll,request,QueryError} from '../src/api';
const events=JSON.parse(readFileSync(new URL('./events.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
afterEach(()=>vi.unstubAllGlobals());
describe('verified Pods slice',()=>{
  it('uses normalized literal CPU selector and prefilters before expansion',()=>{
    expect(cpuQuery(seeds[0])).toBe('max by (host,kube_namespace,pod_name,container_name,container_id) (cri_cpu_usage{host="i-0aab96982e6a2bbb3",pod_name="search-cook-grpc-6cbd9c9b98-6hx4p",kube_namespace="search-platform"}) / 1000000000');
    const query=eventsQuery(seeds[0]);expect(query.indexOf('_raw contains')).toBeLessThan(query.indexOf('mv-expand'));
  });
  it('renders ten known correlated eventos using inner time and preserves repeats',()=>{
    const t=timeline(events,seeds[0],'local-comm-sandbox-use1-01');expect(t.events).toHaveLength(10);expect(t.rejected).toBe(0);
    expect(t.events[0].time).toBe(1794498919);expect(t.events[0].time).not.toBe(t.events[0].ingested);
    expect(timeline([...events,events[0]],seeds[0],'local-comm-sandbox-use1-01').events).toHaveLength(11);
  });
  it('chat empty is a successful empty timeline, identity mismatch is excluded',()=>{
    expect(timeline([],seeds[1]).events).toEqual([]);expect(timeline(events,seeds[1]).rejected).toBe(10);
  });
  it('does not guess conflicting or missing cluster inventory',()=>{
    expect(resolveCluster([{cluster:'a'},{cluster:'a'}]).cluster).toBe('a');
    expect(resolveCluster([{cluster:'a'},{cluster:'b'}])).toEqual({state:'conflict',cluster:undefined});
    expect(resolveCluster([]).state).toBe('unresolved');
  });
  it('preserves container incarnations and omits conflicting uptime',()=>{
    const metric={host:'h',kube_namespace:'n',pod_name:'p',container_name:'c'};
    const data=containers([{metric:{...metric,container_id:'1'},values:[[1,'2'],[2,'3']]},{metric:{...metric,container_id:'1'},values:[[1,'2'],[2,'4']]},{metric:{...metric,container_id:'2'},values:[[2,'7']]}]);
    expect(data).toHaveLength(2);expect(data[0].points).toEqual([[1,2]]);expect(data[0].conflicts).toBe(1);
  });
  it('leaves chart gaps open and bounds ranges',()=>{expect(sparkPath([[1794498900,1],[1794499100,2]],tight).match(/M/g)).toHaveLength(2);expect(validRange(tight)).toBe(true);expect(validRange({start:tight.start,end:'2026-11-13T16:19:00Z'})).toBe(false);});
  it('parses serialized tags at first colon',()=>expect(parseTags('["host_provider_id:aws:x"]')).toEqual({host_provider_id:'aws:x'}));
  it('failed execution cannot become an empty result',()=>{
    expect(()=>parsePoll('{"isFinished":true,"job":{"status":"failed","error":"<--- Last few GCs --->"}}')).toThrow(QueryError);
    expect(parsePoll('{"isFinished":true,"job":{"status":"completed"},"items":[]}').rows).toEqual([]);
    expect(()=>parsePoll('invalid')).toThrow(QueryError);
  });
  it('distinguishes permissions from query HTTP failures',async()=>{
    vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test/api/v1'});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:403})));
    await expect(request('/test',new AbortController().signal)).rejects.toMatchObject({kind:'permission'});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:422})));
    await expect(request('/test',new AbortController().signal)).rejects.toMatchObject({kind:'query'});
  });
  it('checks completed job status before returning successful zero',async()=>{
    vi.stubGlobal('window',{CRIBL_API_URL:'https://example.test/api/v1'});
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({items:[{id:'1'}]})).mockResolvedValueOnce(Response.json({items:[{status:'completed'}],count:1})).mockResolvedValueOnce(new Response('{"isFinished":true,"items":[]}')).mockResolvedValueOnce(Response.json({items:[{status:'completed'}],count:1}));vi.stubGlobal('fetch',fetch);
    await expect(logs(eventsQuery(seeds[1]),tight,new AbortController().signal)).resolves.toEqual([]);expect(fetch).toHaveBeenCalledTimes(4);
    const body=JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.earliest).toBe(1794498900);expect(body.latest).toBe(1794500340);
    expect(typeof body.earliest).toBe('number');expect(typeof body.latest).toBe('number');
  });
  it('rejects invalid dates before submitting a Job Search',async()=>{
    vi.stubGlobal('fetch',vi.fn());
    await expect(logs(eventsQuery(seeds[0]),{start:'invalid',end:tight.end},new AbortController().signal)).rejects.toMatchObject({kind:'query',message:'Intervalo de consulta Search inválido.'});
    expect(fetch).not.toHaveBeenCalled();
  });
});
