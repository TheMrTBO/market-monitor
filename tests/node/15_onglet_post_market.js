// Onglet Post-market : scan par volume, filtres Hausses / Baisses / Les deux / Résultats, tri, fiche, lendemain, séance de « Stats du »,
// graphique du titre (moteur commun, contexte propre) avec le point AH, vue mobile liste / détail.
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const SS={};
function boot(ls,pm,status){
  const L={},els={},DL={};let fillC='',strokeC='';const R={},Sx={},M={};
  const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):
    k==='fillRect'?(x,y,w,h)=>{(R[id]=R[id]||[]).push([fillC,x,y,w,h]);}:
    k==='moveTo'?(x,y)=>{(M[id]=M[id]||[]).push([x,y]);}:
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
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of ['stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(pm)sb.POSTMARKET=JSON.parse(JSON.stringify(pm));
  sb.STATUS=status||{updated:'2026-10-13T22:17:00+00:00',pm:'2026-10-13T22:17:00+00:00',sources:{}};sb.location={search:''};sb.clearTimeout=()=>{};sb.sessionStorage={getItem:k=>SS[k]??null,setItem:(k,v)=>{SS[k]=v;},removeItem:k=>{delete SS[k];}};
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}


let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const COLS=['t','s','n','sec','ind','c','ch','pc','pch','pv','rv','cap','flt','er','nx','ng'];
const row=(s,pch,pv,er,nx)=>['NASDAQ:'+s,s,s+' Inc.','Finance','Banks',10,1.5,+(10*(1+pch/100)).toFixed(2),pch,pv,1.2,2e9,5e7,er||'',nx??null,nx==null?null:0.5];
const dates=[];for(let i=0;i<70;i++){const d=new Date(Date.UTC(2026,6,1)+i*86400000);if(d.getUTCDay()%6)dates.push(d.toISOString().slice(0,10));}
const cut=dates.indexOf('2026-08-27')+1, D=dates.slice(0,cut);
const bars=n=>[0].concat(D.map((d,i)=>{const c=10+Math.sin(i/5)*n;return [c-0.2,c+0.4,c-0.5,c,100000+i];}));
const PM={cols:COLS,filters:{price:3,vol:100000,chg:4},
  snaps:[{d:'2026-08-26',at:'2026-08-27T00:15:00+00:00',closed:true,nextd:'2026-08-27',rows:[row('OLD',9,500000,'',6.2)]},
         {d:'2026-08-27',at:'2026-08-27T22:17:00+00:00',closed:false,rows:[row('BBB',5,2000000),row('AAA',12,900000,'amc'),row('CCC',-7,300000,'bmo'),row('DDD',-30,150000)]}],
  hist:{dates:D,bars:{AAA:bars(1),BBB:bars(2),CCC:bars(1.5)}}};
const heads=A=>[...A.$('pmHead')._h.matchAll(/data-k="([^"]+)"/g)].map(m=>m[1]);
const syms=A=>[...A.$('pmRows')._h.matchAll(/<tr data-s="([^"]+)"/g)].map(m=>m[1]);
const go=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}});

// 1) dernier instantané : hausses triées par volume post-market, colonnes, badges, méta
let A=boot({},PM); go(A);
ok('hausses par volume AH en dollars', syms(A).join()==='BBB,AAA', syms(A).join());
ok('Vol AH $ = actions × cours post-market (BBB : 2 M × 10,50)', /data-s="BBB".*?<td>21,0 M<\/td><td>2,0 M<\/td>/.test(A.$('pmRows')._h));
ok('colonnes (sans Lendemain tant que la séance suivante n\'est pas jouée)', heads(A).join()==='sym,pch,dv,pv,rv,cap', heads(A).join());
ok('plus de colonne Rés. ni de badge dans la liste', !/erb|AMC|BMO/.test(A.$('pmRows')._h));
ok('méta : séance, en cours, heure du relevé', /27 août 2026 · post-market en cours · relevé à/.test(A.$('pmMeta')._t), A.$('pmMeta')._t);
ok('compteurs des filtres', /Hausses<span>2<\/span>.*Baisses<span>2<\/span>.*Les deux<span>4<\/span>.*Résultats<span>1<\/span>/.test(A.$('pmFilt')._h));
// 2) fiche + graphique du titre sélectionné (1re ligne)
ok('fiche : titre', A.$('pmTitle')._t==='BBB · BBB Inc.', A.$('pmTitle')._t);
ok('fiche : post-market et lendemain pas encore joué', /Post-market.*\+5,00 %/.test(strip(A.$('pmFacts')._h)) && /21,0 M \$ · 2,0 M actions/.test(strip(A.$('pmFacts')._h)) && /séance pas encore jouée/.test(A.$('pmFacts')._h));
ok('graphique : bougies dessinées', (A.R.pmCanvas||[]).length>20, (A.R.pmCanvas||[]).length);
ok('lien TradingView', /tradingview\.com\/chart\/\?symbol=NASDAQ%3ABBB/.test(A.$('pmNote')._h));
// 3) filtres : Baisses, Résultats, Les deux ; tri par variation
A.L.pmFilt.click({target:{closest:()=>({dataset:{dir:'down'}})}});
ok('baisses par volume', syms(A).join()==='CCC,DDD', syms(A).join());
A.L.pmFilt.click({target:{closest:()=>({dataset:{er:'1'}})}});
ok('baisses + résultats', syms(A).join()==='CCC', syms(A).join());
A.L.pmFilt.click({target:{closest:()=>({dataset:{dir:'all'}})}});
ok('les deux + résultats', syms(A).join()==='AAA,CCC', syms(A).join());
A.L.pmFilt.click({target:{closest:()=>({dataset:{er:'1'}})}});
A.L.pmHead.click({target:{closest:()=>({dataset:{k:'pch'}})}});
ok('tri Var AH décroissant', syms(A).join()==='AAA,BBB,CCC,DDD', syms(A).join());
A.L.pmHead.click({target:{closest:()=>({dataset:{k:'pch'}})}});
ok('tri Var AH croissant', syms(A).join()==='DDD,CCC,BBB,AAA', syms(A).join());
ok('préférences mémorisées', A.sb.localStorage.getItem('mm.pmdir')==='all' && A.sb.localStorage.getItem('mm.pmer')==='0');
// 4) titre sans graphique
A.L.pmRows.click({target:{closest:()=>({dataset:{s:'DDD'}})}});
ok('titre sans graphique signalé', /graphique indisponible/.test(A.$('pmInfo')._t), A.$('pmInfo')._t);
// 5) « Stats du » : séance précédente -> instantané du 26 août, colonne Lendemain
A.L.dPick.change({target:{value:'2026-08-26'}});
ok('Stats du 26 août : instantané du 26', syms(A).join()==='OLD' && /26 août 2026 · post-market terminé/.test(A.$('pmMeta')._t), A.$('pmMeta')._t);
ok('colonne Lendemain', heads(A).includes('nx') && /\+6,20 %/.test(A.$('pmRows')._h));
A.L.dPick.change({target:{value:'2026-08-03'}});
ok('séance sans scan : message', /Pas de scan pour cette séance/.test(A.$('pmRows')._h));
A.L.dToday.click();
ok('Aujourd\'hui : dernier instantané', syms(A).length===4);
// 5 bis) « Stats du » sur Post-market : le scan du soir (plus récent que Stockbee) est la séance affichée et sélectionnable
{
  const lastSb=A.sb.STOCKBEE.rows[A.sb.STOCKBEE.rows.length-1][0], nd=new Date(lastSb+'T00:00:00Z'); do nd.setUTCDate(nd.getUTCDate()+1); while(nd.getUTCDay()%6===0);
  const nxt=nd.toISOString().slice(0,10), P2=JSON.parse(JSON.stringify(PM)); P2.snaps[1].d=nxt;
  const E=boot({},P2); E.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}});
  ok('Stats du = date du scan du soir', E.$('dPick').value===nxt && E.$('dPick').max===nxt, E.$('dPick').value+' (Stockbee : '+lastSb+')');
  ok('libellé « dernier scan publié »', E.$('dInfo')._t==='dernier scan publié', E.$('dInfo')._t);
  ok('badge du haut = scan affiché (pas la séance Stockbee)', /Scan du .* · relevé à/.test(strip(E.$('refreshBtn')._h)), strip(E.$('refreshBtn')._h));
  E.L.dPrev.click(); ok('‹ : séance Stockbee précédente', E.$('dPick').value===lastSb && /Pas de scan|<tr data-s=/.test(E.$('pmRows')._h), E.$('dPick').value);
  E.L.dNext.click(); ok('› : retour au scan du soir', E.$('dPick').value===nxt && /BBB/.test(E.$('pmRows')._h));
  E.L.tabs.click({target:{closest:()=>({dataset:{tab:'main'}})}});
  ok('onglet MM : Stats du revient aux séances Stockbee', E.$('dPick').max===lastSb, E.$('dPick').max);
  ok('onglet MM : badge = séance Stockbee', /^Séance du/.test(strip(E.$('refreshBtn')._h)), strip(E.$('refreshBtn')._h));
}
// 6) mobile : toucher une ligne ouvre la fiche, « ‹ Scan » revient
A.sb.innerWidth=375;
A.L.pmRows.click({target:{closest:()=>({dataset:{s:'AAA'}})}});
const det=()=>A.$('view-pm').classList._s.has('detail');
ok('mobile : détail', det() && A.$('pmTitle')._t==='AAA · AAA Inc.');
A.L.pmBack.click({}); ok('mobile : retour à la liste', !det());
// 7) sans fichier / sans instantané
const B=boot({}); B.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}});
ok('sans fichier : message', /Données introuvables/.test(B.$('pmRows')._h));
const C=boot({},Object.assign({},PM,{snaps:[]})); C.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}});
ok('sans instantané : message', /Aucun scan relevé/.test(C.$('pmRows')._h));
// 8) les autres onglets ne sont pas touchés : retour à Secteurs
A.sb.innerWidth=1200; A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
ok('retour Secteurs', /<tr data-s=/.test(A.$('secRows')._h));
// 9) bouton « Actualiser » : recharge la page avec des fichiers frais ; après rechargement, message selon ce qui a changé
(async()=>{
  A.sb.fetch=async()=>({text:async()=>'window.STATUS = {"updated":"2026-10-13T22:17:00+00:00","pm":"2026-10-13T22:17:00+00:00","sources":{}};'});
  A.sb.location.search='';
  await A.L.refreshBtn.click();
  ok('clic : rechargement avec fichiers frais', /^\?v=\d+$/.test(A.sb.location.search), A.sb.location.search);
  ok('clic : état d\'avant mémorisé pour la session', JSON.parse(SS['mm.reload']||'{}').pm==='2026-10-13T22:17:00+00:00');
  const F=boot({'mm.tab':'pm'},PM,{updated:'2026-10-13T22:17:00+00:00',pm:'2026-10-13T22:47:00+00:00',sources:{}});
  ok('après rechargement, nouveau scan : « Actualisé : nouvelles données chargées »', /Actualisé : nouvelles données chargées/.test(F.$('toast')._h) && /dernier scan post-market relevé à/.test(F.$('toast')._h), strip(F.$('toast')._h).slice(0,140));
  SS['mm.reload']=JSON.stringify({u:'2026-10-13T22:17:00+00:00',pm:'2026-10-13T22:47:00+00:00'});
  const G=boot({'mm.tab':'pm'},PM,{updated:'2026-10-13T22:17:00+00:00',pm:'2026-10-13T22:47:00+00:00',sources:{}});
  ok('après rechargement, rien de neuf : « Déjà à jour »', /Déjà à jour/.test(G.$('toast')._h) && !SS['mm.reload'], strip(G.$('toast')._h).slice(0,140));
  if(bad)process.exit(1);
})();
