// Volume en dollars du scan 9M +4 % (exception au gel du 27/10/2026) : pastilles de Secteurs classées par volume en dollars
// du jour (config sort = "dvol" ; liste d'avant cette colonne : par hausse), montant sur la pastille ; « Tickers » : colonne
// « Vol $ », tri par défaut du plus haut au plus bas, filtre « Vol $ > x M$ » mémorisé, tickers hors liste masqués par le
// filtre ; « Effacer » retire colonne et filtre ; liste tapée à la main : ni colonne ni filtre, tri par industrie.
const fs=require('fs'),vm=require('vm');
require('./lib/fixtures');   // industries_data.js, tickers_data.js, industries/ : copie figée (tests/fixtures/)
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(ls,opts={}){
  const L={},els={},DL={};
  const mkCtx=()=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):()=>{},set:()=>true});
  const mkEl=id=>({id,children:[],style:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},toggle(c,on){if(on)this._s.add(c);else this._s.delete(c);},contains(c){return this._s.has(c);}},className:'',_h:'',dataset:{},hidden:false,value:'',tagName:'DIV',
    set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
    setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
    parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:500,offsetWidth:100,scrollIntoView(){},
    getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:500,width:900,height:500}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
  const $=id=>els[id]||(els[id]=mkEl(id));
  let seq=0;
  const document={getElementById:$,createElement:()=>mkEl('n'+(++seq)),querySelector:()=>mkEl('w'),body:Object.assign(mkEl('body'),{dataset:{}}),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],
    addEventListener(e,f){(DL[e]=DL[e]||[]).push(f);}};
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},innerHeight:800,innerWidth:opts.width||1200,
    getComputedStyle:()=>({getPropertyValue:()=>'#000'}),setTimeout,clearTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of ["config_data.js","stockbee_data.js","prices_data.js","vix_data.js","sectors_data.js","industries_data.js","tickers_data.js"])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(opts.after)vm.runInContext(opts.after,sb);
  vm.runInContext(main,sb);
  return {L,els,DL,sb,$};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const tab=(A,t='sec')=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:t}})}});
const chips=A=>[...A.$('secBo')._h.matchAll(/data-bos="([^"]+)"/g)].map(m=>m[1]);
const boClick=(A,ds)=>A.L.secBo.click({target:{closest:()=>({dataset:ds,querySelector:()=>({set textContent(v){}}),classList:{toggle(){}}})}});
const rows=A=>[...A.$('tkRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1],dv:strip((m[2].match(/<td class="c-dv">(.*?)<\/td>/)||[])[1])}));
const tip=(A,id)=>{A.DL.click.forEach(f=>f({target:{closest:sel=>sel==='.tipbtn'?{dataset:{tip:id},setAttribute(){},getBoundingClientRect:()=>({left:0,bottom:0})}:null},stopPropagation(){},preventDefault(){}}));return strip(A.$('pop')._h);};

const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,''));
const CFG0=JSON.parse(fs.readFileSync('config_data.js','utf8').replace(/^[\s\S]*?window\.MM_CONFIG = /,'').replace(/;\s*$/,'')), BOC=CFG0.sectors.breakouts;
const last=IND0.dates[IND0.dates.length-1], prev=IND0.dates[IND0.dates.length-2];
// séance du relevé : hausse et volume en dollars dans des ordres différents (AMD : plus forte hausse, plus petit montant)
const L={[last]:[['AMD',12,10e6,1.2,1.5e9],['NVDA',8,30e6,1.5,5e9],['MU',5,20e6,2,2e9]],[prev]:[['AMD',12,10e6,1.2],['NVDA',8,30e6,1.5]]};
const tvb=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${last}',50,5100,100,90]],asof:'${last}',bo_columns:['ticker','pct','volume','vol_ratio','dvol'],breakouts:${JSON.stringify(L)}};`;
ok('config : tri par volume en dollars (choix de l\'utilisateur)',BOC.sort==='dvol'&&CFG0.tickers.dvol_step>0);

// --- Secteurs : ordre et montant
const ls={'mm.secview':'tv'};
let A=boot(ls,{after:tvb}); tab(A);
A.L.dPick.change({target:{value:last}});
ok('pastilles : du plus fort volume en dollars au plus faible',chips(A).join()==='NVDA,MU,AMD',chips(A).join());
ok('pastille : volume en dollars, puis volume en actions',strip(A.$('secBo')._h).includes('5,0 Md $ · 30,0 M · ×1,5')&&strip(A.$('secBo')._h).includes('1,5 Md $ · 10,0 M'));
A.L.dPick.change({target:{value:prev}});
ok('liste d\'avant le volume en dollars : par hausse du jour, sans montant',chips(A).join()==='AMD,NVDA'&&!strip(A.$('secBo')._h).includes(' $ ·'),chips(A).join());
ok('bulle : classement par volume en dollars expliqué',/volume en dollars/.test(tip(A,'bo')));

// --- envoi vers Tickers : colonne, tri par défaut, filtre
A.L.dPick.change({target:{value:last}});
boClick(A,{botk:'1'});
ok('« Tickers » : liste dans l\'ordre du bloc, séance retenue',A.$('tkInput').value==='NVDA, MU, AMD'&&ls['mm.tkbo']===last);
let r=rows(A);
ok('colonne « Vol $ », tri par défaut du plus haut au plus bas',/Vol \$/.test(A.$('tkHead')._h)&&r.map(x=>x.s).join()==='NVDA,MU,AMD'&&r[0].dv==='5,0 Md $'&&r[2].dv==='1,5 Md $',r.map(x=>x.s+' '+x.dv).join(' | '));
ok('filtre affiché avec la séance du scan',A.$('tkDv').hidden===false&&String(A.$('tkDvInfo').textContent).includes(BOC.label));
A.L.tkDvMin.change({target:{value:'1800'}});
r=rows(A);
ok('filtre « Vol $ > 1800 M$ » : AMD (1,5 Md $) masqué, compte affiché, valeur mémorisée',r.map(x=>x.s).join()==='NVDA,MU'&&String(A.$('tkDvInfo').textContent).includes('2 / 3')&&ls['mm.tkdvmin']==='1800');
A.$('tkInput').value='NVDA, PLTR'; A.L.tkGo.click();
ok('ticker absent de la liste 9M : « — », masqué par le filtre actif',rows(A).map(x=>x.s).join()==='NVDA');
A.L.tkDvMin.change({target:{value:''}});
ok('filtre vidé : ticker hors liste affiché avec « — »',rows(A).map(x=>x.s).join()==='NVDA,PLTR'&&rows(A)[1].dv==='—',rows(A).map(x=>x.s+' '+x.dv).join(' | '));
ok('bulle de la colonne',/clôture × volume/.test(tip(A,'tk:dv')));

// --- relu au chargement ; « Effacer » : ni colonne ni filtre, tri par industrie
const B=boot({...ls},{after:tvb}); tab(B,'tk');
ok('liste du scan relue au chargement : colonne et tri gardés',/Vol \$/.test(B.$('tkHead')._h)&&rows(B)[0].s==='NVDA');
B.L.tkClear.click(); B.$('tkInput').value='MU, NVDA, AMD'; B.L.tkGo.click();
ok('« Effacer » puis liste tapée : ni colonne ni filtre « Vol $ »',!/Vol \$/.test(B.$('tkHead')._h)&&B.$('tkDv').hidden===true&&!/c-dv/.test(B.$('tkRows')._h));
process.exit(bad?1:0);
