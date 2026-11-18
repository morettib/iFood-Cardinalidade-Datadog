import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {containers,eventSummary,tight,timeline,seeds,type Series} from '../src/domain';
import {MetricPanel,EventPanel} from '../src/App';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL('./'+name+'.json',import.meta.url),'utf8'));
it('reproduces all three merchant containers with four disputed timestamps and retains each source history',()=>{
  const rows=containers(fixture('merchant-uptime'));
  expect(rows).toHaveLength(3);expect(rows.map(c=>c.conflicts)).toEqual([4,4,4]);expect(rows.every(c=>c.points.length===0)).toBe(true);
  expect(rows.map(c=>c.variants.length).sort()).toEqual([2,2,3]);
  expect(rows.flatMap(c=>c.variants).every(v=>v.points.length===4)).toBe(true);
  expect(rows.find(c=>c.name==='consul-template')?.observations.at(-1)?.[1]).toEqual([16.256918778,153.224503277]);
  expect(rows.every(c=>c.id.length===64)).toBe(true);
  const html=renderToStaticMarkup(<MetricPanel title="Tempo de atividade do container" unit="seconds" resource={{key:'x',state:'success',data:fixture('merchant-uptime')}} range={tight}/>);
  expect(html).not.toContain('No unambiguous points');expect(html).toContain('valores divergentes');expect(html).toContain('kube_service');expect(html).toContain('4 horários com divergência');
});
it('known demo uptime retains valid history and each container incarnation',()=>{
  const data:Series[]=fixture('demo-uptime');const rows=containers(data);
  expect(rows.every(c=>c.variants.some(v=>v.points.length>0))).toBe(true);
  expect(new Set(rows.map(c=>c.id)).size).toBe(new Set(data.map(s=>s.metric.container_id)).size);
});
it('duplicate exact samples collapse, same-source disagreements remain gaps without destroying valid history',()=>{
  const metric={host:'h',pod_name:'p',container_name:'c',container_id:'id',pod_phase:'running'};
  const rows=containers([{metric,values:[[10,'1'],[70,'2'],[130,'3']]},{metric,values:[[10,'1'],[70,'4']]}]);
  expect(rows[0].variants).toHaveLength(1);expect(rows[0].variants[0].points).toEqual([[10,1],[130,3]]);expect(rows[0].variants[0].conflicts).toBe(1);expect(rows[0].observations[1]).toEqual([70,[2,4]]);
});
it('normalization is invariant to source order and does not choose running/max over competing tags',()=>{
  const fixtureData=fixture('merchant-uptime');const before=containers(fixtureData).map(c=>({id:c.id,observations:c.observations,variants:c.variants})).sort((a,b)=>a.id.localeCompare(b.id));
  const after=containers([...fixtureData].reverse()).map(c=>({id:c.id,observations:c.observations,variants:c.variants})).sort((a,b)=>a.id.localeCompare(b.id));expect(after).toEqual(before);
});
it('cleans Datadog markers in plain text and keeps the original safely escaped in details',()=>{
  const message='%%%\n4 **FailedScheduling**: No eligible nodes <script>alert(1)</script>\n_Events emitted by scheduler_\n%%%';
  expect(eventSummary(message)).toEqual({reason:'FailedScheduling',summary:'FailedScheduling: No eligible nodes <script>alert(1)</script>'});
  const html=renderToStaticMarkup(<EventPanel resource={{key:'x',state:'success',data:[]}} events={[{time:1794498900,ingested:1794498910,title:'pod',message,level:'warning',confidence:'correlação parcial'}]}/>);
  expect(html).toContain('FailedScheduling');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('Mensagem original');
});
it('validates the live ten-event demo and the merchant FailedScheduling timeline',()=>{
  expect(timeline(fixture('demo-events'),seeds[0],'local-comm-sandbox-use1-01').events).toHaveLength(10);
  const merchant=timeline(fixture('merchant-events'),seeds[2]);expect(merchant.events).toHaveLength(12);expect(merchant.events.filter(e=>eventSummary(e.message).reason==='FailedScheduling')).toHaveLength(4);
});
