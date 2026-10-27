// Phases de marché (spec du 26/10/2026, config/display.toml [phases]) : bandeau en tête de l'onglet MM, frise sous le graphique
// des prix, phase dans la légende du graphique. Cas de test de la spec (17 dates, paramètres par défaut), seuils lus dans la
// config, séance pas encore publiée par Stockbee, aucun nombre de trades ni taille de position.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(extra){
  const L={},els={},DL={};let fillC='';const R={};
  const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):
    k==='fillRect'?(x,y,w,h)=>{(R[id]=R[id]||[]).push([fillC,x,y,w,h]);}:()=>{},
    set:(t,k,v)=>{if(k==='fillStyle')fillC=v;return true;}});
  const mkEl=id=>({id,children:[],style:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);},
    toggle(c,f){const on=f===undefined?!this._s.has(c):!!f;on?this._s.add(c):this._s.delete(c);return on;}},className:'',_h:'',dataset:{},hidden:false,value:'',tagName:'DIV',
    set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
    setAttribute(k,v){(this.attrs=this.attrs||{})[k]=v;},querySelector(){return mkEl('q');},querySelectorAll(){return [];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
    parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:500,offsetWidth:100,scrollIntoView(){},
    getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:500,width:900,height:500}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
  const $=id=>els[id]||(els[id]=mkEl(id));
  let seq=0;const LS={};
  const document={getElementById:$,createElement:()=>mkEl('n'+(++seq)),querySelector:()=>mkEl('w'),body:Object.assign(mkEl('body'),{dataset:{}}),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],
    addEventListener(e,f){(DL[e]=DL[e]||[]).push(f);}};
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>LS[k]??null,setItem(k,v){LS[k]=String(v);}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6','--text':'#1b2230'})[k]||'#000'}),setTimeout,console};
  sb.location={search:''};sb.window=sb;vm.createContext(sb);
  for(const f of ['config_data.js','stockbee_data.js','breadth_data.js','prices_data.js','vix_data.js','sectors_data.js','status_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(extra)vm.runInContext(extra,sb);
  vm.runInContext(main,sb);
  return {L,els,R,sb,$,LS,DL};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const nameOf=h=>{const m=/<div class="phname"><span class="phdot"><\/span>([^<]+)<span class="phrun">/.exec(h);return m&&m[1];};
const CFG=fs.readFileSync('config_data.js','utf8'), PH=JSON.parse(CFG.slice(CFG.indexOf('=')+1).trim().replace(/;$/,'')).phases;
const name=k=>PH.phase.find(p=>p.key===k).name;
// 1. cas de test de la spec (CSV complet, paramètres par défaut)
const CASES={'2020-03-12':'shock','2020-03-23':'shock','2021-05-26':'recovery','2022-06-16':'shock','2025-04-04':'shock','2025-05-13':'overheat',
  '2025-06-02':'hot','2025-06-13':'exp_b','2025-08-22':'contraction','2025-09-09':'exp_a','2025-09-19':'hot','2025-10-10':'shock',
  '2026-02-04':'exp_c','2026-02-27':'contraction','2026-06-05':'shock','2026-10-16':'wash','2026-10-23':'contraction'};
const SBJ=fs.readFileSync('stockbee_data.js','utf8'), LAST=JSON.parse(SBJ.slice(SBJ.indexOf('=')+1).trim().replace(/;$/,'')).rows.map(r=>r[0]).sort().pop();
const A=boot();
assert(!A.$('phaseBar').hidden,'bandeau des phases attendu');
for(const [d,k] of Object.entries(CASES)){
  A.L.dPick.change({target:{value:d}});
  const h=A.$('phaseBar')._h;
  assert.strictEqual(nameOf(h),name(k),`${d} : phase « ${name(k)} » attendue, « ${nameOf(h)} » affichée`);
  if(d<LAST)assert(A.$('phaseBar').classList.contains('past'),d+' : séance choisie, bandeau marqué comme les cases');
}
// 2. séance du 2025-09-19 : hystérésis de l'état « étendu » (ratio 5 j 1,77, T2108 54 %) ; jauge et compteur de confirmation
A.L.dPick.change({target:{value:'2025-09-19'}});
const h19=strip(A.$('phaseBar')._h);
assert(/état de fond expansion depuis \d+ séances/.test(h19),'état de fond attendu : '+h19);
assert(/Bascule vers la contraction : momentum trimestre \(mq\) 1,\d\d \(seuil 1\)/.test(h19)&&/\d\/3 clôtures à 1 ou moins/.test(h19),'jauge du momentum trimestre et compteur de confirmation attendus : '+h19);
assert(/Setups recommandés \(EP = Episodic Pivot\) Breakouts \+ EP breakouts de leaders/.test(h19),'setups recommandés de l\'expansion chaude (court, puis précision), sigle EP en clair, attendus : '+h19);
// 3. bulle ⓘ du bandeau
assert(/data-tip="phase"/.test(A.$('phaseBar')._h),'bouton ⓘ du bandeau attendu');
// 4. préférences de l'utilisateur : ni nombre de trades ni taille de position ; setups en positif (aucun interdit) ; EP en clair
const all=JSON.stringify(PH)+A.$('phaseBar')._h;
assert(!/trades?\s*\/\s*jour|taille de position|% par trade|risque par trade/i.test(all),'ni nombre de trades ni taille de position attendus');
assert(/EP = Episodic Pivot/.test(PH.setups_label),'sigle EP écrit en clair dans l\'en-tête des setups attendu');
for(const p of PH.phase){
  const t=p.setups+' '+p.detail;
  assert(!/\bpas de\b|\bpas encore\b|seulement|ne pas|\bsans\b|interdit|aucun/i.test(t),p.name+' : setups formulés en positif attendus : '+t);
  assert(/\b(EP|Breakouts?)\b/.test(p.setups)&&p.setups.length<=20,p.name+' : setups courts (EP et / ou breakouts) attendus : '+p.setups);
}
for(const x of PH.signal)assert(!/ne pas|\bpas de\b|interdit/i.test(x.tip),x.name+' : signal formulé en positif attendu : '+x.tip);
// 5. dernière séance publiée : « vaut pour la prochaine séance » ; frise sous le graphique (couleurs de la config) ; légende
const B=boot(), hb=B.$('phaseBar')._h;
assert(/vaut pour la prochaine séance/.test(strip(hb)),'dernière séance : la phase vaut pour la séance suivante');
const cols=new Set(PH.phase.map(p=>p.color)), bands=(B.R.price||[]).filter(r=>cols.has(r[0]));
assert(bands.length>20,'frise des phases attendue sur le graphique des prix ('+bands.length+' bandes)');
assert(PH.phase.every(p=>B.$('phLeg')._h.includes(p.name))&&!B.$('phLeg').hidden,'légende de la frise : toutes les phases');
assert(/class="phx"/.test(B.$('ohlc')._h),'phase dans la légende du graphique attendue');
// 6. séance que Stockbee n'a pas publiée (calcul maison seul) : phase de la dernière séance Stockbee, avec la mention
const own=fs.readFileSync('breadth_data.js','utf8'), OWN=JSON.parse(own.slice(own.indexOf('=')+1).trim().replace(/;$/,''));
const nd=(d=>{const x=new Date(OWN.rows[OWN.rows.length-1][0]+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+30);return x.toISOString().slice(0,10);})();
const C=boot(`window.BREADTH_OWN.rows.push(${JSON.stringify([nd,321,123,1.5,1.2,50,100,600,1600,15])});`), hc=strip(C.$('phaseBar')._h);
assert(/clôture du .*Stockbee pas encore publié/.test(hc),'séance non publiée par Stockbee : mention attendue : '+hc);
assert.strictEqual(nameOf(C.$('phaseBar')._h),nameOf(hb),'même phase que la dernière séance Stockbee ('+LAST+') attendue');
// 7. seuils lus dans la config : surchauffe impossible (hot_r5 et hot_t2108 très hauts) → le 2025-05-13 passe en expansion chaude
const D=boot('window.MM_CONFIG.phases.hot_r5=99;window.MM_CONFIG.phases.hot_t2108=99;');
D.L.dPick.change({target:{value:'2025-05-13'}});
assert.strictEqual(nameOf(D.$('phaseBar')._h),name('hot'),'seuils de surchauffe lus dans config/display.toml attendus');
// 7 bis. reprise sur le ratio 5 j ≥ rep_r5 (note du 26/10/2026, au lieu du ratio 10 j) : le 2026-08-05 (ratio 5 j 2,71,
// ratio 10 j 1,28, 15 séances après un lessivage) est en reprise ; avec rep_r5 très haut, il retombe en contraction
A.L.dPick.change({target:{value:'2026-08-05'}});
assert.strictEqual(nameOf(A.$('phaseBar')._h),name('recovery'),'2026-08-05 : reprise sur le ratio 5 j attendue');
const E=boot('window.MM_CONFIG.phases.rep_r5=99;');
E.L.dPick.change({target:{value:'2026-08-05'}});
assert.strictEqual(nameOf(E.$('phaseBar')._h),name('contraction'),'rep_r5 lu dans la config attendu');
assert(!('rep_r10' in PH)&&PH.mq_lag>=PH.mq_lag_valid[0]&&PH.mq_lag<=PH.mq_lag_valid[1],'rep_r5 seul, mq_lag dans sa zone valable attendus');
// 7 ter. bulles ⓘ : « pourquoi cette phase » (étapes avec les chiffres de la séance), règles des 9 phases dans l'ordre du calcul,
// état de fond, setups, signaux ; frise : bulle des règles dans sa légende (MM et Secteurs)
const tipOf=(X,id)=>{const btn={dataset:{tip:id},setAttribute(){},getBoundingClientRect:()=>({left:0,bottom:0})};
  X.DL.click.forEach(f=>f({target:{closest:q=>q==='.tipbtn'?btn:null},stopPropagation(){},preventDefault(){}}));return strip(X.$('pop')._h);};
// séance fixée (23/10/2026 : contraction, ratio mois 0,30) : le test ne doit pas dépendre de la dernière séance publiée par le robot
const F=boot(); F.L.dPick.change({target:{value:'2026-10-23'}}); const hf=F.$('phaseBar')._h;
for(const id of ['phase','phfond','phsetups'])assert(hf.includes(`data-tip="${id}"`),'bouton ⓘ '+id+' attendu dans le bandeau');
assert(F.$('phLeg')._h.includes('data-tip="phrules"')&&!F.$('secPhLeg').hidden&&F.$('secPhLeg')._h.includes('data-tip="phrules"'),'légendes des frises (MM, Secteurs) avec bulle des règles attendues');
const why=tipOf(F,'phase');
assert(/Pourquoi Contraction à la clôture du ven\. 23 oct\./.test(why),'bulle : pourquoi la phase du jour attendu : '+why.slice(0,200));
assert(/✗ Choc \? plus forte part de l'univers en baisse de 4 % sur les 5 dernières séances : \d+,\d %/.test(why),'étape choc chiffrée attendue : '+why.slice(0,400));
assert(/État de fond : contraction · momentum trimestre 0,\d\d/.test(why)&&/✗ Reprise \? ratio 5 jours/.test(why)&&/✗ Lessivage \? ratio mois 0,30/.test(why),'étapes fond, reprise, lessivage chiffrées attendues : '+why);
const pos=['Choc','Surchauffe','Expansion chaude','Expansion A','Expansion B','Expansion C','Reprise','Lessivage','Contraction'].map(n=>tipOf(F,'phrules').indexOf(n+' :'));
assert(pos.every((x,k)=>x>=0&&(k===0||x>pos[k-1])),'règles des 9 phases dans l\'ordre du calcul attendues : '+pos);
assert(/Réglage fragile/.test(tipOf(F,'phfond'))&&/EP \+ Breakouts A\+/.test(tipOf(F,'phsetups'))&&/premier jour/.test(tipOf(F,'phsig')),'bulles état de fond, setups (surchauffe : breakouts A+), signaux attendues');
// 7 quater. onglet SA : bande des phases sur tous les graphiques (QQQ, IWM, BTC, T2108, VIX, base 100) et légende
const G=boot(); G.L.tabs.click({target:{closest:()=>({dataset:{tab:'cmp'}})}});
// (DOM simulé : les canevas créés à la volée partagent l'identifiant « q » → on compte toutes les bandes)
const phCols=new Set(PH.phase.map(p=>p.color)), saBands=Object.entries(G.R).filter(([id])=>id!=='price'&&id!=='friseCv').reduce((n,[,r])=>n+r.filter(x=>phCols.has(x[0])).length,0);
assert(saBands>=5*60,'SA : frise des phases attendue sur les 5 graphiques (3 indices, T2108, VIX ; ~6 mois chacun) : '+saBands+' bandes');
assert(!G.$('cmpPhLeg').hidden&&G.$('cmpPhLeg')._h.includes('data-tip="phrules"'),'SA : légende de la frise attendue');
G.L.cmpMode.click({target:{closest:()=>({dataset:{m:'b100'}})}});
assert((G.R.b100cv||[]).filter(x=>phCols.has(x[0])).length>20,'SA base 100 : frise des phases attendue');
// 8. mobile : un toucher déplie le bandeau, mémorisé (mm.phase) ; un toucher sur ⓘ ne le déplie pas
B.L.phaseBar.click({target:{closest:()=>null}});
assert(B.$('phaseBar').classList.contains('open')&&B.LS['mm.phase']==='1','toucher : bandeau déplié et mémorisé');
B.L.phaseBar.click({target:{closest:s=>s==='.tipbtn'?{}:null}});
assert(B.$('phaseBar').classList.contains('open'),'toucher sur ⓘ : pas de repli');
console.log('phases de marché : 17 cas de la spec, config, séance non publiée, frise, légende, mobile — ok');
