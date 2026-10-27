// Onglet Secteurs, refonte du 27/10/2026 : bloc « Groupes actifs » (phase du jour, alerte, groupes neufs et chauds, pionniers),
// case « Thèmes chauds », niveau « Leaders actifs » de la vue TradingView (leaders des groupes neufs ou chauds, triés par gain sur
// 21 séances, limite et « + N autres », filtre par groupe, graphique), carte de rotation repliée par défaut, ancien fichier sans
// groupes actifs. États recalculés indépendamment depuis les champs du robot (industries[].g / l, themes[], leaders.days).
const fs=require('fs'),vm=require('vm');
require('./lib/fixtures');   // industries_data.js, tickers_data.js, industries/ : copie figée (tests/fixtures/)
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(ls,opts={}){
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
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},innerHeight:800,
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of (opts.files||["config_data.js","stockbee_data.js","prices_data.js","vix_data.js","sectors_data.js","industries_data.js","tickers_data.js"]))vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(opts.after)vm.runInContext(opts.after,sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const heads=A=>[...A.$('secHead')._h.matchAll(/<th[^>]*data-c="([^"]+)"[^>]*>/g)].map(m=>m[1]);
const rows=A=>[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1].replace(/&amp;/g,'&'),h:m[2],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))}));
const tab=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const view=(A,v)=>A.L.secView.click({target:{closest:()=>({dataset:{v},disabled:false})}});
const kp=A=>[...A.$('secKpis')._h.matchAll(/<div class="kpi([^"]*)" data-sk="([^"]+)"[^>]*>([\s\S]*?)(?=<div class="kpi|$)/g)].map(m=>({k:m[2],t:strip(m[3]),h:m[3]}));
const val=c=>strip((c.h.match(/<div class="val">([\s\S]*?)<\/div>/)||[])[1]);
const actClick=(A,ds)=>A.L.secAct.click({target:{closest:()=>({dataset:ds})}});
const tip=(A,id)=>{A.DL.click.forEach(f=>f({target:{closest:sel=>sel==='.tipbtn'?{dataset:{tip:id},setAttribute(){},getBoundingClientRect:()=>({left:0,bottom:0})}:null},stopPropagation(){},preventDefault(){}}));return strip(A.$('pop')._h);};
const sc=(c,e)=>{if(e<64)return null;let s7=0,s65=0;for(let i=e-64;i<=e;i++){if(c[i]==null)return null;s65+=c[i];if(i>e-7)s7+=c[i];}return s7/7/(s65/65);};

// --- fichiers d'actions des industries des leaders de la dernière séance (les fixtures n'en ont que 4) : cours fabriqués
const IND0=JSON.parse(fs.readFileSync('industries_data.js','utf8').replace(/^window\.INDUSTRIES = /,'').replace(/;\s*$/,''));
const D0=IND0.leaders.days[IND0.leaders.days.length-1], need=new Map();
D0.forEach(([s,ii])=>{const f=IND0.industries[ii].f;if(!need.has(f))need.set(f,[]);need.get(f).push(s);});
const NB=120, fdates=IND0.dates.slice(-NB);
const mkFile=syms=>({asof:IND0.asof,dates:fdates,vu:1000,rows:syms.map((s,j)=>{const c=fdates.map((_,i)=>+(10+j+i*0.1).toFixed(2));
  return [s,s+' Inc.',1e9*(j+1),c,c.map(()=>500),c.map(v=>v*0.99),c.map(v=>v*1.02),c.map(v=>v*0.98)];})});
const files=`window.TV_STOCKS=window.TV_STOCKS||{};`+[...need].map(([f,syms])=>`window.TV_STOCKS[${JSON.stringify(f)}]=${JSON.stringify(mkFile(syms))};`).join('');

const ls={'mm.secview':'tv'}, A=boot(ls,{after:files});
const IND=A.sb.INDUSTRIES, CFG=A.sb.MM_CONFIG, AC=CFG.sectors.actifs, N=IND.dates.length, e=N-1, min=CFG.industries.min_members;
tab(A);

// --- recalcul indépendant : chaud, neuf, leaders actifs à la dernière séance
const G=IND.industries.map((x,i)=>({key:'i:'+x.k,k:x.k,kind:'ind',i,n:x.n,c:x.c,b:x.b,sig:x.g,l:x.l})).concat(IND.themes.map(t=>({key:'t:'+t.k,k:t.k,kind:'th',n:t.n,c:t.c,b:t.b,sig:t.h,l:t.l,m:new Set(t.m)}))).filter(g=>g.n>=min);
const hotMemo=new Map();
const hotAt=k=>{if(hotMemo.has(k))return hotMemo.get(k);const s=G.filter(g=>g.kind==='ind').map(g=>sc(g.c,k)).filter(v=>v!=null).sort((a,b)=>b-a);
  const thr=s.length?s[Math.max(1,Math.ceil(s.length*CFG.tickers.hot_top_pct/100))-1]:Infinity;
  const set=new Set(G.filter(g=>{const v=sc(g.c,k);return v!=null&&v>1&&v>=thr&&g.b&&g.b[k]!=null&&g.b[k]>=CFG.tickers.hot_min_breadth;}).map(g=>g.key));hotMemo.set(k,set);return set;};
const neufAt=(g,k)=>{if(g.sig[k]!=='1')return false;let s0=k;while(s0>0&&g.sig[s0-1]==='1')s0--;if(k-s0>AC.neuf_window||s0-AC.fresh_sessions<0)return false;
  for(let j=s0-AC.fresh_sessions;j<s0;j++)if(g.sig[j]==='1'||hotAt(j).has(g.key))return false;return true;};
const act=G.filter(g=>hotAt(e).has(g.key)||neufAt(g,e)), actKeys=new Set(act.map(g=>g.key)), neufs=G.filter(g=>neufAt(g,e));
const day=IND.leaders.days[e-IND.leaders.start];
const exp=day.filter(([s,ii])=>actKeys.has('i:'+IND.industries[ii].k)||act.some(g=>g.kind==='th'&&g.m.has(s))).sort((a,b)=>b[2]-a[2]||(a[0]<b[0]?-1:1));
ok('fixture : au moins un groupe actif et des leaders actifs à la dernière séance',act.length>0&&exp.length>0,act.length+' groupes, '+exp.length+' leaders');

// --- niveau par défaut : Leaders actifs (première visite de la vue TradingView)
ok('vue TradingView sans navigation mémorisée : Leaders actifs',/data-act="1" class="on"/.test(A.$('secFilt')._h)&&/leaders actifs/.test(A.$('secMeta')._t||''),strip(A.$('secFilt')._h).slice(0,80));
const H=heads(A), iG=H.indexOf('g21');
ok('colonnes du niveau : symbole, groupe, capitalisation, ADR, TI65 3 mois, gain 21 j, écart au plus haut',['rank','sym','grp','cap','adr','spark','g21','hi20'].every(c=>H.includes(c)),H.join(','));
const R0=rows(A), lim=AC.list_limit;
ok('lignes = leaders des groupes neufs ou chauds (recalcul), dans la limite de la config',R0.length===Math.min(lim,exp.length)&&R0.every(r=>exp.some(x=>x[0]===r.s)),R0.length+' / '+exp.length);
ok('tri par gain sur 21 séances, du plus fort au plus faible',R0.map(r=>r.s).join(',')===exp.slice(0,lim).map(x=>x[0]).join(',')&&R0[0].cells[iG]===(exp[0][2]>0?'+':'')+exp[0][2]+' %',R0.slice(0,3).map(r=>r.s+' '+r.cells[iG]).join(' · '));
ok('colonne groupe : état (neuf / chaud) et nom du groupe',R0.every(r=>/^(Neuf|Chaud) /.test(r.cells[H.indexOf('grp')])),R0[0].cells[H.indexOf('grp')]);
ok('graphique : l\'action choisie, son état et son industrie',A.$('secTitle')._t.startsWith(R0[0].s+' · ')&&/(Neuf|Chaud)/.test(strip(A.$('secInfo')._h)),A.$('secTitle')._t);

// --- limite et « + N autres » (limite réduite à 3 pour le test)
const lsL={'mm.secview':'tv'}, B=boot(lsL,{after:files+'MM_CONFIG.sectors.actifs.list_limit=3;'});tab(B);
if(exp.length>3){
  ok('limite : 3 lignes puis « + N autres »',rows(B).length===3&&new RegExp('\\+ '+(exp.length-3)+' autres').test(B.$('secRows')._h));
  B.L.secRows.click({target:{closest:sel=>sel==='[data-actall]'?{dataset:{actall:'1'}}:null}});
  ok('« + N autres » : toute la liste, puis retour possible',rows(B).length===exp.length&&/Revenir aux 3 premiers/.test(B.$('secRows')._h));
}

// --- bloc Groupes actifs : phase, neufs et chauds, filtre par groupe
const box=A.$('secAct');
// 27/10/2026 : la phase du jour et ses setups sont le titre de la frise (séparateur sous les cases), plus dans le bloc
const phaseName=(A.$('frisePh')._h.match(/<i[^>]*><\/i><b>([^<]+)<\/b>/)||[])[1];
ok('titre de la frise : phase du jour et ses setups ; bloc Groupes actifs affiché',box.hidden===false&&!!phaseName&&new RegExp(CFG.phases.setups_label.replace(/[()]/g,'.')).test(strip(A.$('frisePh')._h)),strip(A.$('frisePh')._h).slice(0,120));
const nNeufHtml=(box._h.match(/<span class="etat neuf">Neufs (\d+)<\/span>/)||[])[1];
ok('groupes neufs = recalcul',(nNeufHtml?+nNeufHtml:0)===neufs.length,(nNeufHtml||0)+' / '+neufs.length+' ('+neufs.map(g=>g.k).join(', ')+')');
const nLead=act.filter(g=>(g.l[e]||0)>0).length, nZero=act.length-nLead;
// retour UX du 27/10/2026 : tous les neufs, puis les chauds_shown chauds qui ont le plus de leaders ; le reste derrière « + N autres »
const nNeufs=neufs.length, chW=act.filter(g=>!neufAt(g,e)&&(g.l[e]||0)>0).length, nShown=nNeufs+Math.min(AC.chauds_shown,chW), nRest=act.length-nShown;
ok('cartes : tous les neufs, puis les '+AC.chauds_shown+' chauds qui ont le plus de leaders (« + N autres » pour le reste)',(box._h.match(/data-actg="/g)||[]).length===nShown&&(!nRest||new RegExp('data-actzero="1"[^>]*>\\+ '+nRest+' autre').test(box._h)),(box._h.match(/data-actg="/g)||[]).length+' / '+nShown+' (+'+nRest+')');
if(nRest){actClick(A,{actzero:'1'});ok('« + N autres » : tous les groupes actifs',(A.$('secAct')._h.match(/data-actg="/g)||[]).length===act.length);actClick(A,{actzero:'1'});}
ok('ligne « Sur N s » : groupes chauds comparés à '+AC.trend_sessions+' séances avant',new RegExp('Sur '+AC.trend_sessions+' s').test(strip(box._h))&&/chauds \d+ → \d+/.test(strip(box._h)),strip(box._h).match(/Sur \d+ s.{0,80}/)?.[0]);
// repli du bloc mémorisé ; replié, le titre garde le nombre de neufs et de chauds
actClick(A,{actfold:'1'});
ok('replier « Groupes actifs » : titre seul avec son résumé, choix mémorisé',!/data-actg="/.test(A.$('secAct')._h)&&new RegExp(nNeufs+' neufs? · ').test(strip(A.$('secAct')._h))&&ls['mm.fold.act']==='1',strip(A.$('secAct')._h).slice(0,120));
actClick(A,{actfold:'1'});
ok('déplier : cartes revenues',(A.$('secAct')._h.match(/data-actg="/g)||[]).length===nShown&&ls['mm.fold.act']==='0');
const g0=act.find(g=>exp.some(([s,ii])=>g.kind==='ind'?IND.industries[ii].k===g.k:g.m.has(s)));
actClick(A,{actg:g0.key});
const expG=exp.filter(([s,ii])=>g0.kind==='ind'?IND.industries[ii].k===g0.k:g0.m.has(s));
ok('toucher un groupe : seulement ses leaders, pastille du groupe pour revenir',rows(A).length===Math.min(lim,expG.length)&&rows(A).every(r=>expG.some(x=>x[0]===r.s))&&/data-actg="" class="on"/.test(A.$('secChips')._h),g0.k+' : '+rows(A).length);
A.L.secChips.click({target:{closest:()=>({dataset:{actg:''}})}});
ok('pastille ✕ : retour à tous les leaders actifs',rows(A).length===Math.min(lim,exp.length));
// alerte : seulement si la phase du jour fait partie de alert_phases et qu'il y a des groupes chauds
const alertShown=/class="alrt"/.test(box._h);
const phaseKey=(CFG.phases.phase.find(p=>p.name===phaseName)||{}).key;
ok('alerte « phase avec groupes chauds » cohérente avec la phase et la config',alertShown===(AC.alert_phases.includes(phaseKey)&&act.some(g=>hotAt(e).has(g.key))),phaseName+' · alerte '+alertShown);

// --- case Thèmes chauds
const th=kp(A).find(x=>x.k==='th'), thN=G.filter(g=>g.kind==='th').length, thHot=G.filter(g=>g.kind==='th'&&hotAt(e).has(g.key)).length;
ok('case « Thèmes chauds » : valeur = recalcul, après les cases existantes',!!th&&val(th)===thHot+' / '+thN&&kp(A).map(x=>x.k).pop()==='th',th&&val(th));
ok('bulles d\'aide : groupes actifs, thèmes chauds, Leaders actifs',/Neuf/.test(tip(A,'act:neuf'))&&/thèmes suivis/i.test(tip(A,'skpi:th'))&&/triés par gain/.test(tip(A,'lvl:act')));

// --- carte de rotation : retirée de la page (config shown = false) ; réactivée, repliée par défaut et reliée aux groupes actifs
ok('carte de rotation retirée de la page par défaut (config [sectors.rrg] shown)',A.$('secRrg').hidden===true);
const lsR={'mm.secview':'tv'}, RR=boot(lsR,{after:files+'MM_CONFIG.sectors.rrg.shown=true;'});tab(RR);
ok('réactivée : repliée par défaut',RR.$('secRrg').hidden===false&&RR.$('rrgBody').hidden===true);
RR.L.rrgHead.click({});
ok('toucher le titre : carte ouverte, choix mémorisé',RR.$('rrgBody').hidden===false&&lsR['mm.rrgopen']==='1');
ok('carte reliée aux groupes actifs : légende des pastilles sous la carte',/pastille = groupes actifs du secteur/.test(RR.$('rrgInfo')._h),strip(RR.$('rrgInfo')._h).slice(-120));
{ const trs=[...RR.$('rrgTab')._h.matchAll(/<tr data-mv="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>({k:m[1].replace(/&amp;/g,'&'),h:m[2]}));
  const actInd=new Set(act.filter(g=>g.kind==='ind').map(g=>g.k));
  ok('tableau « Depuis la veille » : état Neuf / Chaud devant les industries actives, et seulement elles',trs.length>0&&trs.every(t=>/class="etat (neuf|chaud)"/.test(t.h)===actInd.has(t.k)),trs.map(t=>t.k+(actInd.has(t.k)?'*':'')).join(', ')); }
// les cases ne se replient pas (point d'ancrage) ; le classement se replie, choix mémorisé
ok('cases sans repli : pas de bouton de repli du contexte',!/id="ctxFold"/.test(html));
A.L.listFold.click({});
ok('replier « Classement » : choix mémorisé',ls['mm.fold.list']==='1');
A.L.listFold.click({});

// --- pionnier fabriqué : leader à +60 % depuis aujourd'hui, industrie ni chaude ni en grappe
const cold=IND.industries.findIndex(x=>x.g[e]==='0'&&!hotAt(e).has('i:'+x.k));
const P=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.leaders.days[INDUSTRIES.leaders.days.length-1].push(['ZZPN',${cold},60]);`});tab(P);
ok('pionnier : leader seul à +'+AC.pioneer_gain_pct+' % ou plus, parti aujourd\'hui, industrie ni chaude ni en grappe',/Pionniers 1/.test(P.$('secAct')._h)&&/ZZPN/.test(P.$('secAct')._h));

// --- ancien fichier sans groupes actifs ; vue ETF
const O=boot({'mm.secview':'tv'},{after:'delete INDUSTRIES.leaders;delete INDUSTRIES.themes;'});tab(O);
ok('ancien fichier : niveau Secteurs, pas de case Thèmes ni de bloc Groupes actifs',!/data-act=/.test(O.$('secFilt')._h)&&!kp(O).some(x=>x.k==='th')&&O.$('secAct').hidden===true&&rows(O).length>0);
// ETF : plus de bascule (27/10/2026) ; un niveau au bout du fil, retour par « ‹ Leaders actifs » ; le haut de page reste
const fil=(A,ds)=>A.L.secFilt.click({target:{closest:()=>({dataset:ds})}});
ok('fil : niveau ETF au bout, bascule ETF / TradingView masquée',/data-etf="1"/.test(A.$('secFilt')._h)&&/<span class="viewbox" hidden>/.test(html));
fil(A,{etf:'1'});
ok('niveau ETF : liste des ETF, retour « ‹ Leaders actifs », cases et Groupes actifs toujours là',ls['mm.secview']==='etf'&&/data-tvback="1"/.test(A.$('secFilt')._h)&&A.$('secAct').hidden===false&&A.$('secKpis').hidden===false);
fil(A,{tvback:'1'});
ok('« ‹ » : retour au classement TradingView',ls['mm.secview']==='tv'&&/data-etf="1"/.test(A.$('secFilt')._h));

// --- bascule unique après la mise à jour : vue TradingView, niveau Leaders actifs ; le choix suivant (ETF) est respecté
const lsF={}, F=boot(lsF,{after:files});tab(F);
ok('première visite : vue TradingView, Leaders actifs, bascule notée',lsF['mm.secview']==='tv'&&JSON.parse(lsF['mm.tvnav']).lvl==='act'&&lsF['mm.secrefonte']==='1'&&/data-act="1" class="on"/.test(F.$('secFilt')._h));
const lsE={'mm.secview':'etf','mm.tvnav':JSON.stringify({lvl:'ind',sec:'all',ind:null})}, E=boot(lsE,{after:files});tab(E);
ok('ancien choix ETF : remplacé une fois par TradingView / Leaders actifs',lsE['mm.secview']==='tv'&&E.$('secAct').hidden===false);
const lsE2={'mm.secview':'etf','mm.secrefonte':'1'}, E2=boot(lsE2,{after:files});tab(E2);
ok('choix ETF fait après la bascule : respecté (haut de page commun)',lsE2['mm.secview']==='etf'&&E2.$('secAct').hidden===false);

if(bad)console.log('Error : '+bad+' contrôle(s) en échec');
