import type { Range, Row, Series } from './domain';
declare global { interface Window { CRIBL_API_URL?: string } }
export class QueryError extends Error {
  kind: 'permission'|'query'|'host'|'network';
  constructor(kind: QueryError['kind'], message: string) {super(message);this.kind=kind;}
}
export async function request(path:string,signal:AbortSignal,init:RequestInit={}) {
  if(!window.CRIBL_API_URL) throw new QueryError('host','Abra este app no Cribl para consultar a telemetria.');
  let response:Response;
  try {response=await fetch(window.CRIBL_API_URL.replace(/\/$/,'')+path,{...init,signal});}
  catch(e) {if(signal.aborted) throw e; throw new QueryError('network','Não foi possível acessar o serviço de consulta.');}
  if(!response.ok) {
    const operation=path.startsWith('/m/default_search/search/jobs')?'Job Search':path.includes('/query_range')?'Metrics range':path.includes('/query?')?'Metrics discovery':'API';
    throw new QueryError(response.status===401||response.status===403?'permission':'query',`HTTP ${response.status} (${operation}): ${response.status===401||response.status===403?'Acesso negado. Verifique as políticas do app e as permissões dos datasets.':'A solicitação de consulta falhou.'}`);
  }
  return response;
}
const metricsPath='/products/lakehouse_engine_metrics/engines/ifood_logs/datasets/metrics/prom/api/v1/';
export async function metrics(query:string,r:Range,signal:AbortSignal,instant=false):Promise<Series[]> {
  const params=new URLSearchParams({query,...(instant?{time:String(Date.parse(r.end)/1000)}:{start:String(Date.parse(r.start)/1000),end:String(Date.parse(r.end)/1000),step:'60'})});
  const body=await (await request(metricsPath+(instant?'query':'query_range')+'?'+params,signal)).json();
  if(body.status!=='success'||!Array.isArray(body.data?.result)||Array.isArray(body.warnings)&&body.warnings.length) throw new QueryError('query','A consulta de métricas falhou, retornou avisos ou uma resposta incompatível.');
  return body.data.result;
}
export function parsePoll(text:string): {rows:Row[];finished:boolean;status?:string;warnings:string[];totalCount?:number} {
  const out:{rows:Row[];finished:boolean;status?:string;warnings:string[];totalCount?:number}={rows:[],finished:false,warnings:[]};
  for(const line of text.split('\n').filter(l=>l.trim())) {
    let v:Row; try {v=JSON.parse(line);} catch {throw new QueryError('query','Resposta de resultados do Search inválida.');}
    const status=String((v.job as Row|undefined)?.status||v.status||'');
    if(['failed','cancelled','canceled','error'].includes(status)||v.error||(v.job as Row|undefined)?.error) throw new QueryError('query','A execução do Search falhou. Consulte os detalhes do job no Search.');
    if(status) out.status=status;
    if(Array.isArray(v.warnings)) out.warnings.push(...v.warnings.map(String));
    if(typeof v.totalEventCount==='number'&&Number.isFinite(v.totalEventCount))out.totalCount=v.totalEventCount;
    out.finished ||= v.isFinished===true;
    if(Array.isArray(v.items)) out.rows.push(...v.items as Row[]);
    else if(!('isFinished' in v||'job' in v||'totalEventCount' in v||'status' in v||'warnings' in v)) out.rows.push(v);
  }
  return out;
}
const jobs='/m/default_search/search/jobs';
export async function logs(query:string,r:Range,signal:AbortSignal,pageSize=100,stableResults=true):Promise<Row[]> {
  let id:string|undefined,completed=false;
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(28000)]);
  try {
    // Search REST accepts Unix seconds or relative expressions, not ISO dates.
    // MCP accepts ISO dates but converts them before calling this REST endpoint.
    const earliest=Date.parse(r.start)/1000,latest=Date.parse(r.end)/1000;
    if(!Number.isFinite(earliest)||!Number.isFinite(latest)||latest<=earliest) throw new QueryError('query','Intervalo de consulta Search inválido.');
    const created=await (await request(jobs,deadline,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,earliest,latest})})).json();
    id=created.items?.[0]?.id||created.id;
    if(!id) throw new QueryError('query','O Search não retornou o ID do job.');
    if(stableResults){
      // Aggregated/sorted Lake results can reorder while workers are still producing rows.
      // Wait for the final persisted result set before applying offsets.
      for(let i=0;i<140;i++){
        const body=await (await request(`${jobs}/${encodeURIComponent(id)}/status`,deadline)).json();const status=body.items?.[0]||body;
        if(status.status==='completed')break;
        if(['failed','cancelled','canceled','error'].includes(status.status))throw new QueryError('query',`Job Search ${id} terminou com o status ${String(status.status)}. Isso não representa um resultado vazio.`);
        if(i===139)throw new QueryError('query','A espera pela conclusão do Search excedeu o limite.');
        await new Promise(resolve=>setTimeout(resolve,200));
      }
    }
    const rows:Row[]=[];let last=stableResults?'completed':'queued',reportedCount:number|undefined;const warnings:string[]=[];
    for(let i=0;i<100;i++) {
      const poll=parsePoll(await (await request(`${jobs}/${encodeURIComponent(id)}/results-poll?offset=${rows.length}&limit=${Math.max(1,Math.min(1000,pageSize))}&lastJobStatus=${last}`,deadline)).text());
      rows.push(...poll.rows);warnings.push(...poll.warnings);last=poll.status||'running';
      if(poll.totalCount!=null)reportedCount=poll.totalCount;
      if(poll.finished) {
        const statusBody=await (await request(`${jobs}/${encodeURIComponent(id)}/status`,deadline)).json();
        const status=statusBody.items?.[0]||statusBody;
        if(status.status!=='completed') throw new QueryError('query',`Job Search ${id} terminou com o status ${String(status.status)}. Consulte os detalhes do job; isso não representa um resultado vazio.`);
        if(warnings.length) throw new QueryError('query',`Job Search ${id} reportou avisos; consulte os detalhes antes de considerar os resultados completos.`);
        if(poll.rows.length===0) {
          const expected=typeof status.totalEventCount==='number'?status.totalEventCount:reportedCount;
          if(expected!=null&&expected>rows.length)throw new QueryError('query',`Job Search ${id} retornou ${rows.length} de ${expected} registros informados. Os resultados estão incompletos.`);
          completed=true;return rows;
        }
      }
    }
    throw new QueryError('query','A consulta de resultados do Search excedeu o limite.');
  } catch(e) {
    if(!signal.aborted&&deadline.aborted) throw new QueryError('query','A consulta excedeu 28 segundos. Reduza o intervalo.');
    throw e;
  } finally {
    if(id&&!completed) void request(`${jobs}/${encodeURIComponent(id)}/cancel`,AbortSignal.timeout(5000),{method:'POST'}).catch(()=>{});
  }
}
