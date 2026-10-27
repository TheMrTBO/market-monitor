// Onglet Secteurs, ordre des blocs sous la frise (exception au gel du 27/10/2026) : poignée dans l'en-tête des 4 blocs (flux,
// Groupes actifs, Breakouts 9M +4 %, Classement), glisser-déposer au pointeur (souris, doigt) et flèches ↑ ↓ au clavier, ordre
// mémorisé (mm.secorder) et relu au chargement ; ordre par défaut = HTML (rien n'est déplacé) ; clés inconnues ignorées.
const fs=require('fs'),vm=require('vm');
require('./lib/fixtures');   // industries_data.js, tickers_data.js, industries/ : copie figée (tests/fixtures/)
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const BLK={flow:'secFlow',act:'secAct',bo:'secBo',list:'secSplit'};
function boot(ls){
  const L={},els={},DL={};
  const mkCtx=()=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):()=>{},set:()=>true});
  const mkEl=id=>({id,children:[],style:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},toggle(c,on){if(on)this._s.add(c);else this._s.delete(c);},contains(c){return this._s.has(c);}},className:'',_h:'',dataset:{},hidden:false,value:'',tagName:'DIV',
    set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
    setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,focus(){focused=id;},
    parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:500,offsetWidth:100,scrollIntoView(){},
    getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:500,width:900,height:500}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
  const $=id=>els[id]||(els[id]=mkEl(id));
  let focused=null;
  // la vue : enfants dans l'ordre du HTML ; chaque bloc fait 100 px de haut, empilé dans l'ordre courant
  const view=$('view-sec'); view.kids=['secFlow','secAct','secBo','secSplit','secRrg']; view.moves=0;
  view.insertBefore=(el,ref)=>{view.moves++;view.kids=view.kids.filter(x=>x!==el.id);const i=view.kids.indexOf(ref.id);view.kids.splice(i<0?view.kids.length:i,0,el.id);return el;};
  for(const id of Object.values(BLK))$(id).getBoundingClientRect=()=>{const top=view.kids.filter(x=>!$(x).hidden).indexOf(id)*100;return {left:0,top,right:900,bottom:top+100,width:900,height:100};};
  let seq=0;
  const document={getElementById:$,createElement:()=>mkEl('n'+(++seq)),querySelector:()=>mkEl('w'),body:Object.assign(mkEl('body'),{dataset:{}}),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],
    addEventListener(e,f){(DL[e]=DL[e]||[]).push(f);}};
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},innerHeight:800,innerWidth:1200,scrollBy(){},
    getComputedStyle:()=>({getPropertyValue:()=>'#000'}),setTimeout,clearTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of ["config_data.js","stockbee_data.js","prices_data.js","vix_data.js","sectors_data.js","industries_data.js","tickers_data.js"])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,''));
  vm.runInContext(`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[],bo_columns:['ticker','pct','volume','vol_ratio'],breakouts:{'${IND0.dates[IND0.dates.length-1]}':[['ZZZ',4.1,9e6,1.1]]}};`,sb);
  vm.runInContext(main,sb);
  return {L,els,DL,sb,$,view,focused:()=>focused};
}
let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const tab=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const order=A=>A.view.kids.filter(x=>x!=='secRrg').join(',');
const handle=k=>({closest:s=>s==='.dragh'?{dataset:{drag:k}}:null});
const down=(A,k)=>A.L['view-sec'].pointerdown({target:handle(k),button:0,preventDefault(){}});
const move=(A,y)=>A.DL.pointermove.forEach(f=>f({clientY:y}));
const up=A=>A.DL.pointerup.forEach(f=>f({}));
const key=(A,k,kk)=>A.L['view-sec'].keydown({target:handle(k),key:kk,preventDefault(){}});

// --- ordre par défaut : rien n'est déplacé ; une poignée dans chaque en-tête
let ls={'mm.secview':'tv'}, A=boot(ls); tab(A);
ok('ordre par défaut (HTML) : aucun bloc déplacé au chargement',A.view.moves===0&&order(A)==='secFlow,secAct,secBo,secSplit');
ok('poignée dans Groupes actifs, Breakouts 9M +4 % et Classement (flux : à son rendu)',/data-drag="act"/.test(A.$('secAct')._h)&&/data-drag="bo"/.test(A.$('secBo')._h)
   &&/class="dragh"[^>]*data-drag="list"/.test(html)&&html.includes("<h4>${dragH('flow')}"));

// --- glisser Breakouts au-dessus de Groupes actifs (flux masqué : act 0-100, bo 100-200, list 200-300)
down(A,'bo');
ok('prise de la poignée : bloc marqué, curseur de glisser',A.$('secBo').classList.contains('dragging')&&A.sb.document.body.classList.contains('secdrag'));
move(A,40);
ok('glissé au-dessus du milieu de Groupes actifs : Breakouts passe devant',order(A)==='secFlow,secBo,secAct,secSplit',order(A));
move(A,45);
ok('pointeur immobile sur la même place : pas de nouveau déplacement',order(A)==='secFlow,secBo,secAct,secSplit');
move(A,290);
ok('glissé sous le milieu du Classement : Breakouts en dernier (avant la carte de rotation)',order(A)==='secFlow,secAct,secSplit,secBo'&&A.view.kids[4]==='secRrg',order(A));
up(A);
ok('relâché : marque retirée, ordre mémorisé',!A.$('secBo').classList.contains('dragging')&&!A.sb.document.body.classList.contains('secdrag')&&ls['mm.secorder']==='flow,act,list,bo',ls['mm.secorder']);
move(A,10);
ok('après le relâché : le pointeur ne déplace plus rien',order(A)==='secFlow,secAct,secSplit,secBo');

// --- clavier : ↑ sur la poignée du Classement (flux masqué : saute par-dessus) ; ↓ en dernier : rien
key(A,'list','ArrowUp');
ok('flèche ↑ : le Classement passe au-dessus de Groupes actifs, ordre mémorisé',order(A)==='secFlow,secSplit,secAct,secBo'&&ls['mm.secorder']==='flow,list,act,bo',order(A));
key(A,'list','ArrowUp');
ok('flèche ↑ en tête des blocs visibles : rien ne bouge (le flux masqué ne compte pas)',order(A)==='secFlow,secSplit,secAct,secBo');
key(A,'bo','ArrowDown');
ok('flèche ↓ sur le dernier bloc : rien ne bouge',ls['mm.secorder']==='flow,list,act,bo');

// --- relu au chargement ; clés inconnues ignorées, blocs manquants complétés dans l'ordre du HTML
A=boot({'mm.secview':'tv','mm.secorder':'bo,zz,list'}); tab(A);
ok('ordre mémorisé relu au chargement (clé inconnue ignorée, blocs manquants complétés)',order(A)==='secBo,secSplit,secFlow,secAct',order(A));
process.exit(bad?1:0);
