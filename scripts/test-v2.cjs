// Browser tests use the local app at http://127.0.0.1:8080 (npm start).
const {spawnSync}=require('node:child_process');
const {readdirSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of readdirSync(path.join(root,'tests')).filter(n=>/^v2-.*\.cjs$/.test(n)).sort()) {
  const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
