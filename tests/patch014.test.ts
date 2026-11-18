import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {relativeRange,windowLabel,cpuContainers,discover,timeline,eventsQuery,seeds,tight} from '../src/domain';
it('advances a relative snapshot by three minutes',()=>{
 expect(relativeRange(Date.parse('2026-11-12T18:43:00Z'))).toEqual({start:'2026-11-12T18:28:00.000Z',end:'2026-11-12T18:43:00.000Z'});
 expect(relativeRange(Date.parse('2026-11-12T18:46:00Z'))).toEqual({start:'2026-11-12T18:31:00.000Z',end:'2026-11-12T18:46:00.000Z'});
 expect(windowLabel({start:'2026-11-12T23:55:00Z',end:'2026-11-13T00:10:00Z'})).toContain('2026-11-13');
});
it('preserves 24 CPU disputes and maximum values with source evidence',()=>{
 const raw=JSON.parse(readFileSync(new URL('./demo-raw-cpu.json',import.meta.url),'utf8'));
 const rows=cpuContainers(raw);expect(rows.reduce((n,c)=>n+c.conflicts,0)).toBe(24);
 for(const c of rows)for(const [t,v]of c.points)expect(v).toBe(Math.max(...c.observations.find(o=>o[0]===t)![1]));
 expect(rows).toHaveLength(7);expect(rows.some(c=>c.variants.length>1)).toBe(true);
});
it('retains pods from the beginning of the discovery range',()=>{
 const metric={host:'i-0f76dcd2de2763dcb',kube_namespace:'search-platform',pod_name:'search-merchant-worker-577559b985-9hvm4'};
 expect(discover([{metric,values:[[Date.parse(tight.start)/1000,'1']]}]).some(p=>p.pod===metric.pod_name)).toBe(true);
});
it('caps timelines with a sentinel and rejects invalid times without deduplication',()=>{
 const events=JSON.parse(readFileSync(new URL('./demo-events.json',import.meta.url),'utf8'));
 expect(eventsQuery(seeds[0])).toContain('limit 101');
 const result=timeline(Array.from({length:101},(_,i)=>({...events[0],event_time:1794498900+i})),seeds[0]);
 expect(result.capped).toBe(true);expect(result.events).toHaveLength(100);
 const invalid=timeline([null,'',' '].map(event_time=>({...events[0],event_time})),seeds[0]);
 expect(invalid.invalidTimestamps).toBe(3);expect(invalid.events).toEqual([]);
 expect(timeline(events,seeds[0]).events.filter(e=>e.level==='warning')).toHaveLength(5);
});
