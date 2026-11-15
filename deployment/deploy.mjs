// Direct Cloudflare API deployment. No credentials are stored in source.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const supabase=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!account||!token||!supabase||!key)throw new Error('Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
const name='helpyy',root='artifacts/helpay/dist/public',manifest={},files={};
async function api(route,method='GET',body,auth=token){
 const form=body instanceof FormData;
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${route}`,{method,headers:{Authorization:`Bearer ${auth}`,...(form?{}:{'Content-Type':'application/json'})},body:body?(form?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(60000)});
 const data=await response.json();if(!response.ok||data.success===false)throw new Error(`Cloudflare ${method} ${route}: ${response.status} ${JSON.stringify(data.errors)}`);return data.result;
}
for(const rel of fs.readdirSync(root,{recursive:true})){
 const file=path.join(root,rel);if(!fs.statSync(file).isFile())continue;
 const bytes=fs.readFileSync(file),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,32);
 manifest['/'+rel.replaceAll('\\','/')]={hash,size:bytes.length};files[hash]={bytes,ext:path.extname(file)};
}
const session=await api(`workers/scripts/${name}/assets-upload-session`,'POST',{manifest});let completed=session.jwt;
for(const bucket of session.buckets){const form=new FormData();for(const hash of bucket){const f=files[hash];form.append(hash,new Blob([f.bytes.toString('base64')],{type:{'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.txt':'text/plain'}[f.ext]||'application/octet-stream'}),hash);}const result=await api('workers/assets/upload?base64=true','POST',form,session.jwt);if(result.jwt)completed=result.jwt;}
const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-15',assets:{jwt:completed,config:{not_found_handling:'single-page-application',run_worker_first:['/api/*']}},bindings:[{type:'assets',name:'ASSETS'},{type:'plain_text',name:'SUPABASE_URL',text:supabase},{type:'plain_text',name:'SUPABASE_PUBLISHABLE_KEY',text:key}]})],{type:'application/json'}));
for(const f of ['worker.mjs','catalog.mjs'])form.append(f,new Blob([fs.readFileSync('deployment/'+f)],{type:'application/javascript+module'}),f);
const result=await api(`workers/scripts/${name}`,'PUT',form);
await api(`workers/scripts/${name}/subdomain`,'POST',{enabled:true,previews_enabled:false});
console.log('Deployed worker:',name,'deployment:',result.deployment_id);
