// Onglet Secteurs, barre de recherche (03/11/2026, demandes de l'utilisateur) : un ou plusieurs tickers → récap sous la frise
// (une ligne par ticker : industrie, secteur, rangs, zones de la Convergence, 9M, leader ; « Graphique » = la fenêtre, sans
// l'ouvrir par défaut ; ETF et titre absent signalés ; retirer, effacer, copier, « + N autres ») ; suggestions pour le ticker en
// cours de frappe ; mise en avant dans les blocs (feuille #srchCss) ; champ unique (plus de champ dans la carte de rotation) ;
// liste mémorisée (mm.srch). Index des tickers figé (tests/fixtures/).
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
const rows=A=>[...A.$('secSrch')._h.matchAll(/<div class="srow( unk)?"[^>]*>([\s\S]*?)(?=<div class="srow|<button type="button" class="srmore|$)/g)].map(m=>({unk:!!m[1],t:strip(m[2]),h:m[2]}));
const srClick=(A,ds)=>A.L.secSrch.click({target:{closest:()=>({dataset:ds})}});
// liste 9M de la dernière séance (relevé TradingView ; les fixtures n'ont pas l'historique nine) : la Convergence est calculée
const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,'')), last=IND0.dates[IND0.dates.length-1];
const tvb=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${last}',50,5100,100,90]],asof:'${last}',bo_columns:['ticker','pct','volume','vol_ratio'],breakouts:{'${last}':[['NVDA',5,9e6,1.2]]}};`;
const bootS=ls=>{const B=boot(ls,{after:fs.readFileSync('industries/semiconductors.js','utf8')+tvb});tab(B);return B;};
const ls={'mm.secview':'tv','mm.rrgopen':'1'}, A=boot(ls,{after:fs.readFileSync('industries/semiconductors.js','utf8')+tvb}); tab(A);
const T=A.sb.TICKERS, CFG=A.sb.MM_CONFIG, TPC=CFG.ticker_popup, TPT=TPC.trend, TPF=TPC.find;
const C=Object.fromEntries(T.cols.map((k,i)=>[k,i]));
const semi=T.inds.findIndex(x=>x[0]==='Semiconductors');
const S0=T.rows.filter(r=>r[C.ind]===semi&&r[C.kept]).sort((a,b)=>b[C.cap]-a[C.cap])[0][C.s];
ok('champ unique : texte d\'aide de la config, plus de champ Tickers dans la carte de rotation',A.$('secFindIn').placeholder===TPF.placeholder&&!html.includes('id="rrgTk"'));
ok('liste vide : pas de récap',A.$('secSrch').hidden===true);

// --- suggestions pour le ticker en cours de frappe
type(A,S0.toLowerCase());
ok('suggestions : le symbole exact en premier (minuscules acceptées)',opts(A)[0]===S0,opts(A).slice(0,3).join(','));
ok(`suggestions : au plus ${TPF.max}`,opts(A).length<=TPF.max);
type(A,S0+', a');
const capA=T.rows.filter(r=>r[C.s].startsWith('A')&&r[C.s]!=='A').sort((a,b)=>b[C.cap]-a[C.cap])[0][C.s];
ok('après une virgule : suggestions pour le ticker suivant (A, puis capitalisation)',opts(A)[0]==='A'&&opts(A)[1]===capA,opts(A).slice(0,3).join(','));
const nm=T.rows.find(r=>r[C.s]===S0)[C.n], word=nm.split(/\s+/)[0].toUpperCase().slice(0,Math.max(TPF.name_min,4));
type(A,word);
ok('nom : trouvé dès name_min lettres',opts(A).includes(S0),`${word} → ${opts(A).join(',')}`);

// --- Entrée : la liste s'applique (récap), aucune fenêtre ouverte
type(A,'amz'); const firstAmz=opts(A)[0]; enter(A);
ok('Entrée sur un début de ticker : 1re suggestion ajoutée, la liste continue',A.$('secFindIn').value===firstAmz+', ',A.$('secFindIn').value);
type(A,S0+', '+firstAmz); key(A,'Escape'); enter(A);
ok('Entrée : liste mémorisée, aucune fenêtre ouverte',ls['mm.srch']===S0+', '+firstAmz&&A.$('popTitle').textContent===undefined&&A.$('secFindList').hidden===true,ls['mm.srch']);   // fenêtre jamais ouverte : aucun titre chargé
let R=rows(A);
ok('récap : une ligne par ticker, dans l\'ordre tapé',A.$('secSrch').hidden===false&&R.length===2&&R[0].t.startsWith(S0)&&R[1].t.startsWith(firstAmz),R.map(r=>r.t.slice(0,12)).join(' | '));
ok('récap : en-tête (titre, « 2 trouvé(s) sur 2 », Copier, Effacer)',strip(A.$('secSrch')._h).includes(TPF.recap_title)&&strip(A.$('secSrch')._h).includes(TPF.count.replace('{n}','2').replace('{t}','2'))&&/data-srcopy/.test(A.$('secSrch')._h)&&/data-srclear/.test(A.$('secSrch')._h));
ok('ligne : industrie et secteur, TI65 de l\'action, rangs de l\'industrie et du secteur, Convergence',R[0].t.includes('Semiconductors')&&R[0].t.includes(TPT.stock)&&/rang <b>\d+<\/b>\/\d+/.test(R[0].h)&&R[0].t.includes(TPT.sec)&&R[0].t.includes(TPT.conv),R[0].t.slice(0,220));
ok('ligne : boutons Graphique, Ouvrir l\'industrie, retirer',new RegExp(`data-srpop="${S0}"`).test(R[0].h)&&new RegExp(`data-gind="${S0}"`).test(R[0].h)&&new RegExp(`data-srdel="${S0}"`).test(R[0].h));
ok('ligne : « 9M du jour » pour un ticker de la liste 9M du jour',R[0].t.includes(TPF.today)===(S0==='NVDA'));
ok('aucun verdict « en tendance »',!/en tendance|haussi|baissi/i.test(strip(A.$('secSrch')._h)));

// --- mise en avant dans les blocs
const css=String(A.$('srchCss').textContent||'');
ok('surbrillance : pastilles des tickers (data-pop, data-bos)',css.includes(`[data-pop="${S0}"]`)&&css.includes(`[data-bos="${S0}"]`)&&css.includes(`[data-pop="${firstAmz}"]`));
ok('surbrillance : lignes du Classement (ticker, industrie, secteur) et du tableau de la carte de rotation',css.includes(`#secRows tr[data-s="${S0}"]`)&&css.includes('#secRows tr[data-s="Semiconductors"]')&&css.includes('#rrgTab tr[data-mv="Semiconductors"]'));
ok('surbrillance : ligne du groupe dans la grille de Convergence',css.includes('#secZone tr.zr[data-mapsel="i:Semiconductors"]'));
ok('carte de rotation : même liste (pastilles sous la carte)',strip(A.$('rrgChips')._h).includes(S0+' → '));

// --- Graphique : la fenêtre, ‹ › dans la liste tapée ; Ouvrir l'industrie
srClick(A,{srpop:S0});
ok('« Graphique » : la fenêtre du ticker, ‹ › dans la liste (1 / 2)',A.$('tkPop').hidden===false&&String(A.$('popTitle').textContent)===S0&&A.$('popNav').hidden===false&&A.$('popPos').textContent==='1 / 2');
A.L.popX.click({});
srClick(A,{gind:S0});
const nav=JSON.parse(ls['mm.tvnav']||'{}');
ok('« Ouvrir l\'industrie » : Classement sur l\'industrie au niveau actions',nav.lvl==='stk'&&nav.ind==='Semiconductors',JSON.stringify(nav));

// --- ETF et titre absent ; retirer ; « + N autres » ; effacer
const etf=A.sb.SECTORS.symbols[0].s;
type(A,S0+', '+etf+', ZZZZQX'); key(A,'Escape'); enter(A); R=rows(A);
ok('ETF : ligne qui renvoie au niveau ETF du Classement',R[1].unk&&R[1].t.includes(TPF.etf.replace('{s}',etf)),R[1]&&R[1].t);
ok('titre absent : signalé',R[2].unk&&R[2].t.includes(TPF.none.replace('{s}','ZZZZQX')));
srClick(A,{srdel:'ZZZZQX'});
ok('✕ d\'une ligne : ticker retiré de la liste et du champ',ls['mm.srch']===S0+', '+etf&&A.$('secFindIn').value===S0+', '+etf,ls['mm.srch']);
const many=T.rows.filter(r=>r[C.kept]).slice(0,TPF.recap_max+3).map(r=>r[C.s]);
type(A,many.join(', ')); key(A,'Escape'); enter(A);
ok(`plus de ${TPF.recap_max} tickers : « + 3 autres »`,rows(A).length===TPF.recap_max&&strip(A.$('secSrch')._h).includes(TPF.more.replace('{n}','3')));
srClick(A,{srall:'1'});
ok('« + 3 autres » : toute la liste',rows(A).length===TPF.recap_max+3);
srClick(A,{srclear:'1'});
ok('Effacer : liste, champ, récap et surbrillance vidés',ls['mm.srch']===''&&A.$('secFindIn').value===''&&A.$('secSrch').hidden===true&&!String(A.$('srchCss').textContent||'').includes('data-pop'));

// --- liste mémorisée : relue au chargement ; ancienne liste du champ de la carte reprise
const B=bootS({'mm.secview':'tv','mm.srch':S0});
ok('rechargement : liste relue (champ et récap)',B.$('secFindIn').value===S0&&rows(B).length===1);
const Cc=bootS({'mm.secview':'tv','mm.rrgtk':S0+', '+firstAmz});
ok('ancienne liste du champ de la carte de rotation reprise dans la barre',Cc.$('secFindIn').value===S0+', '+firstAmz&&rows(Cc).length===2);

console.log(bad?`\n${bad} échec(s)`:'\nOK');
process.exit(bad?1:0);
