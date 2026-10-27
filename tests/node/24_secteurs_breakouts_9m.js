// Onglet Secteurs, bloc « Breakouts 9M +4 % » (scan TC2000 de l'utilisateur, exception au gel du 27/10/2026) : listes du
// relevé TradingView (tv_breadth_data.js, clé breakouts). Dernier relevé sans séance choisie (le soir, avant Polygon), séance
// choisie sinon (absente : message), ★ des leaders actifs, limite et « + N autres », repli mémorisé, copie et envoi vers
// Tickers (liste, fiche d'un titre), bulle ⓘ (règle lue dans la config), bloc absent sans liste.
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
const chips=A=>[...A.$('secBo')._h.matchAll(/data-bos="([^"]+)"/g)].map(m=>m[1]);
const boClick=(A,ds)=>A.L.secBo.click({target:{closest:()=>({dataset:ds,querySelector:()=>({set textContent(v){}}),classList:{toggle(){}}})}});
const tip=(A,id)=>{A.DL.click.forEach(f=>f({target:{closest:sel=>sel==='.tipbtn'?{dataset:{tip:id},setAttribute(){},getBoundingClientRect:()=>({left:0,bottom:0})}:null},stopPropagation(){},preventDefault(){}}));return strip(A.$('pop')._h);};

const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,''));
const CFG0=JSON.parse(fs.readFileSync('config_data.js','utf8').replace(/^[\s\S]*?window\.MM_CONFIG = /,'').replace(/;\s*$/,'')), BOC=CFG0.sectors.breakouts;
const last=IND0.dates[IND0.dates.length-1], prev=IND0.dates[IND0.dates.length-2];
const D0=IND0.leaders.days[IND0.leaders.days.length-1], leader=D0[0][0];
const evening='2099-01-02';                          // relevé du soir, plus récent que la dernière séance Polygon
const big=Array.from({length:BOC.list_limit+5},(_,i)=>['T'+i,40-i/2,9e6+i,1.5]);
const tvb=lists=>`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${last}',50,5100,100,90]],asof:'${last}',bo_columns:['ticker','pct','volume','vol_ratio'],breakouts:${JSON.stringify(lists)}};`;

// --- sans liste : bloc absent
let A=boot({'mm.secview':'tv'},{after:tvb({})}); tab(A);
ok('sans liste (fichier d\'avant le 27/10/2026) : bloc masqué',A.$('secBo').hidden===true);

// --- dernier relevé (soir) sans séance choisie ; séance choisie ; séance sans relevé
const ls={'mm.secview':'tv'};
A=boot(ls,{after:tvb({[last]:[[leader,12.5,20e6,2.0],['ZZZ',4.1,9e6,1.1]],[evening]:big})}); tab(A);
let h=strip(A.$('secBo')._h);
ok('sans séance choisie : dernier relevé (soir), avant la séance des cases',A.$('secBo').hidden===false&&h.includes(`${big.length} titres`)&&h.includes('Relevé TradingView du soir'),h.slice(0,160));
ok(`limite : ${BOC.list_limit} titres puis « + 5 autres »`,chips(A).length===BOC.list_limit&&h.includes('+ 5 autres'));
boClick(A,{boall:'1'});
ok('« + 5 autres » : liste complète',chips(A).length===big.length);
A.L.dPick.change({target:{value:last}});
h=strip(A.$('secBo')._h);
ok('séance choisie : sa liste, de la plus forte hausse à la plus faible',JSON.stringify(chips(A))===JSON.stringify([leader,'ZZZ'])&&!h.includes('Relevé TradingView du soir'),chips(A).join(','));
ok('★ absent pour un titre qui n\'est pas leader',!/class="bochip lead" data-bos="ZZZ"/.test(A.$('secBo')._h));
ok('titre : % du jour, volume en millions, multiple de la veille',h.includes('+12,5 %')&&h.includes('20,0 M · ×2,0')&&!h.includes('×2,0 veille'));
A.L.dPick.change({target:{value:prev}});
ok('séance sans relevé : message (pas d\'historique TradingView)',strip(A.$('secBo')._h).includes('Pas de relevé pour cette séance'));
A.L.dPick.change({target:{value:last}});

// --- ★ : tous les leaders de la séance dans la liste → autant d'étoiles que de « Leaders actifs (N) » (groupes neufs ou chauds)
const C=boot({'mm.secview':'tv'},{after:tvb({[last]:D0.map(([s],i)=>[s,30-i/100,9e6,1.2])})}); tab(C); boClick(C,{boall:'1'});
const nAct=+((C.$('secAct')._h.match(/data-actgo="1">[^(]*\((\d+)\)/)||[])[1]);
const nStar=(C.$('secBo')._h.match(/class="bochip lead"/g)||[]).length;
ok('★ = leaders actifs de la séance (même compte que le bloc Groupes actifs)',nAct>0&&nStar===nAct&&strip(C.$('secBo')._h).includes(`★ ${nAct} leader`),`${nStar} / ${nAct}`);

// --- envoi vers Tickers (fiche d'un titre), repli mémorisé, bulle
boClick(A,{bos:'ZZZ'});
ok('toucher un titre : la liste part dans Tickers, le titre est sélectionné',A.$('tkInput').value===`${leader}, ZZZ`&&ls['mm.tklist']===`${leader}, ZZZ`);
tab(A); A.L.dPick.change({target:{value:last}});
boClick(A,{bofold:'1'});
h=strip(A.$('secBo')._h);
ok('repli mémorisé, résumé avec les premiers tickers',ls['mm.fold.bo']==='1'&&A.$('secBo')._h.includes('aria-expanded="false"')&&h.includes(`${leader}, ZZZ`)&&!/data-bos=/.test(A.$('secBo')._h));
const t=tip(A,'bo');
ok('bulle : règle lue dans la config (seuil de volume, +4 %)',t.includes(BOC.label)&&t.includes('8 900 000')&&t.includes('1,04'),t.slice(0,140));
const B2=boot({...ls},{after:tvb({[last]:[['ZZZ',4.1,9e6,1.1]]})}); tab(B2);
ok('repli relu au chargement suivant',B2.$('secBo')._h.includes('aria-expanded="false"'));
process.exit(bad?1:0);
