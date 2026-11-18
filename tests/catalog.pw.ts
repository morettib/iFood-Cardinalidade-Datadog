import {test,expect,type Page} from '@playwright/test';
const metric='argo_rollouts_notification_send_bucket';
async function replay(page:Page){
 await page.addInitScript(()=>{window.CRIBL_API_URL=location.origin+'/api/v1';});const queries:string[]=[];let labelsCalls=0;
 let currentQuery='';await page.route('**/api/v1/**',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.pathname.includes('/kvstore/'))return route.fulfill({status:404,json:{}});
  if(u.pathname.endsWith('/metrics/summary'))return route.fulfill({json:{building:false,rows:[{name:metric,type:'counter',seriesCount:182400,cardBand:'high',usage:'unused',rec:{kind:'deprecate'}},{name:'cpu_gauge',type:'gauge',seriesCount:10,cardBand:'low'}]}});
  if(u.pathname.endsWith('/metadata'))return route.fulfill({json:{status:'success',data:{[metric]:[{type:'counter'}],outside_window:[{type:'gauge'}]}}});
  if(u.pathname.endsWith('/labels')){labelsCalls++;return route.fulfill({json:{labels:u.searchParams.has('key')?[{key:'argo_rollouts_name',topValues:[{value:'account-api',seriesCount:245}]}]:[{key:'argo_rollouts_name',distinct:1209,topValues:[]},{key:'host',distinct:30,topValues:[]},{key:'upper_bound',distinct:5,topValues:[]}]}});}
  if(u.pathname.endsWith('/query')){const q=u.searchParams.get('query')!;queries.push(q);return route.fulfill({json:{status:'success',data:{resultType:'vector',result:[{metric:{},value:[1,q.includes('without')?'106050':'182400']}]}}});}
  if(req.method()==='POST'&&u.pathname.endsWith('/search/jobs')){currentQuery=req.postDataJSON().query;return route.fulfill({json:{id:'catalog-job'}});}
  if(u.pathname.endsWith('/status'))return route.fulfill({json:{status:'completed'}});
  if(u.pathname.endsWith('/results-poll'))return route.fulfill({body:JSON.stringify({isFinished:true,items:u.searchParams.get('offset')==='0'&&currentQuery.includes('ifood_datadog')?[{metric:'argo_rollouts.notification.send.bucket'}]:[]})});
  return route.fulfill({status:404,json:{}});
 });await page.goto('/');return {queries,labelCalls:()=>labelsCalls};
}
test('native metric inventory, lazy label values and server joint simulation preserve histogram bounds',async({page})=>{
 const calls=await replay(page);await expect(page.getByRole('heading',{name:'Onde investigar primeiro?'})).toBeVisible();await expect(page.getByRole('heading',{name:'Pods',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Carregar inventário'}).click();await page.getByLabel('Buscar métrica, serviço ou equipe').fill(metric);
 await expect(page.locator('.catalog-table').first().getByRole('row')).toHaveCount(2);await page.getByRole('button',{name:'Investigar',exact:true}).click();
 const panel=page.getByRole('region',{name:'Diagnóstico da métrica'});await expect(panel.getByRole('heading',{name:metric,exact:true})).toBeVisible();await expect(panel.getByText('upper_bound',{exact:true})).toBeVisible();
 const initialLabels=calls.labelCalls();expect(initialLabels).toBeGreaterThanOrEqual(1);await expect(panel.getByRole('checkbox')).toHaveCount(1);const row=panel.getByRole('row').filter({has:page.getByRole('rowheader',{name:'argo_rollouts_name',exact:true})});
 await row.getByRole('button',{name:'Ver valores'}).click();await expect(row).toContainText('account-api');await expect(row).toContainText('1.209');expect(calls.labelCalls()).toBe(initialLabels+1);
 await row.getByRole('checkbox').check();await panel.getByRole('button',{name:'Simular conjunto selecionado'}).click();await expect(panel.locator('.simulation-result')).toContainText('182.400 → 106.050');
 expect(calls.queries).toHaveLength(2);expect(calls.queries.every(q=>q.startsWith('count('))).toBe(true);expect(calls.queries[1]).toContain('without (argo_rollouts_name)');await expect(panel).toContainText('Uso não verificado');
 await panel.getByRole('button',{name:'Buscar nome original no Lake'}).click();await expect(panel.getByLabel('Nome exato no Datadog')).toHaveValue('argo_rollouts.notification.send.bucket');
 const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Exportar análise e revisão'}).click();expect((await download).suggestedFilename()).toContain(metric);
 await page.setViewportSize({width:420,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/screenshots/catalog-native-mobile.png',fullPage:true});
});
test('catalog does not present local unused status as Datadog permission to drop metrics',async({page})=>{
 await replay(page);await page.getByRole('button',{name:'Carregar inventário'}).click();await expect(page.getByText('deprecate',{exact:true})).toHaveCount(0);
 await page.getByLabel('Buscar métrica, serviço ou equipe').fill('outside_window');await expect(page.getByText('Sem contagem nesta janela')).toBeVisible();await expect(page.getByRole('link',{name:'Kubernetes · abrir app separado'})).toHaveCount(0);
});
