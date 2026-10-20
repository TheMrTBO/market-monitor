// Fichiers générés (config/storage.toml [generated]) : publiés sans être versionnés, absents d'un dépôt fraîchement extrait
// (CI). Les tests lisent à leur place une copie figée, tests/fixtures/ (mêmes noms) : résultat identique en local et en CI.
// Rafraîchir la copie (après un changement de format de fetch_industries.py) : python tests/make_fixtures.py.
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..','..'), FIX=path.join(ROOT,'tests','fixtures');
const sec=fs.readFileSync(path.join(ROOT,'config','storage.toml'),'utf8').split(/^\[generated\]/m)[1].split(/^\[/m)[0];
const list=k=>JSON.parse(sec.match(new RegExp('^'+k+'\\s*=\\s*(\\[.*\\])','m'))[1]);
const files=list('files'), dirs=list('dirs');
const gen=p=>{ if(typeof p!=='string')return p;
  const r=path.relative(ROOT,path.resolve(p)).split(path.sep).join('/');
  return files.includes(r)||dirs.some(d=>r.startsWith(d+'/'))?path.join(FIX,r):p; };
const read=fs.readFileSync, exists=fs.existsSync;
fs.readFileSync=(p,...a)=>read.call(fs,gen(p),...a);
fs.existsSync=p=>exists.call(fs,gen(p));
