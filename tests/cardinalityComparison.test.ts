import {it,expect,vi,afterEach} from 'vitest';
import {parseVolumes,parseEstimate,estimatePath,compareCardinality} from '../src/cardinalityComparison';
import {previewRequest} from '../src/streamDatadog';
import * as stream from '../src/streamDatadog';
import * as api from '../src/api';
const metric='istio.mesh.request.duration.milliseconds';
afterEach(()=>{vi.restoreAllMocks();});
it('reads exact metric cardinality, distinguishes missing and zero, and rejects mismatched estimator types',()=>{
 expect(parseVolumes({data:{id:metric,type:'distinct_metric_volumes',attributes:{distinct_volume:33087}}},metric).distinct).toBe(33087);
 expect(parseVolumes({data:{id:metric,type:'metric_volumes',attributes:{indexed_volume:0,ingested_volume:0}}},metric).indexed).toBe(0);
 expect(()=>parseVolumes({data:{id:'other',type:'distinct_metric_volumes',attributes:{distinct_volume:1}}},metric)).toThrow();
 expect(()=>parseVolumes({data:{id:metric,type:'distinct_metric_volumes',attributes:{}}},metric)).toThrow();
 expect(()=>parseEstimate({data:{id:metric,type:'metric_cardinality_estimate',attributes:{estimate_type:'count_or_gauge',estimated_at:new Date().toISOString(),estimated_output_series:0}}},metric)).toThrow('distribuição');
});
it('only permits bounded read-only estimate and volume endpoints, including real slash-containing tag keys',()=>{
 expect(previewRequest(estimatePath(metric,['host','ifood/impact-level','pod_name']))).toBeDefined();expect(previewRequest('/api/v2/metrics/'+metric+'/volumes?window%5Bseconds%5D=3600')).toBeDefined();
 expect(()=>previewRequest(estimatePath(metric,['host'])+'&evil=1')).toThrow();expect(()=>previewRequest('/api/v2/metrics/other/volumes?window%5Bseconds%5D=99999')).toThrow();expect(()=>estimatePath(metric,['x&secret=1'])).toThrow();
});
it('compares one-hour Lakehouse input with Datadog and simulates cardinality while preserving records and host',async()=>{
 const now=Date.now();const rows=['a','b'].map(p=>({metric,host:'h',tags_json:JSON.stringify(['env:test','pod_name:'+p,'ifood/impact-level:x']),records:10,first:now/1000-100,last:now/1000}));
 const lake=vi.spyOn(api,'logs').mockResolvedValue(rows),read=vi.spyOn(stream,'streamDatadogGet').mockImplementation(async path=>path.includes('/volumes?')?{data:{id:metric,type:'distinct_metric_volumes',attributes:{distinct_volume:99}}}:{data:{id:metric,type:'metric_cardinality_estimate',attributes:{estimated_output_series:new URL(path,'https://example.test').searchParams.get('filter[groups]')?.includes('pod_name')?20:10,estimate_type:'distribution',estimated_at:new Date().toISOString()}}});
 const result=await compareCardinality(metric,['pod_name'],new AbortController().signal);
 expect(lake.mock.calls[0][0]).toContain('dataset="datadog_sketches"');expect(Date.parse(result.range.end)-Date.parse(result.range.start)).toBe(3600000);
 expect(result.lake?.impact).toMatchObject({before:2,after:1,records:20});expect(result.volumes?.distinct).toBe(99);expect(result.estimateBefore?.series).toBe(20);expect(result.estimateAfter?.series).toBe(10);expect(result.errors).toEqual([]);expect(read.mock.calls.filter(([p])=>p.includes('/estimate?')).every(([p])=>new URL(p,'https://x.test').searchParams.get('filter[groups]')?.includes('host'))).toBe(true);
});
it('a denied Datadog request preserves measured Cribl results and reports unverified cardinality instead of zero',async()=>{
 vi.spyOn(api,'logs').mockResolvedValue([]);vi.spyOn(stream,'streamDatadogGet').mockRejectedValue(Error('HTTP 403'));
 const result=await compareCardinality(metric,['pod_name'],new AbortController().signal);expect(result.volumes).toBeUndefined();expect(result.lake?.impact.before).toBe(0);expect(result.estimateAfter).toBeUndefined();expect(result.errors.join()).toContain('HTTP 403');
});
