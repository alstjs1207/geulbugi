import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const submission=JSON.parse(await readFile('store/submission.json','utf8')),manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
const fail=message=>{throw new Error(message);};
if(submission.version!==manifest.version)fail('Store and installable package versions differ');
if(submission.name!==manifest.name)fail('Store and installable package names differ');
if(!submission.publisherName||!/^\S+@\S+\.\S+$/.test(submission.supportEmail??''))fail('Publisher name and support email are required');
const assets=[{path:submission.assets.icon,width:128,height:128},{path:submission.assets.smallPromo,width:440,height:280},...submission.assets.screenshots.map(path=>({path,width:1280,height:800}))];
if(submission.assets.screenshots.length<1||submission.assets.screenshots.length>5)fail('Expected 1–5 screenshots');
for(const asset of assets){
 const file=resolve('store',asset.path);if(!file.startsWith(resolve('store')+'/'))fail('Unsafe store asset path');
 const bytes=await readFile(file);
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==asset.width||bytes.readUInt32BE(20)!==asset.height)fail('Invalid PNG dimensions: '+asset.path);
}
const policy=await readFile('store/site/privacy.html','utf8');
if(policy!==await readFile('dist/privacy.html','utf8'))fail('Hosted policy source differs from bundled policy');
if(!policy.includes(submission.publisherName)||!policy.includes('mailto:'+submission.supportEmail))fail('Policy contact details differ from submission');
for(const file of ['listing-ko.txt','privacy-fields-ko.txt','reviewer-instructions-ko.txt'])if((await readFile('store/'+file,'utf8')).length<100)fail('Store document is incomplete: '+file);
const draft=process.argv.includes('--draft');
if(!draft&&(submission.privacyPolicyAccess!=='public'||!/^https:\/\//.test(submission.privacyPolicyUrl??'')))fail('Privacy policy is not publicly accessible yet. Complete the public-access step before store submission.');
if(!draft){
 const response=await fetch(submission.privacyPolicyUrl,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)fail('Anonymous privacy policy request failed: '+response.status);
 const text=await response.text();
 if(!text.includes('<h1>개인정보처리방침</h1>')||!text.includes(submission.publisherName)||!text.includes('mailto:'+submission.supportEmail))fail('Anonymous visitors cannot read the complete privacy policy');
}
const zip=await readFile('artifacts/geulbugi-'+manifest.version+'.zip');
console.log(JSON.stringify({version:manifest.version,draft,assets:assets.length,privacyPolicyAccess:submission.privacyPolicyAccess??'unconfigured',zipSha256:createHash('sha256').update(zip).digest('hex'),privacyPolicySha256:createHash('sha256').update(policy).digest('hex')},null,2));
