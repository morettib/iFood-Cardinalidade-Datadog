import {cp,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'..'),target=resolve(root,'../ifood-kubernetes-telemetry');if(dirname(target)!==dirname(root))throw Error('Invalid target');
for(const name of await readdir(join(root,'tests')))if(name.endsWith('.json'))await cp(join(root,'tests',name),join(target,'tests',name));
for(const name of ['pods.pw.ts','refresh.pw.ts']){const file=join(root,'tests',name);let text=await readFile(file,'utf8');text=text.replaceAll("await page.getByRole('button',{name:'Pods · telemetria preservada',exact:true}).click();",'');await writeFile(file,text);await rename(file,join(target,'tests',name));}
const config=(await readFile(join(root,'tests/browser.config.ts'),'utf8')).replaceAll('5187','5188');await writeFile(join(target,'tests/browser.config.ts'),config);
const pkg=JSON.parse(await readFile(join(target,'package.json'),'utf8'));pkg.scripts['test:ui']='playwright test --config tests/browser.config.ts';await writeFile(join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
for(const name of ['i18n.tsx','translations.ts'])await cp(join(root,'src',name),join(target,'src',name));
await writeFile(join(target,'src/navigation.css'),`.workspace-nav{display:flex;gap:token('spacing.md');padding:token('spacing.md');align-items:center;flex-wrap:wrap}.workspace-nav label{margin-left:auto}.workspace-nav a{color:token('color.text.accent.default')}\n`);
const main=await readFile(join(target,'src/main.tsx'),'utf8');await writeFile(join(target,'src/main.tsx'),main.replace("import './style.css';","import './style.css';\nimport './navigation.css';"));
await writeFile(join(target,'tests/test-catalog.yaml'),'tests:\n  - id: ifood-pods-independent-app\n    command: npm test\n    acceptance: CPU, uptime, identity, event correlation, incomplete data and query failures retain their original semantics in the separate Kubernetes app.\n  - id: ifood-pods-browser-regressions\n    command: npm run test:ui\n    acceptance: Original Pods dark/mobile view, source variants, relative refresh, rapid selection and failed/empty states work in the independent app.\n');
console.log('Migrated Pods browser tests and fixtures; independent app has only Search/metrics permissions.');
