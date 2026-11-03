// Fenêtre graphique d'un ticker (03/11/2026, demandes de l'utilisateur) : ‹ › et flèches du clavier passent d'un titre à l'autre
// de la liste d'où elle a été ouverte (plus petite liste affichée qui contient le titre), sans la fermer ; bouts de liste ;
// ouverte seule (recherche) : pas de navigation ; 6 mois à l'ouverture ; molette seule = zoom dans la fenêtre (pas ailleurs).
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
// liste 9M de la dernière séance (relevé TradingView ; les fixtures n'ont pas l'historique nine) : la Convergence est calculée
const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,'')), last=IND0.dates[IND0.dates.length-1];
const tvb=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${last}',50,5100,100,90]],asof:'${last}',bo_columns:['ticker','pct','volume','vol_ratio'],breakouts:{'${last}':[['NVDA',5,9e6,1.2]]}};`;
const ls={'mm.secview':'tv'}, A=boot(ls,{after:fs.readFileSync('industries/semiconductors.js','utf8')+tvb}); tab(A);
const TPC=A.sb.MM_CONFIG.ticker_popup, title=()=>String(A.$('popTitle').textContent);
const keyd=k=>{let p=false;A.DL.keydown.forEach(f=>f({key:k,target:{tagName:'BODY'},preventDefault(){p=true;}}));return p;};
ok('6 mois à l\'ouverture (config [ticker_popup] range)',TPC.range==='6M');

// --- un titre du bloc 9M, dans une liste de trois (conteneur affiché : ses pastilles)
const L3=['NVDA','AMD','INTC'], chips=L3.map(s=>({dataset:{bos:s}}));
const el={dataset:{bos:'NVDA'},parentElement:{querySelectorAll:()=>chips}};
A.L.secBo.click({target:{closest:()=>el}});
ok('ouverte depuis une liste : navigation affichée, 1 / 3, ‹ grisé',A.$('tkPop').hidden===false&&title()==='NVDA'&&A.$('popNav').hidden===false&&A.$('popPos').textContent==='1 / 3'&&A.$('popPrev').disabled===true&&A.$('popNext').disabled===false);
A.L.popNext.click({});
ok('› : titre suivant, fenêtre ouverte',A.$('tkPop').hidden===false&&title()==='AMD'&&A.$('popPos').textContent==='2 / 3');
ok('→ au clavier : titre suivant',keyd('ArrowRight')&&title()==='INTC'&&A.$('popPos').textContent==='3 / 3'&&A.$('popNext').disabled===true);
keyd('ArrowRight');
ok('→ en bout de liste : rien ne change',title()==='INTC');
keyd('ArrowLeft'); keyd('ArrowUp');
ok('← et ↑ : titres précédents',title()==='NVDA'&&A.$('popPos').textContent==='1 / 3');
ok('ligne de tendance du nouveau titre',strip(A.$('popTr')._h).includes(TPC.trend.stock));
keyd('Escape');
ok('Échap : fermée',A.$('tkPop').hidden===true);

// --- ouverte seule (recherche) ou depuis une liste d'un seul titre : pas de navigation
A.$('secFindIn').value='NVDA'; A.L.secFind.submit({preventDefault(){}});
ok('ouverte par la recherche : pas de navigation',A.$('tkPop').hidden===false&&A.$('popNav').hidden===true);
ok('sans liste : les flèches ne font rien',!keyd('ArrowRight')&&title()==='NVDA');
A.L.popX.click({});

// --- molette : zoom direct dans la fenêtre ; ailleurs, Ctrl / ⌘ reste nécessaire (la page défile)
A.L.secBo.click({target:{closest:()=>el}});
let pv=false; A.L.popCanvas.wheel({deltaY:120,deltaX:0,deltaMode:0,ctrlKey:false,metaKey:false,clientX:400,preventDefault(){pv=true;}});
ok('molette seule dans la fenêtre : zoom (événement pris)',pv===true);
let ps=false; A.L.secCanvas.wheel({deltaY:120,deltaX:0,deltaMode:0,ctrlKey:false,metaKey:false,clientX:400,preventDefault(){ps=true;}});
ok('molette seule sur le graphique de l\'onglet : la page défile (inchangé)',ps===false);

console.log(bad?`\n${bad} échec(s)`:'\nOK');
process.exit(bad?1:0);
