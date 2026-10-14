// Onglet Post-market : suivis (☆ dans la liste, étiquette + note dans la fiche, filtre « Suivis » toutes séances),
// stockage local « perso.suivis » au format synchronisable (trace de retrait).
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const SS={};
function boot(ls,pm,status){
  const L={},els={},DL={};let fillC='',strokeC='';const R={},Sx={},M={};
  const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):
    k==='fillRect'?(x,y,w,h)=>{(R[id]=R[id]||[]).push([fillC,x,y,w,h]);}:
    k==='moveTo'?(x,y)=>{(M[id]=M[id]||[]).push([x,y]);}:
    k==='stroke'?()=>{(Sx[id]=Sx[id]||{})[strokeC]=((Sx[id]||{})[strokeC]||0)+1;}:()=>{},
    set:(t,k,v)=>{if(k==='fillStyle')fillC=v;if(k==='strokeStyle')strokeC=v;return true;}});
  const mkEl=id=>({id,children:[],style:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},toggle(){}},className:'',_h:'',dataset:{},hidden:false,value:'',tagName:'DIV',
    set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
    setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
    parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:500,offsetWidth:100,scrollIntoView(){},
    getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:500,width:900,height:500}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
  const $=id=>els[id]||(els[id]=mkEl(id));
  let seq=0;
  const document={getElementById:$,createElement:()=>mkEl('n'+(++seq)),querySelector:()=>mkEl('w'),body:Object.assign(mkEl('body'),{dataset:{}}),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],
    addEventListener(e,f){(DL[e]=DL[e]||[]).push(f);}};
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(pm)sb.POSTMARKET=JSON.parse(JSON.stringify(pm));
  sb.STATUS=status||{updated:'2026-10-13T22:17:00+00:00',pm:'2026-10-13T22:17:00+00:00',sources:{}};sb.location={search:''};sb.clearTimeout=()=>{};sb.sessionStorage={getItem:k=>SS[k]??null,setItem:(k,v)=>{SS[k]=v;},removeItem:k=>{delete SS[k];}};
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}


let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const COLS=['t','s','n','sec','ind','c','ch','pc','pch','pv','rv','cap','flt','er','nx','ng'];
const row=(s,pch,pv,er,nx)=>['NASDAQ:'+s,s,s+' Inc.','Finance','Banks',10,1.5,+(10*(1+pch/100)).toFixed(2),pch,pv,1.2,2e9,5e7,er||'',nx??null,nx==null?null:0.5];
const dates=[];for(let i=0;i<70;i++){const d=new Date(Date.UTC(2026,6,1)+i*86400000);if(d.getUTCDay()%6)dates.push(d.toISOString().slice(0,10));}
const cut=dates.indexOf('2026-08-27')+1, D=dates.slice(0,cut);
const bars=n=>[0].concat(D.map((d,i)=>{const c=10+Math.sin(i/5)*n;return [c-0.2,c+0.4,c-0.5,c,100000+i];}));
const PM={cols:COLS,filters:{price:3,vol:100000,chg:4},
  snaps:[{d:'2026-08-26',at:'2026-08-27T00:15:00+00:00',closed:true,nextd:'2026-08-27',rows:[row('OLD',9,500000,'',6.2)]},
         {d:'2026-08-27',at:'2026-08-27T22:17:00+00:00',closed:false,rows:[row('BBB',5,2000000),row('AAA',12,900000,'amc'),row('CCC',-7,300000,'bmo'),row('DDD',-30,150000)]}],
  hist:{dates:D,bars:{AAA:bars(1),BBB:bars(2),CCC:bars(1.5)}}};
const heads=A=>[...A.$('pmHead')._h.matchAll(/data-k="([^"]+)"/g)].map(m=>m[1]);
const syms=A=>[...A.$('pmRows')._h.matchAll(/<tr data-s="([^"]+)"/g)].map(m=>m[1]);
const go=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}});

const star=(A,k)=>A.L.pmRows.click({target:{closest:sel=>sel==='.tagb'?{dataset:{k}}:null}});
const W=ls=>JSON.parse(ls['perso.suivis']||'{"items":{}}').items;

// 1) ☆ dans le scan : suivi avec la 1re étiquette, compteur du filtre
const ls={}; let A=boot(ls,PM); go(A);
star(A,'AAA');
ok('☆ → suivi « À suivre » pour la séance', W(ls)['AAA|2026-08-27'] && W(ls)['AAA|2026-08-27'].tag==='suivre' && W(ls)['AAA|2026-08-27'].pc===11.2, JSON.stringify(W(ls)));
ok('étoile pleine dans la liste', /data-k="AAA"[^>]*>★<\/button>/.test(A.$('pmRows')._h.replace(/aria-[a-z]+="[^"]*" /g,'').replace(/title="[^"]*"/g,'')));
ok('filtre Suivis : 1', /Suivis<span>1<\/span>/.test(A.$('pmFilt')._h));
ok('« Réinitialiser » ne touche pas aux suivis (clé hors mm.)', Object.keys(ls).includes('perso.suivis'));

// 2) mode Suivis : toutes séances, plus récente d'abord ; séance sortie du fichier = chiffres gardés
ls['perso.suivis']=JSON.stringify({v:1,items:{...W(ls),
  'OLD|2026-08-26':{s:'OLD',d:'2026-08-26',tag:'setup',note:'gap à surveiller',at:'2026-08-26T22:00:00Z',up:'2026-08-26T22:00:00Z',n:'OLD Inc.',c:10,pc:10.9,pch:9},
  'ZZZ|2026-07-01':{s:'ZZZ',d:'2026-07-01',tag:'piege',note:'',at:'2026-07-01T22:00:00Z',up:'2026-07-01T22:00:00Z',n:'ZZZ Corp',c:5,pc:6,pch:20}}});
A=boot(ls,PM); go(A);
A.L.pmFilt.click({target:{closest:()=>({dataset:{watch:'1'}})}});
ok('Suivis : toutes séances, récente d\'abord', syms(A).join()==='AAA|2026-08-27,OLD|2026-08-26,ZZZ|2026-07-01', syms(A).join());
ok('Suivis : colonnes Lendemain et Depuis', heads(A).includes('nx') && heads(A).includes('since') && !heads(A).includes('rv'), heads(A).join());
ok('Suivis : note sous le symbole', /gap à surveiller/.test(A.$('pmRows')._h));
ok('Suivis : séance sortie du fichier affichée avec ses chiffres et son nom', /data-s="ZZZ\|2026-07-01"[\s\S]*?1 juil\. · ZZZ Corp[\s\S]*?\+20,00 %/.test(A.$('pmRows')._h));
ok('mode mémorisé', ls['mm.pmwatch']==='1');
A.L.pmFilt.click({target:{closest:()=>({dataset:{tag:'piege'}})}});
ok('filtre par étiquette', syms(A).join()==='ZZZ|2026-07-01', syms(A).join());
A.L.pmFilt.click({target:{closest:()=>({dataset:{tag:'all'}})}});

// 3) fiche : étiquette, note, séance ancienne
A.L.pmRows.click({target:{closest:()=>({dataset:{s:'ZZZ|2026-07-01'}})}});
ok('fiche : séance de la ligne', /1 juil/.test(A.$('pmWhen')._t), A.$('pmWhen')._t);
ok('fiche : lendemain hors fichier signalé', /séance sortie du fichier/.test(strip(A.$('pmFacts')._h)));
A.L.pmWTags.click({target:{closest:()=>({dataset:{wt:'setup'}})}});
ok('fiche : changement d\'étiquette', W(ls)['ZZZ|2026-07-01'].tag==='setup');
A.$('pmWNote').value='  piège évité  '; A.L.pmWNote.change({});
ok('fiche : note enregistrée (espaces retirés)', W(ls)['ZZZ|2026-07-01'].note==='piège évité', W(ls)['ZZZ|2026-07-01'].note);

// 4) retrait : trace gardée pour la synchronisation, ligne retirée
star(A,'AAA|2026-08-27');
ok('retrait : trace { del: true }', W(ls)['AAA|2026-08-27'].del===true && !('tag' in W(ls)['AAA|2026-08-27']));
ok('retrait : ligne retirée des suivis', syms(A).join()==='OLD|2026-08-26,ZZZ|2026-07-01', syms(A).join());

// 5) retour au scan : le titre retiré n'a plus d'étoile pleine
A.L.pmFilt.click({target:{closest:()=>({dataset:{watch:'0'}})}});
ok('retour au scan', syms(A).join()==='BBB,AAA', syms(A).join());

console.log(bad?`${bad} échec(s)`:'tout est bon'); process.exit(bad?1:0);
