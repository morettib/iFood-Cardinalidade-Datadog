import {test,expect,type Page} from '@playwright/test';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {parseLake,scoped,simulate} from '../src/cardinality';
const metric='istio.mesh.request.duration.milliseconds';
const privatePath=join(process.env.USERPROFILE||'C:/Users/BrunnoMoretti','tmp/ifood-audit/card-lake-groups.json');
const hasReal=existsSync(privatePath);
const groups=hasReal?JSON.parse(readFileSync(privatePath,'utf8')).filter((r:{metric:string})=>r.metric===metric):[{metric,host:'h',tags_json:'["env:sandbox","kube_namespace:search-platform","pod_name:a"]',records:1,first:1794495720,last:1794496199},{metric,host:'h',tags_json:'["env:sandbox","kube_namespace:search-platform","pod_name:b"]',records:1,first:1794495720,last:1794496199}];
const screenshots=join(import.meta.dirname,'../docs/screenshots');mkdirSync(screenshots,{recursive:true});
async function replay(page:Page,mode='blocked'){
 const lakeGroups=mode==='correlated'?Array.from({length:125},(_,i)=>({metric,host:'h',tags_json:JSON.stringify(['pod_name:p'+i,'image_id:i'+i,'service:one']),records:1,first:1794495720,last:1794496199})):mode==='comparison'?groups.filter((r:{metric:string})=>r.metric===metric):mode==='partialLake'?[...groups,groups[0]]:groups;
 await page.addInitScript(()=>{window.CRIBL_API_URL=location.origin+'/api/v1';});
 const streamJobs=new Map<string,{paths:string[];state:string}>();let sequence=0;
 const kv=new Map<string,string>();let changed=false;
 await page.route('**/api/v1/**',async route=>{const r=route.request(),u=new URL(r.url());
  if(u.pathname.includes('/kvstore/')){if(!u.pathname.includes('/preferences/')&&mode!=='cache'&&mode!=='comparison')return route.fulfill({status:404,json:{}});if(r.method()==='PUT'){expect(r.headers()['content-type']).toContain('text/plain');kv.set(u.pathname,r.postData()!);return route.fulfill({body:''});}return kv.has(u.pathname)?route.fulfill({body:kv.get(u.pathname)!}):route.fulfill({status:404,json:{}});}
  if(u.pathname.endsWith('/m/default/jobs')&&r.method()==='POST'){
   const body=r.postDataJSON(),id='1794599758.'+(++sequence)+'.adhoc.test';
   const url=body.collector.conf.discovery?.itemList?undefined:new URL(JSON.parse(body.collector.conf.collectUrl));
   streamJobs.set(id,{paths:body.collector.conf.discovery?.itemList||[url!.pathname+url!.search],state:'paused'});return route.fulfill({json:{items:[id]}});
  }
  if(u.pathname.endsWith('/system/capture')){
   const id=JSON.parse(r.postDataJSON().filter.split(' === ')[1]).slice('collection:'.length),job=streamJobs.get(id)!;
   const events=job.paths.map(path=>{
    const url=new URL(path,'https://api.datadoghq.com');const offset=Number(url.searchParams.get('start')),page=Number(url.searchParams.get('page'));
    const raw=path.includes('active-configurations')?{data:{id:metric,attributes:{active_tags:mode==='dependency'?['pod_name']:[]}}}:path.includes('/monitor')?(mode==='completePages'?Array.from({length:Math.max(0,Math.min(100,350-page*100))},(_,i)=>({id:page*100+i,query:'avg:other{*}'})):mode==='dependency'?[{id:42,name:'Latency by pod',query:'p95:'+metric+'{env:sandbox} by {pod_name}'}]:[]):path.includes('/dashboard?')?{dashboards:mode==='completePages'?Array.from({length:Math.max(0,Math.min(100,125-offset))},(_,i)=>({id:String(offset+i)})):mode==='incomplete'?Array.from({length:21},(_,i)=>({id:String(i)})):[],...(mode==='incomplete'?{total:25}:mode==='completePages'?{total:125}:{})}:{widgets:[],template_variables:[]};
    const payload=url.pathname==='/api/v1/notebooks'?{data:[],meta:{page:{total_count:0}}}:url.pathname==='/api/v1/slo'?{data:[]}:url.pathname.endsWith('/tags')?{data:{id:metric,type:'manage_tags',attributes:{tags:['pod_name'],metric_type:'distribution',exclude_tags_mode:false}}}:mode==='comparison'&&url.pathname.endsWith('/volumes')?{data:{id:metric,type:'distinct_metric_volumes',attributes:{distinct_volume:33087}}}:mode==='comparison'&&url.pathname.endsWith('/estimate')?{data:{id:metric,type:'metric_cardinality_estimate',attributes:{estimated_output_series:url.searchParams.get('filter[groups]')?.includes('pod_name')?100:80,estimate_type:'distribution',estimated_at:new Date().toISOString()}}}:mode==='cache'&&url.pathname==='/api/v1/dashboard'?{total:2,dashboards:[{id:'same',modified_at:'2026-11-13T00:00:00Z'},{id:'change',modified_at:changed?'2026-11-13T01:00:00Z':'2026-11-13T00:00:00Z'}]}:raw;
    return JSON.stringify({__inputId:'collection:'+id,source:'https://api.datadoghq.com'+path.split('?')[0],_raw:JSON.stringify(payload)});
   });return route.fulfill({body:events.join('\n')});
  }
  if(u.pathname.includes('/m/default/jobs/')){
   const parts=u.pathname.split('/'),id=parts[parts.indexOf('jobs')+1],job=streamJobs.get(id)!;
   if(u.pathname.endsWith('/resume')){job.state=mode==='blocked'||mode==='missingAppKey'?'failed':'finished';return route.fulfill({json:{items:[{state:job.state}]}});}
   if(u.pathname.endsWith('/cancel'))return route.fulfill({json:{items:[]}});
   return route.fulfill({json:{items:[{status:{state:job.state,reason:{message:'statusCode: 403'}},stats:{tasks:{failed:0},collectedEvents:job.paths.length}}]}});
  }
  if(r.method()==='POST'&&u.pathname.endsWith('/jobs'))return mode==='failedLake'?route.fulfill({status:400,body:''}):route.fulfill({json:{id:'lake-cardinality'}});
  if(u.pathname.endsWith('/results-poll')){const offset=Number(u.searchParams.get('offset'));return route.fulfill({body:JSON.stringify({isFinished:true,job:{status:'completed'},totalEventCount:lakeGroups.length,items:lakeGroups.slice(offset,offset+1000)})});}
  return route.fulfill({json:{status:'completed'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Analisar distribuições',exact:true}).click();await page.evaluate(real=>{const b=document.createElement('div');b.textContent=real?'LOCAL REPLAY · real MCP Lake measurement · mocked Datadog evidence · not installed proxy':'LOCAL SYNTHETIC REPLAY · not tenant data';b.style.cssText='padding:8px;background:#19283a;color:#b8d9ff;font:11px system-ui;text-align:center';document.body.prepend(b);},hasReal);
 return {streamJobs,change:()=>{changed=true;}};
}
const analyze=(page:Page)=>page.locator('main').getByRole('button',{name:'Analisar cardinalidade',exact:true});
test('125 unchanged individual combinations show distinct tag values and JSON-byte effects while joint removal is recalculated',async({page})=>{
 await replay(page,'correlated');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Nenhum uso observado no escopo verificado');const inventory=page.getByRole('region',{name:'Lista de uso das tags'});
 const pod=inventory.getByRole('row').filter({has:page.getByRole('rowheader',{name:/^pod_name/})});await expect(pod).toContainText('125 valores distintos da tag');await expect(pod).toContainText('Sem redução de combinações');await expect(pod).toContainText('125 → 125');await expect(pod).toContainText('bytes JSON de tags a menos');
 await inventory.getByRole('row').filter({has:page.getByRole('rowheader',{name:/^image_id/})}).getByRole('button',{name:'Adicionar à seleção',exact:true}).click();await expect(inventory.getByRole('region',{name:'Simulação conjunta'})).toContainText('125 → 1 combinações');await expect(pod).toContainText('125 → 125');
});
test('PT-BR EN preference preserves current selection and evidence without starting new jobs',async({page})=>{
 const fixture=await replay(page,'clear');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Nenhum uso observado no escopo verificado');const jobs=fixture.streamJobs.size;
 await page.getByLabel('Idioma / Language').selectOption('en');await expect(page.getByRole('heading',{name:'Analyze cardinality',exact:true})).toBeVisible();await expect(page.locator('.status-word')).toHaveText('No usage observed in the checked scope');await expect(page.getByRole('button',{name:'Deselect pod_name',exact:true})).toBeVisible();expect(fixture.streamJobs.size).toBe(jobs);
 await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('heading',{name:'1 · Opportunities with no observed usage',exact:true})).toBeVisible();
 await page.screenshot({path:join(screenshots,'opportunities-english.png'),fullPage:true});
 await page.reload();await expect(page.getByLabel('Idioma / Language')).toHaveValue('en');await page.getByRole('button',{name:'Analyze distributions',exact:true}).click();await expect(page.getByRole('heading',{name:'Analyze cardinality',exact:true})).toBeVisible();
 await page.getByLabel('Idioma / Language').selectOption('pt-BR');await expect(page.getByRole('heading',{name:'Analisar cardinalidade',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','pt-BR');
});
test('dependency scenarios are excluded from the primary opportunity ranking and pending is kept separate',async({page})=>{
 await replay(page,'dependency');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Dependência encontrada');const ranking=page.getByRole('region',{name:'Oportunidades sem uso observado'});
 await expect(ranking.locator(':scope > .rank-list')).not.toContainText('pod_name');await ranking.locator('details').filter({has:page.getByText(/Com dependências no Datadog ·/)}).locator('summary').click();await expect(ranking.getByRole('button').filter({hasText:'pod_name'}).first()).toBeVisible();
 await expect(page.getByText('A seleção contém tags utilizadas no Datadog. O impacto mostrado não é uma oportunidade de remoção.',{exact:true})).toBeVisible();
 await page.unrouteAll({behavior:'wait'});await replay(page,'incomplete');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Uso não verificado');await expect(ranking.getByText('Nenhuma oportunidade confirmada nesta verificação. Tags com dependências ou cobertura pendente não entram neste ranking.',{exact:true})).toBeVisible();await expect(ranking.locator(':scope > .rank-list')).toHaveCount(0);
});
test('tag selections accumulate, survive filters and recalculate exact joint impact',async({page})=>{
 await replay(page,'clear');await startAnalysis(page);
 const inventory=page.getByRole('region',{name:'Lista de uso das tags'}),joint=inventory.getByRole('region',{name:'Simulação conjunta'});
 await inventory.getByRole('button',{name:'Limpar seleção',exact:true}).click();
 await inventory.getByLabel('Buscar tag').fill('pod_name');await inventory.getByRole('button',{name:'Adicionar à seleção',exact:true}).click();
 await inventory.getByLabel('Buscar tag').fill('ifood_requester_service');await inventory.getByRole('button',{name:'Adicionar à seleção',exact:true}).click();
 await expect(inventory.getByRole('button',{name:'Desmarcar pod_name',exact:true})).toBeVisible();await expect(inventory.getByRole('button',{name:'Desmarcar ifood_requester_service',exact:true})).toBeVisible();
 const impact=simulate(scoped(parseLake(groups).rows,metric),['pod_name','ifood_requester_service']),n=(v:number)=>v.toLocaleString('pt-BR',{maximumFractionDigits:2});
 await expect(joint).toContainText(`${n(impact.before)} → ${n(impact.after)} combinações · redução conjunta de ${n(impact.reduction)} (${n(impact.percent)}%)`);
 await inventory.getByLabel('Mostrar').selectOption('used');await expect(joint).toContainText('Seleção acumulada · 2 tags');
 await inventory.getByRole('button',{name:'Desmarcar pod_name',exact:true}).click();await expect(joint).toContainText('Seleção acumulada · 1 tags');await expect(inventory.getByRole('button',{name:'Desmarcar ifood_requester_service',exact:true})).toBeVisible();
 await inventory.getByRole('button',{name:'Limpar seleção',exact:true}).click();await expect(joint).toContainText('redução conjunta de 0 (0%)');
});
test('visible tag inventory distinguishes verified unused tags, pending coverage and dependencies',async({page})=>{
 await replay(page,'incomplete');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Uso não verificado');
 const inventory=page.getByRole('region',{name:'Lista de uso das tags'});
 await inventory.getByLabel('Mostrar').selectOption('pending');await inventory.getByLabel('Buscar tag').fill('pod_name');await expect(inventory.getByRole('row').filter({has:page.getByRole('rowheader',{name:/^pod_name\b/})})).toContainText('Sem referência encontrada · pendente');
 await inventory.getByLabel('Mostrar').selectOption('unused');await expect(inventory.getByText('Nenhuma tag nesta categoria.',{exact:false})).toBeVisible();
 await page.unrouteAll({behavior:'wait'});await replay(page,'clear');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Nenhum uso observado no escopo verificado');
 await inventory.getByLabel('Buscar tag').fill('pod_name');await inventory.getByLabel('Mostrar').selectOption('unused');await expect(inventory.getByRole('rowheader',{name:/^pod_name\b/})).toBeVisible();await expect(inventory).toContainText('Sem uso observado · verificado');
 await inventory.getByRole('button',{name:'Limpar seleção',exact:true}).click();await inventory.getByRole('button',{name:'Adicionar à seleção',exact:true}).click();await expect(page.getByText('Escolher tags personalizadas · pod_name',{exact:true})).toBeVisible();
 await page.unrouteAll({behavior:'wait'});await replay(page,'dependency');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Dependência encontrada');
 await inventory.getByLabel('Buscar tag').fill('pod_name');await inventory.getByLabel('Mostrar').selectOption('used');await expect(inventory.getByRole('rowheader',{name:/^pod_name\b/})).toBeVisible();await inventory.locator('summary').click();await expect(inventory.getByRole('link',{name:'Latency by pod',exact:true})).toBeVisible();
 await page.screenshot({path:join(screenshots,'visible-tag-usage-inventory.png'),fullPage:true});
});
test('one-hour Datadog versus Lakehouse comparison distinguishes observed, estimated and real ingestion',async({page})=>{
 await replay(page,'comparison');await analyze(page).click();await expect(page.locator('.analysis-stats').first()).toBeVisible({timeout:20000});await page.getByRole('button',{name:'Comparar última hora',exact:true}).click();const panel=page.getByRole('region',{name:'Comparação de cardinalidade'});
 await expect(panel.getByText('33.087',{exact:true})).toBeVisible({timeout:20000});await expect(panel).toContainText('Antes: 100 · Depois: 80 · Redução estimada: 20 séries');await expect(panel).toContainText('Não é uma medição de bytes de saída');await expect(panel).toContainText('Comparação salva no KV do app.');await page.screenshot({path:join(screenshots,'datadog-lakehouse-cardinality-comparison.png'),fullPage:true});
 await page.reload();await page.getByRole('button',{name:'Analisar distribuições',exact:true}).click();await analyze(page).click();await expect(page.getByRole('region',{name:'Comparação de cardinalidade'})).toContainText('resultado histórico',{timeout:10000});
 await expect(page.getByText(/Validar uma comparação antes\/depois na mesma janela/)).toBeVisible();
 await page.getByRole('button',{name:'Usar última hora',exact:true}).click();await expect(page.locator('.analysis-stats')).toHaveCount(0);
 const start=await page.getByLabel('Início · UTC').inputValue(),end=await page.getByLabel('Fim · UTC').inputValue();expect(Date.parse(end+'Z')-Date.parse(start+'Z')).toBe(3600000);
});
test('Portuguese usage history survives reload, avoids a rescan and rereads only changed dashboards',async({page})=>{
 const fixture=await replay(page,'cache');await analyze(page).click();await expect(page.getByText('Resultado salvo no KV do app.',{exact:true})).toBeVisible({timeout:20000});
 const initial=fixture.streamJobs.size;expect(initial).toBe(8);
 await page.reload();await page.getByRole('button',{name:'Analisar distribuições',exact:true}).click();await analyze(page).click();await expect(page.getByText(/Exibindo histórico/)).toBeVisible({timeout:20000});expect(fixture.streamJobs.size).toBe(initial);await expect(page.locator('.status-word')).toHaveText('Uso não verificado');
 await page.getByRole('button',{name:'Atualizar alterações',exact:true}).click();await expect(page.getByText('Resultado salvo no KV do app.',{exact:true})).toBeVisible({timeout:20000});expect(fixture.streamJobs.size).toBe(initial+7);
 fixture.change();await page.getByRole('button',{name:'Atualizar alterações',exact:true}).click();await expect(page.getByText('Resultado salvo no KV do app.',{exact:true})).toBeVisible({timeout:20000});expect([...fixture.streamJobs.values()].some(job=>JSON.stringify(job.paths)===JSON.stringify(['/api/v1/dashboard/change']))).toBe(true);
 await expect(page.getByText('Histórico de verificações · 3 resultados',{exact:true})).toBeVisible();expect(await page.locator('html').getAttribute('lang')).toBe('pt-BR');
 await page.screenshot({path:join(screenshots,'usage-history-portuguese.png'),fullPage:true});
});
async function startAnalysis(page:Page){
 await analyze(page).click();
 await expect(page.locator('.analysis-stats')).toBeVisible({timeout:20000});
 await expect(page.locator('.dependency-card')).toHaveCount(6,{timeout:15000});
}
test('real Lake measurement, blocked usage, narrow pilot, dark layout and rollback review',async({page})=>{
 await replay(page);await startAnalysis(page);await expect(page.locator('.analysis-stats')).toBeVisible();
 if(hasReal){await expect(page.locator('.analysis-stats article').first()).toContainText('3.296');await expect(page.locator('.simulation-result')).toContainText('3.169');await expect(page.locator('.rank-row').first()).toContainText('553');}
 await expect(page.locator('.status-word')).toHaveText('Uso não verificado');await expect(page.getByText('Candidato para revisão',{exact:true})).toHaveCount(0);
 await page.screenshot({path:join(screenshots,'cardinality-lake-usage-unverified.png'),fullPage:true});
 await page.getByRole('region',{name:'Oportunidades sem uso observado'}).locator('details').filter({has:page.getByText(/Verificação pendente ·/)}).locator('summary').click();await page.locator('.rank-row').first().click();await expect(page.locator('.simulation-result')).toBeVisible();
 await page.getByLabel('Escopo disponível').selectOption('kube_namespace:search-platform');await startAnalysis(page);await expect(page.locator('.analysis-stats')).toBeVisible();
 if(hasReal)await expect(page.locator('.analysis-stats article').first()).toContainText('199');
 await page.getByText('Rascunho da função Stream e local de aplicação',{exact:true}).click();await expect(page.locator('pre').filter({hasText:'"disabled": true'})).toContainText('sketch.tagsList');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar revisão do piloto'}).click();expect((await download).suggestedFilename()).toBe('ifood-cardinality-pilot-review.json');
 await page.setViewportSize({width:420,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:join(screenshots,'cardinality-narrow-mobile.png'),fullPage:true});
 await expect(page.getByRole('link',{name:'Kubernetes · abrir app separado',exact:true})).toHaveCount(0);
});
test('successful empty Datadog checks can yield a review candidate; dependency remains visible',async({page})=>{
 await replay(page,'clear');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Nenhum uso observado no escopo verificado');await expect(page.getByText('Candidato para revisão',{exact:true})).toHaveCount(0);
 await page.getByLabel('Escopo disponível').selectOption('kube_namespace:search-platform');await startAnalysis(page);await expect(page.getByText('Candidato para revisão',{exact:true})).toBeVisible();
 await page.screenshot({path:join(screenshots,'cardinality-mocked-no-usage.png'),fullPage:true});
 await page.unrouteAll({behavior:'wait'});await replay(page,'dependency');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Dependência encontrada');await page.locator('.dependency-card').filter({has:page.getByRole('heading',{name:'Monitores',exact:true})}).locator('summary').click();await expect(page.getByRole('link',{name:/Latency by pod/})).toBeVisible();await expect(page.locator('.analysis-stats article').last()).toContainText('Monitores: 1');await expect(page.getByRole('link',{name:'Ver dependências e itens pendentes'})).toHaveAttribute('href','#usage-details');
});
test('incomplete successful scans remain unverified',async({page})=>{
 await replay(page,'incomplete');await startAnalysis(page);await expect(page.locator('.status-word')).toHaveText('Uso não verificado');await expect(page.locator('.dependency-card').filter({has:page.getByRole('heading',{name:'Dashboards',exact:true})})).toContainText('cobertura incompleta');await expect(page.getByText('Candidato para revisão',{exact:true})).toHaveCount(0);
});
test('full pagination shows progress and completes beyond the previous monitor and dashboard caps',async({page})=>{
 await replay(page,'completePages');await analyze(page).click();
 const monitor=page.locator('.dependency-card').filter({has:page.getByRole('heading',{name:'Monitores',exact:true})});
 const dashboard=page.locator('.dependency-card').filter({has:page.getByRole('heading',{name:'Dashboards',exact:true})});
 await expect(dashboard).toContainText('Lendo todos os dashboards acessíveis',{timeout:20000});
 await expect(monitor).toContainText('350 definições/resultados verificados',{timeout:20000});
 await expect(dashboard).toContainText('125 definições/resultados verificados / 125 listados',{timeout:20000});
 await expect(dashboard).toContainText('escopo verificado completo');await expect(page.locator('.status-word')).toHaveText('Nenhum uso observado no escopo verificado');
});
test('partial Lake coverage cannot produce a review candidate even with successful Datadog checks',async({page})=>{
 await replay(page,'partialLake');await startAnalysis(page);await expect(page.locator('.active-window')).toContainText('parcial');await expect(page.locator('.status-word')).toHaveText('Nenhum uso observado no escopo verificado');await expect(page.getByText('Candidato para revisão',{exact:true})).toHaveCount(0);await expect(page.getByText(/1 grupos repetidos omitidos/)).toBeVisible();
});
test('failed Lake query stays distinct from successful empty data',async({page})=>{
 await replay(page,'failedLake');await analyze(page).click();await expect(page.getByRole('alert')).toContainText('HTTP 400');await expect(page.locator('.analysis-stats')).toHaveCount(0);await expect(page.getByText('Query completed successfully. No valid base sketches')).toHaveCount(0);
});
test('missing Application Key names the entry and leaves all three checks unverified',async({page})=>{
 await replay(page,'missingAppKey');await startAnalysis(page);
 await expect(page.locator('.status-word')).toHaveText('Uso não verificado');
 for(const card of await page.locator('.dependency-card').all())await expect(card).toContainText('O Preview Datadog via Stream falhou');
 await expect(page.getByText('Candidato para revisão',{exact:true})).toHaveCount(0);
});



