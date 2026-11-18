import {it,expect,vi,afterEach} from 'vitest';
import {countQuery,countSeries,parseLabels,parseSummary,parseSketchRows,windowParams,validMetricName,originalMetricQuery,originalMetricNames} from '../src/metricCatalog';
import * as api from '../src/api';
import {validateDatadogPath} from '../src/streamDatadog';
const range={start:'2026-11-14T00:00:00Z',end:'2026-11-14T01:00:00Z'};
afterEach(()=>vi.restoreAllMocks());
it('native simulations preserve bucket and host dimensions and count joint removal in the same bounded window',()=>{
 const name='argo_rollouts_notification_send_bucket';
 expect(countQuery(name,range,['argo_rollouts_namespace','argo_rollouts_name'],{key:'argo_rollouts_namespace',value:'a"b'})).toBe('count(count without (argo_rollouts_name,argo_rollouts_namespace) (count_over_time(argo_rollouts_notification_send_bucket{argo_rollouts_namespace="a\\"b"}[3600s])))');
 for(const tag of ['host','upper_bound','le','__name__','x)'])expect(()=>countQuery(name,range,[tag])).toThrow();
 expect(()=>countQuery('x} or up',range)).toThrow();expect(validMetricName('a.b')).toBe(true);expect(validMetricName('../secret')).toBe(false);
 expect(()=>windowParams({...range,end:'2026-11-23T00:00:00Z'})).toThrow();
});
it('empty successful counts are zero; malformed, negative and partial results remain failures',async()=>{
 vi.spyOn(api,'metrics').mockResolvedValueOnce([]).mockResolvedValueOnce([{metric:{},value:[1,'145920']}]).mockResolvedValueOnce([{metric:{},value:[1,'NaN']}]).mockRejectedValueOnce(Error('HTTP 403'));
 const signal=new AbortController().signal;
 expect(await countSeries('argo_rollouts_notification_send_bucket',range,[],signal)).toBe(0);
 expect(await countSeries('argo_rollouts_notification_send_bucket',range,[],signal)).toBe(145920);
 await expect(countSeries('argo_rollouts_notification_send_bucket',range,[],signal)).rejects.toThrow();
 await expect(countSeries('argo_rollouts_notification_send_bucket',range,[],signal)).rejects.toThrow('403');
});
it('catalog counts and label values do not infer Datadog usage and reject incompatible responses',()=>{
 const body={rows:[{name:'argo_rollouts_notification_send_bucket',type:'counter',seriesCount:115520,totalSeriesCount:450000,usage:'unused',rec:{kind:'deprecate'}}],building:true};
 expect(parseSummary(body)).toEqual({entries:[{name:'argo_rollouts_notification_send_bucket',type:'counter',source:'metrics',series:115520,totalSeries:450000,band:undefined,lastSeen:undefined,service:undefined,team:undefined}],building:true});
 expect(parseLabels({labels:[{key:'upper_bound',distinct:5,topValues:['0.5','+Inf']}]})).toMatchObject([{key:'upper_bound',distinct:5,values:[{value:'0.5'},{value:'+Inf'}]}]);
 expect(()=>parseSummary({rows:[{name:'x',seriesCount:-1}],building:false})).toThrow();expect(()=>parseLabels({labels:[{key:'a',distinct:2,topValues:null}]})).toThrow();
});
it('saved inventory enforces version, freshness, limits and separates records from series',()=>{
 const now=Date.now(),row={metric:'coredns.request_size.bytes',records:200,cacheVersion:'ifood-cardinality-v3',cacheAt:now/1000};
 expect(parseSketchRows([row],true,now)[0]).toMatchObject({source:'sketch',type:'distribution',records:200});expect(parseSketchRows([row],true,now)[0].series).toBeUndefined();
 expect(()=>parseSketchRows([{...row,cacheAt:now/1000-1201}],true,now)).toThrow();expect(()=>parseSketchRows([{...row,cacheVersion:'old'}],true,now)).toThrow();expect(()=>parseSketchRows([row,row])).toThrow();expect(()=>parseSketchRows(Array(5001).fill(row))).toThrow();
});
it('dynamic Datadog access permits only exact bounded read endpoints, never path traversal or arbitrary parameters',()=>{
 for(const path of ['/api/v2/metrics/argo_rollouts_notification_send_bucket/tags','/api/v2/metrics/coredns.request_size.bytes/volumes?window%5Bseconds%5D=3600'])expect(()=>validateDatadogPath(path)).not.toThrow();
 for(const path of ['/api/v2/metrics/../users/tags','/api/v2/metrics/x/tags?write=1','/api/v2/metrics/x/volumes?window%5Bseconds%5D=99999','/api/v2/metrics/%2Fusers/tags','/api/v2/metrics/x/delete'])expect(()=>validateDatadogPath(path)).toThrow();
});
it('original name discovery verifies dot normalization and never guesses across ambiguous or truncated results',async()=>{
 expect(originalMetricQuery('argo_rollouts_notification_send_bucket')).toContain('argo[._]rollouts[._]notification[._]send[._]bucket');
 vi.spyOn(api,'logs').mockResolvedValueOnce([{metric:'argo_rollouts.notification.send.bucket'},{metric:'argo_rollouts.notification.send.bucket'},{metric:'other'}]).mockResolvedValueOnce([{metric:'a.b'},{metric:'a_b'}]).mockResolvedValueOnce(Array(101).fill({metric:'a.b'}));
 expect(await originalMetricNames('argo_rollouts_notification_send_bucket',range,new AbortController().signal)).toEqual(['argo_rollouts.notification.send.bucket']);
 expect(await originalMetricNames('a_b',range,new AbortController().signal)).toEqual(['a.b','a_b']);
 await expect(originalMetricNames('a_b',range,new AbortController().signal)).rejects.toThrow('limitada');
});
