// Relevés en séance (05/11/2026, fetch_intraday.py, config/intraday.toml) : la séance du JOUR DU CALENDRIER (heure de New York)
// devient celle de l'onglet MM, provisoire, comme une 4e source (« en séance ») après Stockbee, le calcul maison et TradingView.
// Vérifie : « Stats du » sur le jour même, cases remplies et étiquetées « en séance », note et badge du haut, bandeau avec les deux
// dates (séance en cours, séance close d'avant), bougie partielle de QQQ (7e valeur = 1), aucun record 3 mois, phase provisoire
// (calcul maison jusqu'à la veille), bandeau masqué si une séance passée est choisie ; relevé d'un autre jour ou séance déjà
// publiée : rien ne change.
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
  for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js','status_data.js','breadth_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(extra)vm.runInContext(extra,sb);
  vm.runInContext(main,sb);
  return {L,els,R,Sx,sb,$};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

const CFG=JSON.parse(fs.readFileSync('config_data.js','utf8').replace(/^[^=]*=\s*/s,'').replace(/;\s*$/,'')), IT=CFG.intraday, X=IT.text;
const NYDAY="new Intl.DateTimeFormat('en-CA',{timeZone:MM_CONFIG.market.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())";
// séance du jour retirée de toutes les sources (le test tourne quel que soit le jour), calcul maison gardé jusqu'à la veille
const cut=`{const T=${NYDAY};STOCKBEE.rows=STOCKBEE.rows.filter(r=>r[0]<T);window.TV_BREADTH=null;window.VIX=VIX.filter(r=>r[0]<T);
  if(window.BREADTH_OWN)BREADTH_OWN.rows=BREADTH_OWN.rows.filter(r=>r[0]<T);for(const n of ['QQQ','IWM'])PRICES[n]=PRICES[n].filter(r=>r[0]<T);
  const q=PRICES.QQQ[PRICES.QQQ.length-1][0];if(window.BREADTH_OWN)BREADTH_OWN.rows=BREADTH_OWN.rows.filter(r=>r[0]<=q);}`;
const data=day=>`window.INTRADAY={date:${day},rule:{pct:4,min_volume:100000},delay:15,snaps:[
  {slot:'12:00',at:'2026-11-05T17:00:05+00:00',data_at:'11:45',n:5000,t2108:41.25,up4:33,down4:54,long:{up25m:150,down25m:290,up25q:700,down25q:1400,t2108:43.9,n:5100}},
  {slot:'15:30',at:'2026-11-05T20:30:05+00:00',data_at:'15:15',n:5000,t2108:44.5,up4:118,down4:64,long:{up25m:160,down25m:280,up25q:720,down25q:1380,t2108:47.2,n:5110},
   idx:{QQQ:[683.12,683.65,651.91,652.49,38379308],IWM:[283.75,284.7,275.37,275.43,12549138],VIX:[17.14,28.09,16.7,25.26,null]}}]};`;
const A=boot(cut+data(NYDAY)), h=strip(A.$('kpis')._h), today=vm.runInContext(NYDAY,A.sb);
const long=d=>new Date(d+'T00:00:00Z').toLocaleDateString('fr-FR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
const prevDay=vm.runInContext('STOCKBEE.rows[STOCKBEE.rows.length-1][0]',A.sb);
// 1) le jour du calendrier devient la séance affichée
assert(A.$('dPick').max===today&&A.$('dPick').value===today,'« Stats du » sur le jour même : '+A.$('dPick').value+' / '+today);
assert(A.$('dInfo').textContent===X.datebar,'à côté de « Aujourd\'hui » : '+A.$('dInfo').textContent);
assert(/\+54/.test(h)&&/\+118 \/ −64/.test(h),'case ±4 % : dernier relevé (+118 / −64, solde +54) : '+h.slice(0,200));
assert(/47,2 %/.test(h),'case T2108 : T2108 maison du relevé (47,2 %)');
assert((A.$('kpis')._h.match(/ksrc s-intra/g)||[]).length===5,'les 5 cases étiquetées « en séance » : '+(A.$('kpis')._h.match(/ksrc s-intra/g)||[]).length);
assert(!/en attente/.test(h),'aucune case « en attente »');
assert(!/recn/.test(A.$('kpis')._h.split('kidx')[1].split('</div></div>').slice(1).join('')),'aucun record 3 mois sur la séance en cours');
const note=strip(A.$('kpinote')._h);
assert(note.startsWith('● '+X.badge)&&note.includes('marché de 15:15'),'note sous les cases : séance en cours signalée : '+note.slice(0,120));
assert(strip(A.$('refreshBtn')._h).includes(X.badge),'badge du haut : séance en cours signalée');
// 2) bandeau : les deux dates, les relevés du jour
const bar=A.$('intraBar'), b=strip(bar._h);
assert(bar.hidden===false,'bandeau affiché');
assert(b.includes('Séance du '+long(today))&&b.includes(long(prevDay))&&prevDay<today,'bandeau : séance en cours ('+long(today)+') et séance close d\'avant ('+long(prevDay)+')');
assert(b.includes('12:00 : +33 / −54')&&b.includes('15:30 : +118 / −64'),'bandeau : évolution des relevés du jour');
// 3) bougie partielle et phase
const q=A.sb.PRICES.QQQ, last=q[q.length-1];
assert(last[0]===today&&last[6]===1&&last[4]===652.49,'QQQ : bougie partielle du jour ajoutée (marquée pas close)');
assert(!/recn/.test(A.$('kpis')._h.split('kidx')[1].split('</div></div>')[0]),'case Indices : pas de record 3 mois sur la bougie pas close');
const ph=strip(A.$('phaseBar')._h);
assert(ph.includes(X.phase),'phase : calculée en séance, source signalée : '+ph.slice(0,160));
assert(ph.startsWith(X.phase_prov)&&ph.includes('marché de 15:15')&&!/vaut pour la prochaine séance/.test(ph),'phase : titrée « '+X.phase_prov+' », heure des données, pas « vaut pour la prochaine séance » : '+ph.slice(0,120));
const v=A.sb.VIX[A.sb.VIX.length-1];
assert(v[0]===today&&v[5]===1&&v[4]===25.26&&/VIX 25,3/.test(h),'VIX : bougie partielle du jour, case T2108 « VIX 25,3 »');
// 3 bis) relevé sans calcul maison ni bougies : phase, indices et en-têtes VIDES (jamais les valeurs de la veille)
const bare=data(NYDAY).replace(/,long:\{[^}]*\}/g,'').replace(/,\s*idx:\{[^}]*\}/,'');
const E=boot(cut+bare), ph2=strip(E.$('phaseBar')._h), k2=E.$('kpis')._h, idxBox=strip(k2.split('kidx')[1].split('</div></div>')[0]);
assert(!/idx:/.test(bare)&&!/long:/.test(bare),'données du cas sans calcul maison ni bougies');
assert(ph2.includes(X.phase_label)&&ph2.includes('—')&&ph2.includes(X.phase_empty),'phase non calculable : champ vide et raison : '+ph2.slice(0,160));
assert(/QQQ — —/.test(idxBox)&&/IWM — —/.test(idxBox),'case Indices : QQQ et IWM vides sans cours du jour : '+idxBox);
assert(E.$('instPx')._h===''&&strip(E.$('ohlc')._h).includes(X.no_px),'en-tête et légende du graphique : vides (« '+X.no_px+' »)');
assert(/VIX —/.test(strip(k2)),'case T2108 : VIX vide sans relevé du jour');
// 4) séance passée choisie : bandeau masqué ; retour à aujourd'hui : bandeau revenu
A.L.dPick.change({target:{value:vm.runInContext('STOCKBEE.rows[STOCKBEE.rows.length-5][0]',A.sb)}});
assert(A.$('intraBar').hidden===true,'séance passée choisie : bandeau masqué');
A.L.dToday.click();
assert(A.$('intraBar').hidden===false,'retour à la dernière séance : bandeau revenu');
// 5) relevé d'un autre jour : rien ne change
const B=boot(cut+data("'2000-01-03'"));
assert(B.$('dPick').max<today&&B.$('intraBar').hidden===true&&!/s-intra/.test(B.$('kpis')._h),'relevé d\'un autre jour : séance d\'avant, pas de bandeau ni de source « en séance »');
assert(B.sb.PRICES.QQQ[B.sb.PRICES.QQQ.length-1][6]!==1,'relevé d\'un autre jour : pas de bougie partielle');
// 6) séance déjà publiée (Stockbee) : le relevé n'est plus utilisé
const C=boot(cut+data(NYDAY)+`{const r=STOCKBEE.rows[STOCKBEE.rows.length-1].slice();r[0]=${NYDAY};STOCKBEE.rows.push(r);}`);
assert(C.$('intraBar').hidden===true&&!/s-intra/.test(C.$('kpis')._h),'séance publiée : relevé en séance ignoré');
console.log('ok : séance du jour du calendrier ('+today+') · cases « en séance » · deux dates · bougie partielle · phase provisoire · sans record · séance passée : bandeau masqué · autre jour / séance publiée : inchangé');
