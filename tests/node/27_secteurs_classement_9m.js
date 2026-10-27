// Onglet Secteurs, niveau « Breakouts 9M » du Classement (demande du 27/10/2026, comme Leaders actifs) : bouton du bloc et du
// fil, tableau classé comme la liste (volume en dollars), colonnes Vol $ / % jour / Volume / Industrie, tri mémorisé, fiche du
// titre (séance du scan, bougie du lendemain, sans graphique pour un ETF), retour aux secteurs, copie, niveau relu au chargement.
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
const tab=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const boClick=(A,ds)=>A.L.secBo.click({target:{closest:()=>({dataset:ds,querySelector:()=>({set textContent(v){}}),classList:{toggle(){}}})}});
const filt=(A,ds)=>A.L.secFilt.click({target:{closest:()=>({dataset:ds})}});
const rows=A=>[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)"/g)].map(m=>m[1]);

const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,''));
const T0=JSON.parse(fs.readFileSync('tickers_data.js','utf8').replace(/^window\.TICKERS = /,'').replace(/;\s*$/,''));
const col=Object.fromEntries(T0.cols.map((k,i)=>[k,i]));
// deux actions retenues de l'index (fichier de leur industrie fabriqué) + un ETF hors classification
const picks=T0.rows.filter(r=>r[col.kept]&&r[col.c]!=null&&IND0.industries.some(i=>i.k===T0.inds[r[col.ind]][0])).slice(0,2);
const [SA,SB]=picks.map(r=>r[col.s]), indA=T0.inds[picks[0][col.ind]][0];
const NB=120, fdates=IND0.dates.slice(-NB), need=new Map();
picks.forEach(r=>{const f=IND0.industries.find(i=>i.k===T0.inds[r[col.ind]][0]).f;if(!need.has(f))need.set(f,[]);need.get(f).push(r[col.s]);});
const mkFile=syms=>({asof:IND0.asof,dates:fdates,vu:1000,rows:syms.map((s,j)=>{const c=fdates.map((_,i)=>+(10+j+i*0.1).toFixed(2));
  return [s,s+' Inc.',1e9*(j+1),c,c.map(()=>500),c.map(v=>v*0.99),c.map(v=>v*1.02),c.map(v=>v*0.98)];})});
const files=`window.TV_STOCKS=window.TV_STOCKS||{};`+[...need].map(([f,syms])=>`window.TV_STOCKS[${JSON.stringify(f)}]=${JSON.stringify(mkFile(syms))};`).join('');
const evening='2099-01-02';
const L={[evening]:[[SB,10,10e6,2,1e9],[SA,5,20e6,1.5,3e9],['ETFX',8,30e6,1.2,2e9]]};
const tvb=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[],bo_columns:['ticker','pct','volume','vol_ratio','dvol'],breakouts:${JSON.stringify(L)}};`;

const ls={'mm.secview':'tv'};
let A=boot(ls,{after:files+tvb}); tab(A);
ok('bloc : bouton « Breakouts 9M (3) › »',/data-bogo="1"[^>]*>Breakouts 9M \(3\) ›/.test(A.$('secBo')._h));
ok('fil du Classement : niveau Breakouts 9M avec son nombre',/data-bo="1"[^>]*>Breakouts 9M<span>3<\/span>/.test(A.$('secFilt')._h));
boClick(A,{bogo:'1'});
ok('bouton : niveau mémorisé, tableau classé par volume en dollars (ETF compris)',JSON.parse(ls['mm.tvnav']).lvl==='bo'&&rows(A).join()===[SA,'ETFX',SB].join(),rows(A).join());
const head=strip(A.$('secHead')._h);
ok('colonnes : Vol $, % jour, Volume, Industrie',['Vol $','% jour','Volume','Industrie'].every(x=>head.includes(x)),head);
ok('ligne : montant, hausse, volume et ×veille, industrie',(()=>{const h=strip(A.$('secRows')._h);return h.includes('3,0 Md $')&&h.includes('+5,0 %')&&h.includes('20,0 M')&&h.includes('×1,5 veille')&&h.includes(indA);})());
ok('niveau actif dans le fil, résumé de la liste',/data-bo="1" class="on"/.test(A.$('secFilt')._h)&&String(A.$('secMeta').textContent).includes('Breakouts 9M du')&&String(A.$('secMeta').textContent).includes('3 titres'));
ok('fiche du premier titre : séance du scan, bougie du lendemain',String(A.$('secTitle').textContent).startsWith(SA)&&/Breakouts 9M du .*\+5,0 %.*3,0 Md \$.*20,0 M actions.*le lendemain matin/.test(strip(A.$('secInfo')._h)),strip(A.$('secInfo')._h));
A.L.secRows.click({target:{closest:s=>s==='tr'?{dataset:{s:'ETFX'}}:null}});
ok('ETF : dans la liste, sans graphique (expliqué)',String(A.$('secTitle').textContent)==='ETFX'&&/pas de graphique \(ETF, ADR/.test(strip(A.$('secInfo')._h)));
A.L.secSortBar.click({target:{closest:()=>({dataset:{sort:'pbo'}})}});
ok('« Classer par » % jour : plus forte hausse d\'abord, tri mémorisé pour ce niveau',rows(A).join()===[SB,'ETFX',SA].join()&&JSON.parse(ls['mm.tvsort.bo']).k==='pbo',rows(A).join());
{ let copied=null; A.sb.navigator={clipboard:{writeText:s=>{copied=s;return Promise.resolve();}}}; A.sb.isSecureContext=true; A.L.secCopy.click({});
  ok('Copier : tickers de la liste, dans l\'ordre affiché',copied===[SB,'ETFX',SA].join(', '),String(copied)); }
boClick(A,{bos:SA});
ok('toucher un titre du bloc : ce titre sélectionné dans le Classement',String(A.$('secTitle').textContent).startsWith(SA)&&ls['mm.tvsel']===SA);
const B=boot({...ls},{after:files+tvb}); tab(B);
ok('niveau relu au chargement',rows(B).length===3&&/data-bo="1" class="on"/.test(B.$('secFilt')._h));
filt(A,{lvl:'0'});
ok('fil : « Secteurs » quitte la liste 9M',JSON.parse(ls['mm.tvnav']).lvl==='sec');
const C=boot({'mm.secview':'tv'},{after:files}); tab(C);
ok('sans liste 9M : pas de niveau dans le fil',!/data-bo="1"/.test(C.$('secFilt')._h));
process.exit(bad?1:0);
