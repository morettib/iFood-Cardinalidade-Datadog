export type Pod = {host: string; namespace: string; pod: string};
export type Range = {start: string; end: string};
export type Row = Record<string, unknown>;
export type Series = {metric: Record<string,string>; values?: [number,string][]; value?: [number,string]};
export type Variant = {key:string; labels:Record<string,string>; points:[number,number][]; conflicts:number; description:string};
export type Container = {key: string; name: string; id: string; points: [number,number][]; conflicts: number; variants:Variant[]; observations:[number,number[]][]};
export const seeds: Pod[] = [
  {host:'i-0aab96982e6a2bbb3',namespace:'search-platform',pod:'search-cook-grpc-6cbd9c9b98-6hx4p'},
  {host:'i-027d5172c875ea4c2',namespace:'chat-platform-api',pod:'chat-platform-api-f55b45fdd-5pwcm'},
  {host:'i-08ff4f240df07fcc9',namespace:'search-platform',pod:'search-merchant-worker-577559b985-bssqz'},
];
export const tight: Range = {start:'2026-11-12T15:55:00Z',end:'2026-11-12T16:19:00Z'};
export const broad: Range = {start:'2026-11-12T15:50:00Z',end:'2026-11-12T16:25:00Z'};
export const podKey = (p: Pod) => JSON.stringify([p.host,p.namespace,p.pod]);
const q = (s: string) => JSON.stringify(s);
export const selector = (p: Pod) => `{host=${q(p.host)},pod_name=${q(p.pod)},kube_namespace=${q(p.namespace)}}`;
export const cpuQuery = (p: Pod) => `max by (host,kube_namespace,pod_name,container_name,container_id) (cri_cpu_usage${selector(p)}) / 1000000000`;
export const uptimeQuery = (p: Pod) => `container_uptime${selector(p)}`;
export const discoveryQuery = 'max by (host,kube_namespace,pod_name,container_name,kube_deployment,kube_ownerref_kind,kube_ownerref_name) (cri_cpu_usage{kube_namespace=~"search-platform|chat-platform-api"})';
export const eventsQuery = (p: Pod) => `dataset="datadog_agent_events"\n| where _raw contains ${q(p.pod)}\n| mv-expand ev=events.kubernetes\n| where tostring(ev.msg_title) contains ${q(p.namespace+'/'+p.pod)}\n| project _time, event_time=ev.timestamp, title=ev.msg_title, message=ev.msg_text, level=ev.alert_type, tags=ev.tags\n| order by event_time asc\n| limit 101`;
export const inventoryQuery = (p: Pod) => `dataset="datadog_agent_events"\n| where internalHostname == ${q(p.host)}\n| summarize observations=count(), first=min(_time), last=max(_time) by host=internalHostname, cluster=meta["cluster-name"]\n| limit 100`;
export function validRange(r: Range) { const d = Date.parse(r.end)-Date.parse(r.start); return Number.isFinite(d) && d>0 && d<=3600000; }
export function discover(series: Series[]): Pod[] {
  const all = [...seeds, ...series.map(s=>({host:s.metric.host,namespace:s.metric.kube_namespace,pod:s.metric.pod_name})).filter(p=>p.host&&p.namespace&&p.pod)];
  return [...new Map(all.map(p=>[podKey(p),p])).values()];
}
export function containers(series: Series[]): Container[] {
  const grouped = new Map<string,{container: Container; times: Map<number,Set<number>>; sources:Map<string,{labels:Record<string,string>;times:Map<number,Set<number>>}>}>();
  for (const s of series) {
    const m=s.metric, name=m.container_name||m.kube_container_name||'Container desconhecido', id=m.container_id||'';
    const key=JSON.stringify([m.host,m.kube_namespace,m.pod_name,name,id]);
    let g=grouped.get(key);
    if(!g) { g={container:{key,name,id,points:[],conflicts:0,variants:[],observations:[]},times:new Map(),sources:new Map()}; grouped.set(key,g); }
    const sourceKey=JSON.stringify(Object.entries(m).sort(([a],[b])=>a.localeCompare(b)));
    let source=g.sources.get(sourceKey);
    if(!source){source={labels:m,times:new Map()};g.sources.set(sourceKey,source);}
    for(const [t,v] of s.values || (s.value ? [s.value] : [])) {
      const n=Number(v); if(!Number.isFinite(n)||!Number.isFinite(t)) continue;
      const values=g.times.get(t)||new Set<number>(); values.add(n); g.times.set(t,values);
      const sv=source.times.get(t)||new Set<number>();sv.add(n);source.times.set(t,sv);
    }
  }
  return [...grouped.values()].map(g=>{
    for(const [t,vs] of g.times) {
      g.container.observations.push([t,[...vs].sort((a,b)=>a-b)]);
      if(vs.size===1) g.container.points.push([t,[...vs][0]]); else g.container.conflicts++;
    }
    const sources=[...g.sources].sort(([a],[b])=>a.localeCompare(b));
    const differing=[...new Set(sources.flatMap(([,s])=>Object.keys(s.labels)))].filter(k=>new Set(sources.map(([,s])=>s.labels[k]??'<ausente>')).size>1);
    g.container.variants=sources.map(([key,s],i)=>{
      const points:[number,number][]=[];let conflicts=0;
      for(const [t,vs]of s.times){if(vs.size===1)points.push([t,[...vs][0]]);else conflicts++;}
      return {key,labels:s.labels,points:points.sort((a,b)=>a[0]-b[0]),conflicts,description:differing.map(k=>`${k}: ${s.labels[k]??'ausente'}`).join(' · ')||`Origem ${i+1}`};
    });
    g.container.points.sort((a,b)=>a[0]-b[0]);g.container.observations.sort((a,b)=>a[0]-b[0]);
    return g.container;
  });
}
export function resolveCluster(rows: Row[]) {
  const names=[...new Set(rows.map(r=>String(r.cluster||'')).filter(Boolean))];
  return {cluster:names.length===1?names[0]:undefined,state:names.length===1?'resolved':names.length?'conflict':'unresolved'};
}
export function parseTags(input: unknown): Record<string,string> {
  if(typeof input==='string') {try {return parseTags(JSON.parse(input));} catch{return {};}}
  if(!Array.isArray(input)) return {};
  return Object.fromEntries(input.filter((t):t is string=>typeof t==='string'&&t.includes(':')).map(t=>[t.slice(0,t.indexOf(':')),t.slice(t.indexOf(':')+1)]));
}
export type TimelineEvent = {time:number; ingested:number; title:string; message:string; level:string; confidence:string};
export function timeline(rows: Row[],p: Pod,cluster?: string): {events: TimelineEvent[]; rejected:number; invalidTimestamps:number; capped:boolean} {
  let rejected=0, invalidTimestamps=0; const events: TimelineEvent[]=[];
  for(const r of rows) {
    const t=parseTags(r.tags), time=Number(r.event_time);
    if(r.event_time==null||String(r.event_time).trim()===''||!Number.isFinite(time)||time<=0){rejected++;invalidTimestamps++;continue;}
    if(!Number.isFinite(time)||!String(r.title).includes(p.namespace+'/'+p.pod)||
      (t.pod_name&&t.pod_name!==p.pod)||(t.kube_namespace&&t.kube_namespace!==p.namespace)||
      (t.host_provider_id&&t.host_provider_id!==p.host)||(cluster&&t.kube_cluster_name&&t.kube_cluster_name!==cluster)) {rejected++;continue;}
    events.push({time,ingested:Number(r._time),title:String(r.title||''),message:String(r.message||''),level:String(r.level||'unknown'),confidence:cluster&&t.kube_cluster_name===cluster&&t.pod_name===p.pod&&t.kube_namespace===p.namespace?'cluster / namespace / pod correspondentes':'correlação parcial'});
  }
  return {events:events.sort((a,b)=>a.time-b.time).slice(0,100),rejected,invalidTimestamps,capped:rows.length>100};
}
export function sparkPath(points: [number,number][],r: Range,ceiling?:number) {
  const start=Date.parse(r.start)/1000,end=Date.parse(r.end)/1000,max=ceiling||Math.max(...points.map(p=>p[1]),0.000001);
  return points.map(([t,v],i)=>`${i===0||t-points[i-1][0]>90?'M':'L'}${(44+(t-start)/(end-start)*500).toFixed(2)},${(112-v/max*96).toFixed(2)}`).join(' ');
}
export function eventSummary(message:string) {
  const reason=message.match(/\*\*([^*\n]+)\*\*/)?.[1]||'Evento Kubernetes';
  const summary=message.replace(/%%%/g,'').replace(/_Events emitted[\s\S]*$/,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^\s*\d+\s+/,'').trim();
  return {reason,summary:summary||'Nenhuma mensagem de evento disponível.'};
}

export const relativeRange=(now=Date.now()):Range=>({start:new Date(now-900000).toISOString(),end:new Date(now).toISOString()});
export const windowLabel=(r:Range)=>r.start.slice(0,10)+' · '+r.start.slice(11,16)+'–'+(r.start.slice(0,10)===r.end.slice(0,10)?'':r.end.slice(0,10)+' · ')+r.end.slice(11,16)+' UTC';
export const cpuEvidenceQuery=(p:Pod)=>`cri_cpu_usage${selector(p)} / 1000000000`;
export function cpuContainers(series:Series[]):Container[]{return containers(series).map(c=>({...c,points:c.observations.map(([t,vs])=>[t,Math.max(...vs)] as [number,number])}));}
