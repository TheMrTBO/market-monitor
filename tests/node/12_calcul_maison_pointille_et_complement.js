// Calcul maison (breadth_data.js) : surimpression en pointillé sur l'histogramme +4 % / −4 %, complément des séances que
// Stockbee n'a pas publiées, statut et contrôle croisé en pied de page. Sans le fichier, le dashboard doit rester inchangé.
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
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,console};
  sb.location={search:''};sb.window=sb;vm.createContext(sb);
  for(const f of ['stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js','status_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(extra)vm.runInContext(extra,sb);
  vm.runInContext(main,sb);
  return {L,els,R,Sx,sb,$};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ownJs=fs.readFileSync('breadth_data.js','utf8');
const own=JSON.parse(ownJs.slice(ownJs.indexOf('=')+1).trim().replace(/;$/,''));
assert(own.rows.length>=10,'breadth_data.js : au moins 10 séances');
assert.deepStrictEqual(own.columns,['date','up4','down4','ratio5','ratio10']);

// 1. sans le fichier : aucune surimpression et pas d'exception (comportement d'avant)
const base=boot(null);
const strokesBase=(base.Sx.hist||{})['#9aa0a6']||0;
// 2. avec le fichier : deux traits pointillés de plus (+4 % et −4 %) sur l'histogramme +4 %
// status_data.js (écrit par update_all.py) n'a l'étape « breadth » qu'après le premier passage du workflow : on la simule
const STATUS_BREADTH=`window.STATUS.sources.breadth={ok:true,attempts:1,last:'${own.asof}'};`;
const A=boot(ownJs+STATUS_BREADTH);
const strokesOwn=(A.Sx.hist||{})['#9aa0a6']||0;
assert(strokesOwn-strokesBase>=2,`surimpression pointillée absente (${strokesBase} -> ${strokesOwn})`);
// 3. pied de page : statut du calcul maison et contrôle croisé
const foot=strip(A.$('dataStatus')._h);
assert(/Calcul maison \d+ \S+ ✓/.test(foot),'statut « Calcul maison » absent du pied de page : '+foot);
assert(/écart calcul maison \/ Stockbee/.test(foot),'contrôle croisé absent du pied de page : '+foot);
// 4. séance absente chez Stockbee : complétée par le calcul maison (ligne du tableau, avec les valeurs)
const lastSb=vm.runInContext('STOCKBEE.rows[STOCKBEE.rows.length-1][0]',A.sb);
const next=new Date(lastSb+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
const nd=next.toISOString().slice(0,10);
const extra=`window.BREADTH_OWN={columns:${JSON.stringify(own.columns)},rows:${JSON.stringify(own.rows.concat([[nd,321,123,1.5,1.2]]))},asof:'${nd}',universe:${own.universe}};`;
const B=boot(extra+STATUS_BREADTH);
const tab=B.$('rows')._h;
assert(tab.includes(`data-d="${nd}"`),`séance ${nd} complétée par le calcul maison absente du tableau`);
const row=(tab.match(new RegExp(`<tr data-d="${nd}">[\\s\\S]*?</tr>`))||[''])[0];
assert(/>321<\/td><td[^>]*>123<\/td>/.test(row),'valeurs du calcul maison absentes de la ligne complétée');
console.log('ok : surimpression',strokesOwn-strokesBase,'traits | séance complétée',nd,'| pied de page :',foot.slice(-140));
