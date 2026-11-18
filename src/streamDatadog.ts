import {request} from './api';

const jobs='/m/default/jobs';
const metricPath=/^\/api\/v2\/metrics\/([a-zA-Z_:][a-zA-Z0-9_.:]{0,255})\/(active-configurations|volumes|estimate|tags)$/;
export const STREAM_SECRET_SOURCE='Secrets globais: secrets-datadog/DD_API_KEY + secrets-datadog/dd-application-key';
export function validateDatadogPath(path:string):void {
 const url=new URL(path,'https://api.datadoghq.com');
 if(!path.startsWith('/')||url.origin!=='https://api.datadoghq.com'||url.hash)throw Error('Caminho de leitura Datadog não permitido.');
 const metric=metricPath.exec(url.pathname);
 const active=metric?.[2]==='active-configurations'&&path===url.pathname+'?window%5Bseconds%5D=604800';
 const volumes=metric?.[2]==='volumes'&&path===url.pathname+'?window%5Bseconds%5D=3600';
 const estimate=metric?.[2]==='estimate'&&path===url.pathname+'?'+url.searchParams.toString()&&[...url.searchParams.keys()].sort().join(',')==='filter[groups],filter[hours_ago],filter[timespan_h]'&&url.searchParams.get('filter[hours_ago]')==='0'&&url.searchParams.get('filter[timespan_h]')==='1'&&/^[-a-zA-Z0-9_./]+(?:,[-a-zA-Z0-9_./]+)*$/.test(url.searchParams.get('filter[groups]')||'');
 const monitor=/^\/api\/v1\/monitor\?page_size=100&page=(0|[1-9]\d*)$/.test(path);
 const dashboard=/^\/api\/v1\/dashboard\?count=100&start=(0|[1-9]\d*)$/.test(path)||/^\/api\/v1\/dashboard\/[a-zA-Z0-9-]+$/.test(path);
 const notebook=/^\/api\/v1\/notebooks\?count=100&start=(0|[1-9]\d*)&include_cells=false&is_template=(true|false)&sort_field=name&sort_dir=asc$/.test(path)||/^\/api\/v1\/notebooks\/[1-9]\d*$/.test(path);
 const slo=/^\/api\/v1\/slo\?limit=100&offset=(0|[1-9]\d*)$/.test(path);
 const configuration=metric?.[2]==='tags'&&path===url.pathname;
 if(!active&&!volumes&&!estimate&&!monitor&&!dashboard&&!notebook&&!slo&&!configuration)throw Error('Caminho de leitura Datadog não permitido.');
}
export function previewRequest(path:string) {
 validateDatadogPath(path);
 return {type:'collection',groupId:'default',ttl:'1h',collector:{type:'rest',conf:{
  discovery:{discoverType:'none'},collectUrl:JSON.stringify('https://api.datadoghq.com'+path),collectMethod:'get',
  collectRequestHeaders:[{name:'DD-API-KEY',value:"C.Secret('DD_API_KEY', 'text', 'secrets-datadog').value"},
   {name:'DD-APPLICATION-KEY',value:"C.Secret('dd-application-key', 'text', 'secrets-datadog').value"}],
  authentication:'none',pagination:{type:'none'},timeout:20,rejectUnauthorized:true,
  retryRules:{type:'backoff',interval:1000,multiplier:2,maxIntervalMs:8000,limit:2,codes:[429,500,502,503,504],enableHeader:true},
 }},input:{type:'collection',breakerRulesets:['ifood_datadog_api_json'],sendToRoutes:false,pipeline:'passthru',output:'devnull'},
 run:{mode:'preview',expression:'true',logLevel:'info',jobTimeout:'45s',capture:{duration:25,maxEvents:1,level:0}}};
}
export function capturedResponse(text:string,id:string,path:string):unknown {
 const events=text.split('\n').filter(s=>s.trim()).map(s=>JSON.parse(s) as Record<string,unknown>);
 const expected=new URL(path,'https://api.datadoghq.com');
 // Stream's source field identifies the endpoint without its query parameters.
 const matching=events.filter(e=>e.__inputId==='collection:'+id&&(e.source===expected.href||e.source===expected.origin+expected.pathname));
 if(matching.length!==1||typeof matching[0]._raw!=='string')throw Error('O Stream não capturou exatamente uma resposta para este job Datadog.');
 return JSON.parse(matching[0]._raw);
}
export function previewBatchRequest(paths:string[]){
 if(paths.length<1||paths.length>25||new Set(paths).size!==paths.length||paths.some(p=>!/^\/api\/v1\/(?:dashboard\/[a-zA-Z0-9-]+|notebooks\/[1-9]\d*)$/.test(p)))throw Error('Lote de definições Datadog não permitido.');
 paths.forEach(validateDatadogPath);const base=previewRequest(paths[0]);
 return {...base,collector:{...base.collector,conf:{...base.collector.conf,
  discovery:{discoverType:'list',itemList:paths},collectUrl:"'https://api.datadoghq.com' + id"}},
  run:{...base.run,capture:{...base.run.capture,maxEvents:paths.length}}};
}
export async function readCapture(response:Response,id:string,paths:string[]):Promise<string>{
 if(!response.body)throw Error('A captura do Stream retornou uma resposta sem conteúdo.');
 const reader=response.body.getReader(),decoder=new TextDecoder(),lines:string[]=[],seen=new Set<string>();let pending='';
 const accept=(line:string)=>{
  if(!line.trim())return;const event=JSON.parse(line) as Record<string,unknown>;lines.push(line);
  if(event.__inputId==='collection:'+id&&typeof event.source==='string'){
   const path=paths.find(p=>{const u=new URL(p,'https://api.datadoghq.com');return event.source===u.href||event.source===u.origin+u.pathname;});
   if(path)seen.add(path);
  }
 };
 try{
  for(;;){const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});
   let boundary:number;while((boundary=pending.indexOf('\n'))>=0){accept(pending.slice(0,boundary));pending=pending.slice(boundary+1);}
   if(done){accept(pending);break;}
   // Multi-Worker captures otherwise stay open for their full duration even after all responses arrive.
   if(seen.size===paths.length)break;
  }
  return lines.join('\n');
 }finally{await reader.cancel().catch(()=>{});}
}
const wait=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
 if(signal.aborted){reject(signal.reason);return;}
 const abort=()=>{clearTimeout(timer);reject(signal.reason);};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});
});
function failure(status:Record<string,unknown>):Error {
 // Do not surface raw job logs, headers, stack traces or upstream response bodies.
 const reason=status.reason as {message?:string;reason?:{message?:string}}|undefined;
 const message=[reason?.message,reason?.reason?.message].filter(Boolean).join(' ');
 const code=message.match(/(?:status(?:Code)?|HTTP)[\s:=]+(401|403|404|429|5\d\d)/i)?.[1];
 return Error(`O Preview Datadog via Stream ${status.state==='failed'?'falhou':'foi cancelado'}${code?' (origem: HTTP '+code+')':''}. Verifique o acesso às secrets, o deploy do Worker Group e as permissões Datadog no Job Inspector.`);
}
export function upstreamCode(text:string):string|undefined{return text.match(/(?:status(?:Code)?|HTTP(?: status)?|status code)[\s:="']+(400|401|403|404|429|500|502|503|504)/i)?.[1];}
export async function streamDatadogGet(path:string,signal:AbortSignal):Promise<unknown> {
 return (await runDatadogPreview([path],signal))[0];
}
export async function streamDatadogGetMany(paths:string[],signal:AbortSignal):Promise<unknown[]> {
 previewBatchRequest(paths);return runDatadogPreview(paths,signal);
}
async function runDatadogPreview(paths:string[],signal:AbortSignal):Promise<unknown[]> {
 const body=paths.length===1?previewRequest(paths[0]):previewBatchRequest(paths),deadline=AbortSignal.any([signal,AbortSignal.timeout(55000)]),captureScope=new AbortController();
 let id:string|undefined,finished=false;
 try {
  const created=await (await request(jobs,deadline,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  id=created.items?.[0];if(typeof id!=='string'||!/^\d+\.[a-zA-Z0-9_.-]+$/.test(id))throw Error('O Stream não retornou um ID válido do job de Preview.');
  const jobPath=jobs+'/'+encodeURIComponent(id);
  const initial=await (await request(jobPath,deadline)).json();
  if(initial.items?.[0]?.status?.state!=='paused')throw Error('O Preview do Stream deve estar pausado antes de iniciar a captura.');
  const captureSignal=AbortSignal.any([deadline,captureScope.signal,AbortSignal.timeout(28000)]);
  const capture=request('/m/default/system/capture',captureSignal,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({duration:25,maxEvents:paths.length,level:0,filter:'__inputId === '+JSON.stringify('collection:'+id)})})
   .then(r=>readCapture(r,id!,paths)).then(text=>({text})).catch(error=>({error}));
  // The capture API streams headers only after data arrives. Register capture before resuming the paused job.
  await wait(1000,deadline);
  await request(jobPath+'/resume',deadline,{method:'PATCH'});
  for(let attempt=0;attempt<100;attempt++){
   const info=await (await request(jobPath,deadline)).json(),status=info.items?.[0]?.status as Record<string,unknown>|undefined;
   if(!status)throw Error('Status do job Stream incompatível.');
   if(status.state==='finished'){
    if(info.items[0].stats?.tasks?.failed>0||info.items[0].stats?.collectedEvents!==paths.length){
     const code=await request(jobPath+'/errors',deadline).then(r=>r.text()).then(upstreamCode).catch(()=>undefined);
     throw Error('O Preview do Stream terminou sem uma resposta válida por endpoint solicitado.'+(code?' Origem: HTTP '+code+'.':''));
    }
    finished=true;break;
   }
   if(['failed','cancelled','canceled'].includes(String(status.state)))throw failure(status);
   if(attempt===99)throw Error('A espera pelo Preview do Stream excedeu o limite.');
   await wait(250,deadline);
  }
  const captured=await capture;if('error' in captured)throw Error('A captura do Stream falhou; isso não representa um resultado vazio do Datadog.');
  return paths.map(path=>capturedResponse(captured.text,id!,path));
 } catch(e) {
  if(signal.aborted)throw e;
  if(deadline.aborted)throw Error('A verificação Datadog via Stream excedeu o prazo; cobertura não verificada.');
  throw e;
 } finally {
  captureScope.abort();
  if(id&&!finished)await request(jobs+'/'+encodeURIComponent(id)+'/cancel',AbortSignal.timeout(5000),{method:'PATCH'}).catch(()=>{});
 }
}

