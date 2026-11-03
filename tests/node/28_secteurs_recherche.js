// Onglet Secteurs, recherche d'un ticker (demande de l'utilisateur du 03/11/2026) : champ dans l'en-tête de la frise → fenêtre
// graphique ; suggestions (symbole exact puis début par capitalisation, puis nom), flèches, Entrée, ETF et titre absent
// (message), ligne de tendance de la fenêtre (TI65 de l'action, de l'industrie et du secteur, MM, Convergence, 9M, lien vers
// l'industrie). Index des tickers figé (tests/fixtures/).
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
const opts=A=>[...A.$('secFindList')._h.matchAll(/data-sfs="([^"]+)"/g)].map(m=>m[1]);
const type=(A,v)=>{A.$('secFindIn').value=v;A.L.secFindIn.input({});};
const enter=A=>A.L.secFind.submit({preventDefault(){}});
const key=(A,k)=>A.L.secFindIn.keydown({key:k,preventDefault(){},stopPropagation(){}});

// fichier d'actions de Semiconductors fourni d'avance (le chargeur de la page ajoute un <script> que ce DOM simulé n'exécute pas)
// liste 9M de la dernière séance (relevé TradingView ; les fixtures n'ont pas l'historique nine) : la Convergence est calculée
const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,'')), last=IND0.dates[IND0.dates.length-1];
const tvb=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${last}',50,5100,100,90]],asof:'${last}',bo_columns:['ticker','pct','volume','vol_ratio'],breakouts:{'${last}':[['NVDA',5,9e6,1.2]]}};`;
const ls={'mm.secview':'tv'}, A=boot(ls,{after:fs.readFileSync('industries/semiconductors.js','utf8')+tvb}); tab(A);
const T=A.sb.TICKERS, CFG=A.sb.MM_CONFIG, TPC=CFG.ticker_popup, TPT=TPC.trend, TPF=TPC.find;
const C=Object.fromEntries(T.cols.map((k,i)=>[k,i]));
// titre retenu de l'industrie Semiconductors (fichier d'actions présent dans les fixtures), le plus gros
const semi=T.inds.findIndex(x=>x[0]==='Semiconductors');
const S0=T.rows.filter(r=>r[C.ind]===semi&&r[C.kept]).sort((a,b)=>b[C.cap]-a[C.cap])[0][C.s];
ok('champ : texte d\'aide et libellé de la config',A.$('secFindIn').placeholder===TPF.placeholder);

// --- suggestions
type(A,S0.toLowerCase());
ok('suggestions : le symbole exact en premier (minuscules acceptées)',opts(A)[0]===S0,opts(A).slice(0,3).join(','));
ok(`suggestions : au plus ${TPF.max}`,opts(A).length<=TPF.max);
type(A,'A');
const capA=T.rows.filter(r=>r[C.s].startsWith('A')&&r[C.s]!=='A').sort((a,b)=>b[C.cap]-a[C.cap])[0][C.s];
ok('« A » : A d\'abord, puis les symboles qui commencent par A, plus grosse capitalisation d\'abord',opts(A)[0]==='A'&&opts(A)[1]===capA,opts(A).slice(0,3).join(','));
const nm=T.rows.find(r=>r[C.s]===S0)[C.n], word=nm.split(/\s+/)[0].toUpperCase();
type(A,word.slice(0,Math.max(TPF.name_min,4)));
ok('nom : trouvé dès name_min lettres',opts(A).includes(S0),`${word} → ${opts(A).join(',')}`);
type(A,'');
ok('champ vidé : plus de suggestions',A.$('secFindList').hidden===true&&opts(A).length===0);

// --- Entrée : fenêtre graphique avec la ligne de tendance
type(A,S0); enter(A);
ok('Entrée : la fenêtre graphique du titre s\'ouvre, champ vidé',A.$('tkPop').hidden===false&&String(A.$('popTitle').textContent)===S0&&A.$('secFindIn').value==='');
let tr=strip(A.$('popTr')._h);
ok('ligne de tendance : action (TI65, rang dans l\'industrie, MM), industrie et secteur (rangs)',
   tr.includes(TPT.stock)&&tr.includes(TPT.ind)&&tr.includes(TPT.sec)&&/rang <b>\d+<\/b>\/\d+/.test(A.$('popTr')._h)&&/MM 10&lt;20|MM 10>20|MM 10=20/.test(A.$('popTr')._h),tr.slice(0,200));
ok('ligne de tendance : 9M de l\'action sur la fenêtre de la grille',tr.includes(TPC.trend.nine_n.replace('{n}','').split('{w}')[0].trim())&&tr.includes(String(CFG.sectors.map.board.grid_sessions)+' s'));
ok('ligne de tendance : Convergence (zone ou « hors zone »)',tr.includes(TPT.conv)&&(tr.includes(TPT.conv_none)||A.$('popTr')._h.includes('data-zshow=')));
ok('aucun verdict « en tendance » (des faits seulement)',!/en tendance|haussi|baissi/i.test(tr));
A.L.popTr.click({target:{closest:()=>({dataset:{gind:'1'}})}});
const nav=JSON.parse(ls['mm.tvnav']||'{}');
ok('« Ouvrir l\'industrie » : fenêtre fermée, Classement sur l\'industrie au niveau actions',A.$('tkPop').hidden===true&&nav.lvl==='stk'&&nav.ind==='Semiconductors',JSON.stringify(nav));

// --- flèches : la 2e suggestion
type(A,'A'); const second=opts(A)[1]; key(A,'ArrowDown');
ok('↓ : suggestion suivante surlignée',/class="sfo on"[^>]*data-sfs="([^"]+)"/.exec(A.$('secFindList')._h)[1]===second);
enter(A);
ok('Entrée après ↓ : la suggestion choisie',String(A.$('popTitle').textContent)===second);
A.L.popX.click({});
type(A,'A'); key(A,'Escape');
ok('Échap : suggestions fermées',A.$('secFindList').hidden===true);

// --- clic sur une suggestion
type(A,S0); A.L.secFindList.click({target:{closest:()=>({dataset:{sfs:S0}})}});
ok('clic sur une suggestion : sa fenêtre',A.$('tkPop').hidden===false&&String(A.$('popTitle').textContent)===S0);
A.L.popX.click({});

// --- ETF et titre absent : message, pas de fenêtre
const etf=A.sb.SECTORS.symbols[0].s;
type(A,etf); enter(A);
ok('ETF : message vers le niveau ETF du Classement',A.$('tkPop').hidden===true&&A.$('secFindMsg').hidden===false&&A.$('secFindMsg').textContent===TPF.etf.replace('{s}',etf),A.$('secFindMsg').textContent);
type(A,'ZZZZQX'); enter(A);
ok('titre absent : message',A.$('tkPop').hidden===true&&A.$('secFindMsg').textContent===TPF.none.replace('{s}','ZZZZQX'));
type(A,'$'+S0.toLowerCase()); A.L.secFind.submit({preventDefault(){}});
ok('« $sym » accepté (même lecture que l\'onglet Tickers)',String(A.$('popTitle').textContent)===S0);

console.log(bad?`\n${bad} échec(s)`:'\nOK');
process.exit(bad?1:0);
