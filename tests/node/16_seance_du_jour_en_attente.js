// Fin de séance : la séance du jour (QQQ a coté, breadth pas encore publié) devient la séance de tous les onglets ;
// les cases du MM affichent « — » et « en attente des données » au lieu des chiffres de la veille ; le badge et SA le signalent.
// Stockbee est tronqué de 3 séances et le calcul maison retiré : la séance en attente existe quelle que soit l'heure du test.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(extra){
  const L={},els={},DL={};let fillC='',strokeC='';const R={},Sx={};
  const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):
    k==='fillRect'?(x,y,w,h)=>{(R[id]=R[id]||[]).push([fillC,x,y,w,h]);}:
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
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:()=>null,setItem(){}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6','--text':'#1b2230'})[k]||'#000'}),setTimeout,console};
  sb.location={search:''};sb.window=sb;vm.createContext(sb);
  for(const f of ['stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js','status_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(extra)vm.runInContext(extra,sb);
  vm.runInContext(main,sb);
  return {L,els,R,Sx,sb,$};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const cut=`STOCKBEE.rows=STOCKBEE.rows.slice(0,-3);window.BREADTH_OWN=null;`;
const A=boot(cut);
const lastSb=vm.runInContext('STOCKBEE.rows[STOCKBEE.rows.length-1][0]',A.sb), q=A.sb.PRICES.QQQ.map(r=>r[0]);
const pick=A.$('dPick');
assert(pick.max>lastSb && q.includes(pick.max),`Stats du : séance du jour attendue après ${lastSb}, obtenu ${pick.max}`);
assert(pick.value===pick.max,'Stats du doit être sur la séance du jour');
const kp=strip(A.$('kpis')._h), note=strip(A.$('kpinote')._h);
assert((kp.match(/en attente/g)||[]).length===5,'5 cases en attente attendues : '+kp.slice(0,300));
assert(/État au .* en attente des données : ±4 %, ±25 %, T2108/.test(note),'note du bandeau : '+note.slice(0,200));
assert(/breadth en attente/.test(strip(A.$('refreshBtn')._h)),'badge du haut : '+strip(A.$('refreshBtn')._h));
// une séance passée choisie dans « Stats du » : chiffres normaux, plus d'attente
A.L.dPick.change({target:{value:lastSb}});
assert(!/en attente/.test(strip(A.$('kpis')._h)),'séance passée : pas d\'attente');
// sans les données Stockbee tronquées, les données réelles : aucun « en attente » si Stockbee est à jour
const B=boot(`window.BREADTH_OWN=null;`), lastB=vm.runInContext('STOCKBEE.rows[STOCKBEE.rows.length-1][0]',B.sb);
const pend=B.$('dPick').max>lastB;
assert(pend===/en attente/.test(strip(B.$('kpis')._h)),'données réelles : « en attente » seulement si une séance du jour manque');
console.log('ok : séance du jour',pick.max,'(Stockbee',lastSb+') · 5 cases en attente · badge et note · séance passée normale · données réelles :',pend?'séance du jour en attente':'à jour');
