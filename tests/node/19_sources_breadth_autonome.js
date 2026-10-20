// Décision du 20/10/2026 : nos chiffres s'affichent dès qu'ils existent (calcul maison, puis relevé TradingView pour le T2108),
// avec leur source sur chaque case ; Stockbee reprend la main à sa publication et sert de contrôle (corrélation, écart).
// L'alerte d'extrême du T2108 attend un chiffre Stockbee.
const fs=require('fs'),vm=require('vm'),assert=require('assert');let ok6;
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
  for(const f of ['config_data.js','stockbee_data.js','breadth_data.js','prices_data.js','vix_data.js','sectors_data.js','status_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(extra)vm.runInContext(extra,sb);
  vm.runInContext(main,sb);
  return {L,els,R,Sx,sb,$};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tile=(h,k)=>{const i=h.indexOf(`data-k="${k}"`);assert(i>=0,'case '+k+' absente');const j=h.indexOf('<div class="kpi',i);return h.slice(h.lastIndexOf('<div class="kpi',i),j<0?undefined:j);};
const ownJs=fs.readFileSync('breadth_data.js','utf8'), own=JSON.parse(ownJs.slice(ownJs.indexOf('=')+1).trim().replace(/;$/,''));
const day=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const lastOwn=own.rows[own.rows.length-1][0];
// séances fictives après toutes les données : nd = calcul maison seul, nd2 = relevé TradingView seul
const nd=day(lastOwn,30), nd2=day(lastOwn,31);
const ownRow=[nd,321,123,1.5,1.2,50,100,600,1600,15];
const OWN2=`window.BREADTH_OWN.rows.push(${JSON.stringify(ownRow)});`;
// 1. Stockbee n'a pas publié nd : les cinq cases prennent le calcul maison, étiquetées « maison », sans « en attente »
const A=boot(OWN2), kp=A.$('kpis')._h;
assert(!/en attente/.test(strip(kp)),'calcul maison disponible : aucune case en attente attendue : '+strip(kp).slice(0,300));
assert.strictEqual((kp.match(/class="ksrc s-own"/g)||[]).length,5,'5 étiquettes « maison » attendues');
assert(/>maison</.test(tile(kp,'rm'))&&/0,50/.test(tile(kp,'rm')),'ratio mois maison 50/100 = 0,50 attendu : '+strip(tile(kp,'rm')));
assert(/0,38/.test(tile(kp,'rq')),'ratio trimestre maison 600/1600 = 0,38 attendu');
// 2. T2108 maison à 15 % (< 20) : valeur et zone affichées, mais pas d'alerte (case non orange, sans bandeau)
const t=tile(kp,'t2108');
assert(/15,0 %/.test(t),'T2108 maison 15,0 % attendu : '+strip(t));
assert(!/st-warn|hot-warn/.test(t),'T2108 hors Stockbee : pas d\'alerte attendue');
const note=strip(A.$('kpinote')._h);
assert(/calcul maison .*Stockbee pas encore publié/.test(note),'note : sources à préciser : '+note.slice(0,300));
// 3. même séance publiée par Stockbee avec T2108 = 15 : l'alerte revient, étiquettes « Stockbee »
const sbRow=`(()=>{const c=STOCKBEE.columns,r=c.map(()=>null);const v={date:'${nd}',up4:320,down4:125,ratio5:1.5,ratio10:1.2,up25m:52,down25m:99,up25q:610,down25q:1590,universe:6550,t2108:15};c.forEach((k,i)=>{if(k in v)r[i]=v[k];});STOCKBEE.rows.push(r);})();`;
const B=boot(OWN2+sbRow), kb=B.$('kpis')._h;
assert.strictEqual((kb.match(/class="ksrc s-sb"/g)||[]).length,5,'5 étiquettes « Stockbee » attendues');
assert(/st-warn/.test(tile(kb,'t2108')),'T2108 Stockbee à 15 % : alerte attendue');
assert(/calcul maison 15,0 %/.test(tile(kb,'t2108')),'infobulle de la source : notre T2108 du jour attendu');
// 4. nd2 : seul TradingView a la séance → T2108 TradingView, le reste en attente
const TV=`window.TV_BREADTH={columns:['date','t2108','n'],rows:[['${nd}',16.2,5100],['${nd2}',18.5,5100]],asof:'${nd2}'};`;
const C=boot(OWN2+TV), kc=C.$('kpis')._h, tc=tile(kc,'t2108');
assert(/18,5 %/.test(tc)&&/class="ksrc s-tv"/.test(tc),'T2108 TradingView 18,5 % attendu : '+strip(tc));
assert(!/st-warn|hot-warn/.test(tc),'T2108 TradingView : pas d\'alerte attendue');
assert(/en attente/.test(strip(tile(kc,'solde'))),'±4 % : en attente (TradingView ne le fournit pas)');
// 5. pied de page : contrôle croisé de chaque source avec Stockbee
const foot=strip(C.$('dataStatus')._h);
for(const k of ['±4 %','ratio mois','ratio trim.','T2108 maison','T2108 TradingView'])assert(foot.includes(k+' '),'contrôle « '+k+' » absent : '+foot.slice(-400));
// 6. ±4 % TradingView (5 colonnes) : la séance nd2 que ni Stockbee ni Polygon n'ont prend les ±4 % TradingView et le ratio 5 j
// recalculé sur les 5 dernières séances ; les ±25 % restent en attente (TradingView ne les fournit pas)
const TV5=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${nd2}',18.5,5100,200,100]],asof:'${nd2}'};`;
const E=boot(OWN2+TV5), ke=E.$('kpis')._h, ts=tile(ke,'solde'), tr=tile(ke,'r5');
ok6=/\+100/.test(strip(ts))&&/class="ksrc s-tv"/.test(ts);
assert(ok6,'±4 % TradingView : solde +100 étiqueté TradingView attendu : '+strip(ts));
const M=new Map();                                       // séances fusionnées comme le dashboard : Stockbee, puis maison, puis TradingView
{ const S=E.sb.STOCKBEE, si=Object.fromEntries(S.columns.map((c,i)=>[c,i])); S.rows.forEach(r=>M.set(r[0],[r[si.up4],r[si.down4]]));
  const O=E.sb.BREADTH_OWN; O.rows.forEach(r=>{if(!M.has(r[0]))M.set(r[0],[r[1],r[2]]);}); M.set(nd2,[200,100]); }
const ds=[...M.keys()].sort(), i2=ds.indexOf(nd2), w=ds.slice(i2-4,i2+1).map(d=>M.get(d));
const r5=Math.round(100*w.reduce((s,x)=>s+x[0],0)/w.reduce((s,x)=>s+x[1],0))/100;
assert(strip(tr).includes(r5.toFixed(2).replace('.',',')),'ratio 5 j recalculé '+r5+' attendu : '+strip(tr));
assert(/en attente/.test(strip(tile(ke,'rm')))&&/en attente/.test(strip(tile(ke,'rq'))),'±25 % : en attente (pas fournis par TradingView)');
assert(/±4 % TradingView : \d+ séance/.test(strip(E.$('dataStatus')._h)),'pied de page : contrôle « ±4 % TradingView » attendu');
console.log('ok : maison x5 sans attente · T2108 maison sans alerte · Stockbee reprend la main (alerte) · T2108 TradingView seul · contrôles :',foot.slice(foot.indexOf('Contrôle'),foot.indexOf('Contrôle')+120));
