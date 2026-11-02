// Onglet Secteurs, refonte du 27/10/2026 : bloc « Groupes actifs » (phase du jour, alerte, groupes neufs et chauds, 9M par groupe, Réveil ; pionniers retirés le 31/10/2026),
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
  // cases d'avant l'audit du 31/10/2026 (code toujours là, réactivable par la config) : ce test les vérifie ; défaut actuel : opts.tiles=false
  if(opts.tiles!==false)vm.runInContext('MM_CONFIG.sectors.kpis.tiles=["sec","ind","rot","rr","stk","th"];',sb);
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

// --- pionniers retirés le 31/10/2026 (audit : pas d'avance mesurée, test 8) ; ⚑ s'essouffle et ◆ refuge : au survol seulement
ok('pionniers, ⚑ et ◆ absents du bloc (information au survol)',!/Pionniers/.test(A.$('secAct')._h)&&!/class="old">⚑|class="ref">◆/.test(A.$('secAct')._h));

// --- 9M par groupe et section Réveil (31/10/2026) : listes 9M fabriquées pour une industrie ni chaude ni neuve
{ const T0=A.sb.TICKERS, ci=T0.cols.indexOf('ind'), ck=T0.cols.indexOf('kept'), cs=T0.cols.indexOf('s');
  const hotK=hotAt(e), neufK=new Set(neufs.map(g=>g.key));
  const cand=G.filter(g=>g.kind==='ind'&&!hotK.has(g.key)&&!neufK.has(g.key)).map(g=>({g,t:T0.rows.filter(r=>r[ck]&&T0.inds[r[ci]][0]===g.k).map(r=>r[cs])}))
    .filter(x=>x.t.length>=AC.nine_min&&100*AC.nine_min/x.g.n>=AC.nine_share).sort((a,b)=>a.g.n-b.g.n)[0];
  ok('industrie froide avec assez d\'actions retenues pour le test',!!cand,cand&&cand.g.k);
  const pick=cand.t.slice(0,AC.nine_min), d=IND.dates[e], prev=IND.dates[e-1];
  const tv=`window.TV_BREADTH={columns:['date','t2108','n','up4','down4'],rows:[['${d}',50,5100,100,90]],asof:'${d}',bo_columns:['ticker','pct','volume','vol_ratio'],`+
    `breakouts:${JSON.stringify({[prev]:[[pick[0],5,1e7,1.2]],[d]:pick.slice(1).map(s=>[s,5,1e7,1.2])})}};`;
  const lsR={'mm.secview':'tv'}, R9=boot(lsR,{after:files+tv}); tab(R9);
  const h=R9.$('secAct')._h, share=Math.round(100*AC.nine_min/cand.g.n);
  ok('Réveil : industrie ni chaude ni neuve à '+AC.nine_min+' titres en 9M sur '+AC.nine_window+' séances (≥ '+AC.nine_share+' %)',
     new RegExp(AC.reveil_label+' \\d+').test(strip(h))&&h.includes(`data-actind="${cand.g.k.replace(/&/g,'&amp;')}"`),strip(h).slice(0,160));
  ok('carte : marque « 9M n · part % » (vert dès nine_share, plein dès nine_intense)',new RegExp(`class="n9 ${share>=AC.nine_intense?'i':'f'}">9M ${AC.nine_min} · ${share} %`).test(h),share+' %');
  ok('résumé : nombre de réveils',new RegExp('\\d+ '+AC.reveil_label.toLowerCase()).test(strip(h)));
  actClick(R9,{actind:cand.g.k});
  ok('toucher une carte Réveil : les actions de l\'industrie dans le Classement',JSON.parse(lsR['mm.tvnav']).lvl==='stk'&&JSON.parse(lsR['mm.tvnav']).ind===cand.g.k,lsR['mm.tvnav']);
  ok('Groupes actifs : bouton Copier des leaders actifs (01/11/2026)',/data-actcopy="1"/.test(R9.$('secAct')._h));
  ok('bulle : 9M et Réveil expliqués (config)',tip(R9,'act:neuf').includes(AC.reveil_label)&&tip(R9,'act:neuf').includes(AC.nine_tip.slice(0,30)));
  // --- carte des thèmes (31/10/2026) : même séance, points = industries classées, l'industrie Réveil en vert
  const MP=CFG.sectors.map, m=R9.$('secMap')._h, nInd=G.filter(g=>g.kind==='ind'&&sc(g.c,e)!=null).length;
  ok('carte des thèmes : bloc affiché, un point par industrie classée',R9.$('secMap').hidden===false&&(m.match(/<circle class="mp /g)||[]).length===nInd,(m.match(/<circle class="mp /g)||[]).length+' / '+nInd);
  const kE=cand.g.k.replace(/&/g,'&amp;');
  ok('carte : l\'industrie Réveil en vert, nommée, avec sa traînée (point important)',new RegExp(`<g class="pt rev imp"><g class="trl"><polyline[^>]*/>[\\s\\S]*?<circle class="mp rev"[^>]*data-mapsel="i:${kE}"`).test(m)&&m.includes(`>${kE}</text>`));
  ok('carte : zones dans le graphique, leurs notes dans la légende (config)',m.includes(`>${MP.zones.reveil}</text>`)&&m.includes(MP.zone_notes.reveil.replace(/&/g,'&amp;'))&&/class="aleg mznotes"/.test(m)&&m.includes(MP.zones.calm));
  ok('carte : points sans 9M fort sans traînée permanente (au survol seulement)',/<g class="pt (hot|calm)"><g class="trl">/.test(m)&&!/<g class="pt (hot|calm) imp"/.test(m));
  R9.L.secMap.click({target:{closest:()=>({dataset:{mapsel:'i:'+cand.g.k}})}});
  let mi=R9.$('secMap')._h;
  ok('toucher un point : sélection (traînée appuyée, barre avec rang, 9M, leaders et bouton « Ses actions »)',/<g class="pt rev imp sel">/.test(mi)&&/class="mapinfo"/.test(mi)&&new RegExp(`data-actind="${kE}">Ses actions ›`).test(mi)&&/rang TI65/.test(strip(mi)),strip((mi.match(/<div class="mapinfo">[\s\S]*?<\/div>/)||[''])[0]));
  R9.L.secMap.click({target:{closest:()=>({dataset:{actind:cand.g.k}})}});
  ok('bouton « Ses actions » : les actions de l\'industrie',JSON.parse(lsR['mm.tvnav']).ind===cand.g.k);
  const hotK1=G.find(g=>g.kind==='ind'&&hotAt(e).has(g.key));
  R9.L.secMap.click({target:{closest:()=>({dataset:{mapsel:hotK1.key}})}});
  ok('point d\'un groupe chaud : bouton « Ses leaders »',new RegExp(`data-actg="${hotK1.key.replace(/&/g,'&amp;')}">Ses leaders ›`).test(R9.$('secMap')._h));
  R9.L.secMap.click({target:{closest:()=>({dataset:{mapsel:''}})}});
  ok('✕ : sélection retirée',!/class="mapinfo"/.test(R9.$('secMap')._h));
  R9.L.secMap.click({target:{closest:()=>({dataset:{mapfold:'1'}})}});
  ok('replier la carte : titre et résumé seuls, choix mémorisé',!/<svg class="smap"/.test(R9.$('secMap')._h)&&lsR['mm.fold.map']==='1'&&/1 réveil/.test(strip(R9.$('secMap')._h)),strip(R9.$('secMap')._h).slice(0,80));
  ok('bulle de la carte : zones et notes (config)',tip(R9,'map').includes(MP.zones.lasting)&&tip(R9,'map').includes(MP.zone_notes.lasting));
  // --- historique du robot (industries_data.js, clé nine, cache Polygon) : même résultat sans aucune liste TradingView
  const ii=IND.industries.findIndex(x=>x.k===cand.g.k), days=Array.from({length:N},()=>[]);
  days[e-1]=[[pick[0],ii]]; days[e]=pick.slice(1).map(s=>[s,ii]);
  const P9=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days})};`}); tab(P9);
  const hp=P9.$('secAct')._h;
  ok('9M depuis l\'historique du robot (sans liste TradingView) : même Réveil et même marque',new RegExp(AC.reveil_label+' \\d+').test(strip(hp))&&hp.includes(`data-actind="${kE}"`)
     &&new RegExp(`class="n9 ${share>=AC.nine_intense?'i':'f'}">9M ${AC.nine_min} · ${share} %`).test(hp)&&P9.$('secMap').hidden===false);
  const P0=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days:Array.from({length:N},()=>[])})};`}); tab(P0);
  ok('historique sans aucun 9M : pas de Réveil, carte affichée',!new RegExp(AC.reveil_label+' \\d').test(strip(P0.$('secAct')._h))&&P0.$('secMap').hidden===false);
  // --- lecture de la carte (01/11/2026) : titres d'axes, ligne de lecture, flèche de sens, axe des 9M (log par défaut)
  const mp9=P9.$('secMap')._h;
  ok('carte : titres d\'axes et ligne de lecture (config)',mp9.includes(MP.x_title)&&mp9.includes(MP.y_title)&&strip(mp9).includes(MP.read_hint.slice(0,40)));
  ok('carte : flèche au bout de la traînée du point Réveil (sens du mouvement)',new RegExp(`<g class="pt rev imp"><g class="trl">[\\s\\S]*?<polygon class="tra"[\\s\\S]*?data-mapsel="i:${kE}"`).test(mp9));
  const yOf=v=>{const m2=mp9.match(new RegExp(`<text class="mx" x="[^"]+" y="([\\d.]+)" text-anchor="end">${v} %</text>`));return m2?+m2[1]:null;};
  const y0=yOf(0), y5=yOf(5), y50=yOf(MP.y_max);
  const want5=MP.y_scale==='log'?Math.log1p(5/MP.y_log_k)/Math.log1p(MP.y_max/MP.y_log_k):MP.y_scale==='sqrt'?Math.sqrt(5/MP.y_max):5/MP.y_max;
  ok('axe des 9M ('+MP.y_scale+', jusqu\'à '+MP.y_max+' %) : 5 % placé à '+want5.toFixed(2)+' de la hauteur',Math.abs((y0-y5)/(y0-y50)-want5)<0.02,[y0,y5,y50].join(' '));
  // --- tableau par zone (01/11/2026) : composant à part (#secZone), à côté de la carte dans #secMapRow
  const BD=MP.board, TV9=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days})};`}); tab(TV9);
  const hb=TV9.$('secZone')._h, nm=cand.g.n, rowRe=new RegExp(`<div class="mbr rev" role="button" tabindex="0" data-mapsel="i:${kE}"[\\s\\S]*?</div>`), row=(hb.match(rowRe)||[''])[0];
  ok('tableau : composant à part (titre, Copier, poignée du bloc), zone Réveil (note de la config), une ligne pour l\'industrie',TV9.$('secZone').hidden===false&&hb.includes(`<b>${BD.label}</b>`)
     &&/data-zcopy="all"/.test(hb)&&/data-drag="map"/.test(hb)&&hb.includes(`<b>${MP.zones.reveil}</b><small>${MP.zone_notes.reveil.replace(/&/g,'&amp;')}</small>`)&&!!row&&!/class="mboard"/.test(TV9.$('secMap')._h));
  ok('ligne : nom, '+AC.nine_min+' / '+nm+' en 9M, ses titres (touchables), une pastille par membre, courbe 3 mois avec la ligne des '+AC.nine_share+' %',row.includes(`<b>${kE}</b>`)&&row.includes(`${AC.nine_min} / ${nm}`)
     &&pick.every(t=>row.includes(`data-pop="${t}"`))&&(nm>BD.dots_max||(row.match(/<i class="(y)?"><\/i>/g)||[]).length===nm)&&(row.match(/<i class="y"><\/i>/g)||[]).length===(nm>BD.dots_max?0:AC.nine_min)
     &&/class="mm-t"/.test(row)&&/<g class="mm-l"><polyline/.test(row),strip(row).slice(0,120));
  ok('âge de la grappe : '+AC.nine_min+' titres depuis cette séance seulement → « '+BD.age_label.replace('{n}',1)+' », tranche et tests dans la bulle',row.includes(BD.age_label.replace('{n}',1))
     &&row.includes(BD.age_notes[0].replace(/&/g,'&amp;'))&&!row.includes('≥ 1'));
  // grille de convergence (02/11/2026) : cases par séance, barre du rang, entrés / sortis, EP probable (repère 4)
  { const cl=n=>n>=3?'c3':n===2?'c2':n===1?'c1':'', cs=(row.match(/<span class="mb-h">([\s\S]*?)<\/span>/)||['',''])[1].match(/<i class="[^"]*"/g)||[];
    ok('grille : '+BD.grid_sessions+' cases, titres en 9M de chaque séance (veille 1, jour '+(AC.nine_min-1)+')',cs.length===Math.min(BD.grid_sessions,N)
       &&cs[cs.length-2]===`<i class="${cl(1)}"`&&cs[cs.length-1]===`<i class="${cl(AC.nine_min-1)}"`,cs.slice(-3).join(' '));
    ok('rang TI65 : barre avec la zone délaissée (sous '+BD.low_rank+')',row.includes('class="mb-rk"')&&row.includes(`--low:${BD.low_rank}%`));
    ok('ligne « '+BD.moves_label.replace('{n}',BD.moves_sessions)+' » : l\'industrie entrée',hb.includes(BD.moves_label.replace('{n}',BD.moves_sessions))
       &&new RegExp(BD.moves_in.replace('{n}','\\d+')+'</b> [^<]*'+kE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(hb));
    const dE=days.map(x=>x.slice()); dE[e]=dE[e].map((r,j)=>j===0?[r[0],r[1],4]:r);
    const EB=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days:dE})};`}); tab(EB); const re=(EB.$('secZone')._h.match(rowRe)||[''])[0];
    ok('EP probable (repère 4) : point sur la case du jour, titre dans la bulle',new RegExp(`<i class="${cl(AC.nine_min-1)} ep" title="[^"]*${BD.cell_ep.replace('{s}',pick[1])}`).test(re));
    const dG=Array.from({length:N},()=>[]); for(let k=e-AC.nine_window-4;k<=e-AC.nine_window-1;k++)dG[k]=pick.map(s=>[s,ii]);   // hors de la fenêtre 9M depuis 2 séances
    const GB=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days:dG})};`}); tab(GB); const hg=GB.$('secZone')._h;
    ok('groupe sorti des zones depuis peu : ligne grisée « '+BD.gone_title+' »',hg.includes(`<b>${BD.gone_title}</b>`)&&/<div class="mbr [a-z]+ gone"/.test(hg)&&hg.includes(BD.gone_label.replace('{n}',2))); }
  { const days2=Array.from({length:N},()=>[]); for(let k=e-7;k<=e;k++)days2[k]=pick.map(s=>[s,ii]);
    const AG=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days:days2})};`}); tab(AG);
    ok('grappe tenue 8 séances : « '+BD.age_label.replace('{n}',8)+' », tranche 6-20',AG.$('secZone')._h.includes(BD.age_label.replace('{n}',8))&&AG.$('secZone')._h.includes(BD.age_notes[1].replace(/&/g,'&amp;'))); }
  { const tot=IND.industries.reduce((a,x)=>a+x.n,0), L=(AC.nine_min/nm)/(AC.nine_min/tot), lx=L.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
    ok('concentration : '+AC.nine_min+' / '+nm+' contre '+AC.nine_min+' / '+tot+' pour le marché → « '+BD.lift_label.replace('{x}',lx)+' », mise en avant dès '+BD.lift_hi+'×, bulle',
       row.includes(BD.lift_label.replace('{x}',lx))&&row.includes(`class="mb-l${L>=BD.lift_hi?' hi':''}"`)&&row.includes(BD.lift_tip.slice(0,BD.lift_tip.indexOf('{')))); }
  { const ETS={themes:['Cloud','IA'],stocks:{[pick[0]]:[[0,2]],[pick[1]]:[[0,1],[1,1]]}};
    const TH=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days})};window.ETF_THEMES=${JSON.stringify(ETS)};`}); tab(TH);
    const ET=TH.sb.MM_CONFIG.etf_themes, rw=(TH.$('secZone')._h.match(rowRe)||[''])[0];
    ok('thèmes ETF : ligne « '+ET.row_label.replace('{t}','Cloud 2 · IA 1')+' » et thèmes dans l\'infobulle des titres',
       rw.includes(ET.row_label.replace('{t}','Cloud 2 · IA 1'))&&new RegExp(`data-pop="${pick[1]}" title="[^"]*Cloud, IA`).test(rw));
    ok('sans fichier de thèmes : pas de ligne de thèmes',!row.includes(ET.row_label.split('{t}')[0].trim())); }
  { const rk=+((strip(row).match(/rang TI65 (\d+)/)||[])[1]), lo=BD.low_label, has=r=>r.includes(`class="mb-lo"`)&&r.includes(`>${lo}</span>`);
    ok('Réveil au rang '+rk+' : étiquette « '+lo+' » seulement sous le rang '+BD.low_rank+', seuil dans la bulle',has(row)===(rk<BD.low_rank)
       &&(!has(row)||row.includes(BD.low_tip.replace('{r}',BD.low_rank).slice(0,60))));
    const LO=v=>{const B=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days})};MM_CONFIG.sectors.map.board.low_rank=${v};`});tab(B);return (B.$('secZone')._h.match(rowRe)||[''])[0];};
    ok('seuil lu dans la config : étiquette à 100, aucune à 0',has(LO(100))&&!has(LO(0)));
    // ordre des zones selon la phase de la séance (phase_rule) : ligne de tête, première zone, étiquette coupée si low = false
    const PHS=CFG.phases.phase, keys=JSON.stringify(PHS.map(p=>p.key));
    const RU=(order,low)=>{const B=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days})};MM_CONFIG.sectors.map.board.low_rank=100;`+
      `MM_CONFIG.sectors.map.board.phase_rule=[{phases:${keys},order:${JSON.stringify(order)},low:${low},tip:'bulle de phase'}];`});tab(B);return B.$('secZone')._h;};
    const pn=PHS.map(p=>p.name).find(n=>hb.includes(BD.phase_label.replace('{p}',n).split('{z}')[0])), rule=BD.phase_rule.find(r=>r.phases.some(k=>PHS.find(p=>p.key===k).name===pn));
    ok('phase de la séance ('+pn+') : ligne « '+(rule&&BD.phase_label.replace('{p}',pn).replace('{z}',{rev:MP.zones.reveil,both:MP.zones.lasting,neuf:BD.neuf_label}[rule.order[0]]))+' » et bulle des tests',
       !!rule&&hb.includes(`class="mbp" title="${rule.tip.replace(/&/g,'&amp;').slice(0,40)}`));
    const h1=RU(['neuf','both','rev'],false), h2=RU(['rev','both','neuf'],true);
    ok('règle de phase lue dans la config : zone de tête annoncée, étiquette « délaissée » coupée si low = false, gardée sinon',
       h1.includes(BD.phase_label.replace('{p}',pn).replace('{z}',BD.neuf_label))&&!has((h1.match(rowRe)||[''])[0])&&has((h2.match(rowRe)||[''])[0])&&h2.includes('title="bulle de phase"')); }
  ok('titres partis sur deux séances : pas d\'alerte « le même jour »',!row.includes(BD.same_day.replace('{n}',AC.nine_min)));
  ok('légende du tableau (config)',strip(hb).includes(BD.legend.replace('{w}',AC.nine_window).replace('{s}',AC.nine_share).slice(0,40)));
  ok('flex : la carte (part '+MP.side_share+', au moins '+MP.map_min+' px) et le tableau ('+(100-MP.side_share)+', au moins '+MP.zone_min+' px), côte à côte ou l\'un sous l\'autre selon la place',
     TV9.$('secMap').style.flex===`${MP.side_share} 1 ${MP.map_min}px`&&TV9.$('secZone').style.flex===`${100-MP.side_share} 1 ${MP.zone_min}px`);
  const zClick=ds=>TV9.L.secZone.click({target:{closest:()=>({dataset:ds,classList:{toggle(){},remove(){}},querySelector:()=>({}),timer:0})}});
  { let copied=null; TV9.sb.navigator={clipboard:{writeText:t=>{copied=t;return Promise.resolve();}}}; TV9.sb.isSecureContext=true; TV9.sb.clearTimeout=TV9.sb.clearTimeout||(()=>{}); TV9.sb.setTimeout=TV9.sb.setTimeout||(()=>0); zClick({zcopy:'all'});
    ok('Copier (tableau) : tous ses titres en 9M',copied!=null&&pick.every(t=>copied.split(', ').includes(t)),String(copied));
    zClick({zcopy:pick.join(',')}); ok('Copier (zone) : les titres de la zone',copied===pick.join(', '),String(copied)); }
  zClick({pop:pick[0]});
  ok('toucher un titre : sa fenêtre graphique',TV9.$('tkPop').hidden===false&&String(TV9.$('popTitle').textContent)===pick[0]);
  TV9.L.popX.click({});
  zClick({mapsel:'i:'+cand.g.k});
  ok('toucher une ligne : ligne et point choisis, barre d\'information',new RegExp(`class="mbr rev on" role="button" tabindex="0" data-mapsel="i:${kE}"`).test(TV9.$('secZone')._h)&&/<g class="pt rev imp sel">/.test(TV9.$('secMap')._h)&&/class="mapinfo"/.test(TV9.$('secMap')._h));
  zClick({zonefold:'1'});
  ok('replier le tableau : titre seul, choix mémorisé, la carte reste ouverte',!/class="mboard"/.test(TV9.$('secZone')._h)&&/<svg class="smap"/.test(TV9.$('secMap')._h));
  const days1=Array.from({length:N},()=>[]); days1[e]=pick.map(s=>[s,ii]);
  const SD=boot({'mm.secview':'tv'},{after:files+`INDUSTRIES.nine=${JSON.stringify({start:0,days:days1})};`}); tab(SD);
  ok('tous les titres partis la même séance : alerte « '+BD.same_day.replace('{n}',AC.nine_min)+' » avec sa bulle',SD.$('secZone')._h.includes(BD.same_day.replace('{n}',AC.nine_min))&&SD.$('secZone')._h.includes(BD.same_day_tip.slice(0,30))); }

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
