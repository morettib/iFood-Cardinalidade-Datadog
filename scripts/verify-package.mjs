import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=join(import.meta.dirname,'..');
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const archive=join(root,'build',`${pkg.name}-${pkg.version}.tgz`);
const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split(/\r?\n/);
if(names.some(n=>/node_modules|tests\/|ifood-audit|config\.toml|\.env|\.map$/.test(n))) throw Error('Unexpected package content');
for(const name of names.filter(n=>/\.(json|md|yml|html|js|css)$/.test(n))) {
  const text=execFileSync('tar',['-xOf',archive,name],{encoding:'utf8',maxBuffer:10*1024*1024});
  if(/Bearer\s+eyJ|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text)) throw Error('Credential-like content detected');
}
const metadata=JSON.parse(execFileSync('tar',['-xOf',archive,'./package.json'],{encoding:'utf8'}));
if(metadata.name!==pkg.name||metadata.version!==pkg.version) throw Error('Metadata mismatch');
for(const required of ['./default/policies.yml','./README.md','./IMPLEMENTATION-NOTES.md','./static/index.html']) if(!names.includes(required)) throw Error(`Missing ${required}`);
const [major,minor,patch]=metadata.version.split('.').map(Number);
const streamMode=major>0||minor>2||(minor===2&&patch>=2);
if(metadata.version.startsWith('0.2.')&&!streamMode){
  if(!names.includes('./default/proxies.yml'))throw Error('Missing Datadog server-side proxy declaration');
  const proxy=execFileSync('tar',['-xOf',archive,'./default/proxies.yml'],{encoding:'utf8'});
  if(!proxy.includes('api.datadoghq.com:')||!proxy.includes('DD-API-KEY: kv.datadogApiKey')||!proxy.includes('DD-APPLICATION-KEY: kv.datadogAppKey'))throw Error('Invalid server-side Datadog credential references');
}
if(streamMode){
 const proxy=execFileSync('tar',['-xOf',archive,'./default/proxies.yml'],{encoding:'utf8'});
 if(proxy.includes('kv.datadog')||proxy.includes('api.datadoghq.com:'))throw Error('Obsolete Datadog App proxy bundled');
 const policy=execFileSync('tar',['-xOf',archive,'./default/policies.yml'],{encoding:'utf8'});
 for(const required of ['/m/default/jobs','/m/default/system/capture'])if(!policy.includes(required))throw Error('Missing Stream Preview permission');
}
console.log(JSON.stringify({archive,version:metadata.version,files:names.length,sha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),checks:'metadata, policy, documentation, credential-pattern and payload exclusion checks passed'},null,2));
