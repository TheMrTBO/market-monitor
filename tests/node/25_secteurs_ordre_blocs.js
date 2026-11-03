// Onglet Secteurs, ordre des blocs sous la frise (exception au gel du 27/10/2026) : poignée dans l'en-tête des 6 blocs (Ce matin,
// flux, Breakouts 9M +4 %, Convergence des 9M, Classement, carte de rotation ; Ce matin et la carte depuis le 03/11/2026 ; Leaders
// actifs dans le Classement depuis le 02/11/2026), glisser-déposer au pointeur (souris, doigt) et flèches ↑ ↓ au clavier, ordre
// mémorisé (mm.secorder) et relu au chargement ; ordre par défaut = HTML (rien n'est déplacé) ; clés inconnues ignorées ; un bloc
// absent d'un ordre mémorisé avant lui reprend sa place par défaut.
const fs=require('fs'),vm=require('vm');
require('./lib/fixtures');   // industries_data.js, tickers_data.js, industries/ : copie figée (tests/fixtures/)
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const BLK={now:'secNow',flow:'secFlow',bo:'secBo',map:'secMapRow',list:'secSplit',rrg:'secRrg'};
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
  const view=$('view-sec'); view.kids=['secNow','secFlow','secBo','secMapRow','secSplit','secRrg','secEnd']; view.moves=0;   // ordre du HTML
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
const order=A=>A.view.kids.filter(x=>x!=='secEnd').join(',');
const handle=k=>({closest:s=>s==='.dragh'?{dataset:{drag:k}}:null});
const down=(A,k)=>A.L['view-sec'].pointerdown({target:handle(k),button:0,preventDefault(){}});
const move=(A,y)=>A.DL.pointermove.forEach(f=>f({clientY:y}));
const up=A=>A.DL.pointerup.forEach(f=>f({}));
const key=(A,k,kk)=>A.L['view-sec'].keydown({target:handle(k),key:kk,preventDefault(){}});

// --- ordre par défaut : rien n'est déplacé ; une poignée dans chaque en-tête
let ls={'mm.secview':'tv'}, A=boot(ls); tab(A);
const D='secNow,secFlow,secBo,secMapRow,secSplit,secRrg';
ok('ordre par défaut (HTML) : aucun bloc déplacé au chargement',A.view.moves===0&&order(A)===D,A.view.moves+' '+order(A));
ok('poignée dans Ce matin, Breakouts 9M +4 %, Convergence des 9M (avec sa carte), Classement, carte de rotation (flux : à son rendu) ; plus de bloc Leaders actifs à part',
   /data-drag="now"/.test(A.$('secNow')._h)&&!/data-drag="act"/.test(A.$('secAct')._h)&&/data-drag="bo"/.test(A.$('secBo')._h)&&/data-drag="map"/.test(A.$('secZone')._h)
   &&/class="dragh"[^>]*data-drag="list"/.test(html)&&/class="dragh"[^>]*data-drag="rrg"/.test(html)&&html.includes("<h4>${dragH('flow')}"));

// --- blocs visibles (flux masqué), 100 px chacun : now 0-100, bo 100-200, map 200-300, list 300-400, rrg 400-500
down(A,'map');
ok('prise de la poignée : bloc marqué, curseur de glisser',A.$('secMapRow').classList.contains('dragging')&&A.sb.document.body.classList.contains('secdrag'));
move(A,140);
ok('glissé au-dessus du milieu de Breakouts : Convergence passe devant',order(A)==='secNow,secFlow,secMapRow,secBo,secSplit,secRrg',order(A));
move(A,145);
ok('pointeur immobile sur la même place : pas de nouveau déplacement',order(A)==='secNow,secFlow,secMapRow,secBo,secSplit,secRrg');
move(A,490);
ok('glissé sous le milieu de la carte de rotation : Convergence en dernier',order(A)==='secNow,secFlow,secBo,secSplit,secRrg,secMapRow'&&A.view.kids[6]==='secEnd',order(A));
up(A);
ok('relâché : marque retirée, ordre mémorisé',!A.$('secMapRow').classList.contains('dragging')&&!A.sb.document.body.classList.contains('secdrag')&&ls['mm.secorder']==='now,flow,bo,list,rrg,map',ls['mm.secorder']);
move(A,10);
ok('après le relâché : le pointeur ne déplace plus rien',order(A)==='secNow,secFlow,secBo,secSplit,secRrg,secMapRow');

// --- la carte de rotation se déplace comme les autres (03/11/2026) : en tête, au-dessus de Ce matin
down(A,'rrg'); move(A,10); up(A);
ok('carte de rotation glissée en tête des blocs',order(A)==='secRrg,secNow,secFlow,secBo,secSplit,secMapRow'&&ls['mm.secorder']==='rrg,now,flow,bo,list,map',order(A));

// --- clavier : ↑ sur la poignée du Classement ; en tête des blocs visibles : rien ; ↓ en dernier : rien
key(A,'list','ArrowUp');
ok('flèche ↑ : le Classement passe au-dessus de Breakouts, ordre mémorisé',order(A)==='secRrg,secNow,secFlow,secSplit,secBo,secMapRow'&&ls['mm.secorder']==='rrg,now,flow,list,bo,map',order(A));
key(A,'rrg','ArrowUp');
ok('flèche ↑ en tête des blocs visibles : rien ne bouge',ls['mm.secorder']==='rrg,now,flow,list,bo,map');
key(A,'map','ArrowDown');
ok('flèche ↓ sur le dernier bloc : rien ne bouge',ls['mm.secorder']==='rrg,now,flow,list,bo,map');

// --- relu au chargement ; clés inconnues ignorées (dont l'ancien « act ») ; blocs manquants à leur place par défaut
A=boot({'mm.secview':'tv','mm.secorder':'bo,act,zz,list'}); tab(A);
ok('ordre mémorisé relu au chargement (clé inconnue ignorée, blocs manquants à leur place par défaut)',order(A)==='secNow,secFlow,secBo,secMapRow,secSplit,secRrg',order(A));
A=boot({'mm.secview':'tv','mm.secorder':'flow,list,bo,map'}); tab(A);
ok('ordre d\'avant le 03/11/2026 (sans Ce matin ni la carte) : gardé, Ce matin en tête et la carte en dernier',order(A)==='secNow,secFlow,secSplit,secBo,secMapRow,secRrg',order(A));
process.exit(bad?1:0);
