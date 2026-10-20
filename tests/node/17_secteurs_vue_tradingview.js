// Onglet Secteurs, vue TradingView : bascule ETF / TradingView, secteurs -> industries (rang global, pastilles de secteur)
// -> actions classés par TI65, filtre TI65 > 1, miniature TI65, bulles d'information, courbe de tendance des groupes et
// carte « % > 1 », bougies des actions, chargement à la demande.
const fs=require('fs'),vm=require('vm');
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
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,clearTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of (opts.files||["config_data.js","stockbee_data.js","prices_data.js","vix_data.js","sectors_data.js","industries_data.js","tickers_data.js"].concat(fs.existsSync("short_data.js")?["short_data.js"]:[])))vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(opts.after)vm.runInContext(opts.after,sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}

const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const heads=A=>[...A.$('secHead')._h.matchAll(/<th[^>]*data-c="([^"]+)"[^>]*>(.*?)<\/th>/g)].map(m=>m[1]);
const rows=A=>[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1].replace(/&amp;/g,'&'),h:m[2],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))}));
const crumbs=A=>[...A.$('secFilt')._h.matchAll(/<button data-lvl="(\d)"[^>]*>(.*?)<\/button>/g)].map(m=>strip(m[2]));
const chips=A=>[...A.$('secChips')._h.matchAll(/<button data-(sec|above)="([^"]*)"([^>]*)>(.*?)<\/button>/g)].map(m=>({k:m[2].replace(/&amp;/g,'&'),on:/class="on"/.test(m[3]),t:strip(m[4])}));
const tab=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const view=(A,v)=>A.L.secView.click({target:{closest:()=>({dataset:{v},disabled:false})}});
const open=(A,s)=>A.L.secRows.click({target:{closest:sel=>sel==='[data-open]'?{dataset:{open:s}}:null}});
const up=(A,lvl)=>A.L.secFilt.click({target:{closest:()=>({dataset:{lvl:String(lvl)}})}});
const chip=(A,ds)=>A.L.secChips.click({target:{closest:()=>({dataset:ds})}});
const tip=(A,id)=>{A.DL.click.forEach(f=>f({target:{closest:sel=>sel==='.tipbtn'?{dataset:{tip:id},setAttribute(){},getBoundingClientRect:()=>({left:0,bottom:0})}:null},stopPropagation(){},preventDefault(){}}));return strip(A.$('pop')._h);};
const sc=(c,e)=>{if(e<64)return null;let s7=0,s65=0;for(let i=e-64;i<=e;i++){if(c[i]==null)return null;s65+=c[i];if(i>e-7)s7+=c[i];}return s7/7/(s65/65);};
const order=(items,dates,minN)=>items.filter(x=>minN==null||x.n>=minN).map(x=>[x.k||x[0],sc(x.c||x[3],dates.length-1)]).filter(x=>x[1]!=null).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)).map(x=>x[0]);
const bodies=A=>(A.R.secCanvas||[]).filter(r=>r[3]>0&&r[3]<20&&r[4]>0&&(r[0]==='#f6e24b'||r[0]==='#cf5148')).length;

const ls={};
let A=boot(ls);
const IND=A.sb.INDUSTRIES, CFG=A.sb.MM_CONFIG;
tab(A);
ok('vue ETF par défaut (55 lignes)',rows(A).length===A.sb.SECTORS.symbols.length,rows(A).length);
ok('ETF : miniature TI65 ajoutée',heads(A).join(',')==='rank,sym,grp,spark,dev,delta'&&/<svg class="spark"/.test(rows(A)[0].h),heads(A).join(','));
ok('titre : nom de l\'indicateur depuis la config',A.$('secTiName')._t===CFG.ti65.name&&A.$('secScoreName')._t==='Score '+CFG.ti65.name);
ok('bulle sur chaque filtre de groupe ETF',(A.$('secFilt')._h.match(/data-tip="grp:/g)||[]).length===CFG.sectors.groups.length);
ok('bulle sur chaque en-tête de colonne',(A.$('secHead')._h.match(/data-tip="col:/g)||[]).length===heads(A).length);
const tg=tip(A,'grp:Matières');
ok('bulle du filtre Matières : texte de la config + liste des ETF',tg.includes(CFG.sectors.group_tips['Matières'].slice(0,30))&&/GDX/.test(tg),tg.slice(0,90));
ok('bulle de colonne (Δ 5 j)',/Rang il y a 5 séances/.test(tip(A,'col:delta')));
ok('bulle de la bascule ETF / TradingView',/Industries/.test(tip(A,'secview')));

// 1) niveau secteurs
A.R.secCanvas=[];A.Sx.secCanvas={};
view(A,'tv');
const r1=rows(A), exp1=order(IND.sectors,IND.dates,CFG.industries.min_members);
ok('ordre des secteurs = TI65 recalculé',r1.slice(0,exp1.length).map(r=>r.s).join('|')===exp1.join('|'),r1.slice(0,3).map(r=>r.s).join(', '));
ok('colonnes du niveau secteurs',heads(A).join(',')==='rank,sym,brd,spark,dev,delta'&&/<th class="c-open"/.test(A.$('secHead')._h),heads(A).join(','));
const s0=IND.sectors.find(s=>s.k===r1[0].s), pc=(Math.round(s0.b[s0.b.length-1])+' %');
ok('nom : secteur traduit ; dessous nom TradingView, titres (% > 1 : sous l\'écart quand on trie dessus)',r1[0].cells[1].startsWith((CFG.sector_fr[r1[0].s]||r1[0].s)+' '+r1[0].s+' · '+s0.n+' titres')&&!/class="mob"/.test(r1[0].h),r1[0].cells[1]);
ok('% > 1 = valeur du fichier à la dernière séance',r1[0].cells[2]===pc,r1[0].cells[2]);
const sp=r1[0].h.match(/<polyline points="([^"]+)" class="(u|d)"/);
const nSp=Array.from({length:CFG.ti65.spark},(_,j)=>sc(s0.c,IND.dates.length-CFG.ti65.spark+j)).filter(v=>v!=null).length;
ok('miniature : un point par séance avec un TI65 (sur '+CFG.ti65.spark+'), couleur selon le dernier',!!sp&&sp[1].split(' ').length===nSp&&sp[2]===(sc(s0.c,IND.dates.length-1)>=1?'u':'d'),sp&&sp[2]);
const lateExp=IND.asof<A.sb.SECTORS.asof;
ok('alerte si la séance TradingView est en retard sur les ETF',lateExp===/pas encore publiée/.test(A.$('secMeta')._h||''),lateExp?strip(A.$('secMeta')._h):'à jour');
ok('fil d\'Ariane : Secteurs seul, avec bulle',crumbs(A).length===1&&/data-tip="lvl:sec"/.test(A.$('secFilt')._h),crumbs(A).join(' > '));
ok('pastille TI65 > 1 seule (pas de pastilles de secteur à ce niveau)',chips(A).length===1&&chips(A)[0].k==='1');
ok('graphique : courbe (cache local sans OHLC), pas de bougies',bodies(A)===0&&(A.Sx.secCanvas||{})['#d6d6d6']>0,bodies(A)+' corps');

// 2) TI65 > 1 : masque des lignes, rangs inchangés
chip(A,{above:'1'});
const ra=rows(A), nAbove=exp1.filter(k=>{const x=IND.sectors.find(s=>s.k===k);return sc(x.c,IND.dates.length-1)>1;}).length;
ok('TI65 > 1 : seulement les secteurs au-dessus de 1, rangs conservés',ra.length===nAbove&&ra.every((r,i)=>r.cells[0]===String(i+1)),ra.length+' / '+r1.length);
ok('TI65 > 1 : mémorisé',ls['mm.tvabove']==='1');
chip(A,{above:'1'});
ok('TI65 > 1 : retiré',rows(A).length===r1.length);

// 2 bis) « Classer par » (mobile) : TI65 · Δ 5 j · % > 1, même état que les en-têtes, mémorisé par niveau
const sortBy=(A,k)=>A.L.secSortBar.click({target:{closest:()=>({dataset:{sort:k}})}});
const sortBtns=A=>[...A.$('secSortBar')._h.matchAll(/<button data-sort="([^"]+)"([^>]*)>(.*?)<\/button>/g)].map(m=>({k:m[1],on:/class="on"/.test(m[2]),t:strip(m[3])}));
const dnum=s=>/^▲ \d+$/.test(s)?+s.slice(2):/^▼ \d+$/.test(s)?-s.slice(2):s==='='?0:null;
const colOf=(A,c)=>{const i=heads(A).indexOf(c);return rows(A).map(r=>r.cells[i]);};
ok('Classer par : visible en vue TradingView, TI65 · Δ 5 j · % > 1, TI65 actif',A.$('secSortBar').hidden===false&&sortBtns(A).map(b=>b.k).join(',')==='rank,delta,brd'&&sortBtns(A)[0].on,sortBtns(A).map(b=>b.t).join(' | '));
sortBy(A,'delta');
const dl=colOf(A,'delta').map(dnum).filter(v=>v!=null);
ok('Δ 5 j : plus fortes hausses d\'abord',dl.length>3&&dl.every((v,i)=>!i||v<=dl[i-1]),dl.slice(0,6).join(' '));
ok('Δ 5 j : bouton actif ▼, en-tête synchronisé, mémorisé pour les secteurs',sortBtns(A)[1].on&&/▼/.test(sortBtns(A)[1].t)&&/data-k="delta"[^>]*>.*?▼/.test(A.$('secHead')._h)&&ls['mm.tvsort.sec']==='{"k":"delta","dir":-1}',ls['mm.tvsort.sec']);
ok('Δ 5 j : valeur sous l\'écart mise en avant',/class="dsub on"/.test(rows(A)[0].h));
sortBy(A,'delta');
const dl2=colOf(A,'delta').map(dnum).filter(v=>v!=null);
ok('Δ 5 j touché à nouveau : sens inverse',dl2.every((v,i)=>!i||v>=dl2[i-1])&&/▲/.test(sortBtns(A)[1].t),dl2.slice(0,6).join(' '));
sortBy(A,'brd');
const bl=colOf(A,'brd').filter(v=>v!=='—').map(v=>parseFloat(v));
ok('% > 1 : du plus large au plus étroit, valeur sous l\'écart',bl.every((v,i)=>!i||v<=bl[i-1])&&/class="dsub on">\d+ % &gt; 1/.test(rows(A)[0].h),bl.slice(0,5).join(' '));
open(A,IND.sectors[0].k);
ok('niveau industries : tri propre au niveau (TI65 par défaut)',sortBtns(A)[0].on&&sortBtns(A).map(b=>b.k).join(',')==='rank,delta,brd');
up(A,0);
ok('retour aux secteurs : tri % > 1 retrouvé',sortBtns(A)[2].on&&ls['mm.tvsort.sec']==='{"k":"brd","dir":-1}');
ok('mémorisé après rechargement',(()=>{const B=boot(Object.assign({},ls));tab(B);return sortBtns(B).find(b=>b.on).k==='brd';})());
sortBy(A,'rank');
ok('TI65 : retour au classement',rows(A).slice(0,exp1.length).map(r=>r.s).join('|')===exp1.join('|'));

// 3) ouvrir un secteur : toutes les industries, filtre posé sur le secteur, rangs globaux
const S=IND.sectors.find(s=>IND.industries.some(i=>i.sec===s.k&&i.n<CFG.industries.few_members&&i.n>=CFG.industries.min_members)).k;
open(A,S);
const inds=IND.industries.filter(i=>i.sec===S), r2=rows(A), expAll=order(IND.industries,IND.dates,CFG.industries.min_members);
ok('ouvrir un secteur : industries filtrées sur ce secteur',r2.length===inds.length&&r2.every(r=>inds.some(i=>i.k===r.s)),S+' : '+r2.length);
ok('rang global (parmi toutes les industries)',r2.filter(r=>r.cells[0]!=='—').every(r=>+r.cells[0]===expAll.indexOf(r.s)+1),r2.slice(0,3).map(r=>r.s+' #'+r.cells[0]).join(', '));
ok('colonnes du niveau industries',heads(A).join(',')==='rank,sym,brd,spark,dev,delta',heads(A).join(','));
ok('fil d\'Ariane : Secteurs › Industries',crumbs(A).join(' › ')==='Secteurs '+IND.sectors.length+' › Industries '+IND.industries.length,crumbs(A).join(' › '));
const ch=chips(A);
ok('pastilles : TI65 > 1 en tête, puis Tous + un secteur chacun, secteur ouvert actif',ch.length===IND.sectors.length+2&&ch.find(c=>c.on).k===S&&ch[0].k==='1'&&ch[1].k==='all',ch.filter(c=>c.on).map(c=>c.t).join(','));
ok('bulle sur chaque pastille de secteur',(A.$('secChips')._h.match(/data-tip="tvsec:/g)||[]).length===IND.sectors.length+1);
const ts=tip(A,'tvsec:'+S);
ok('bulle d\'un secteur : industries, actions, TI65, rang',new RegExp(inds.length+' industries').test(ts)&&/rang/.test(ts)&&ts.includes(inds[0].k.replace(/&/g,'&')),ts.slice(0,90));
ok('navigation mémorisée',JSON.parse(ls['mm.tvnav']).lvl==='ind'&&JSON.parse(ls['mm.tvnav']).sec===S);
const few=r2.find(r=>{const i=inds.find(x=>x.k===r.s);return i.n>=CFG.industries.min_members&&i.n<CFG.industries.few_members;});
ok('industrie de 3-4 titres : classée, « peu de titres » sous le nom',!!few&&few.cells[0]!=='—'&&/peu de titres/.test(few.cells[1]),few&&few.cells[1]);
chip(A,{sec:'all'});
ok('pastille Tous : les '+IND.industries.length+' industries',rows(A).length===IND.industries.length&&rows(A).slice(0,expAll.length).map(r=>r.s).join('|')===expAll.join('|'));
chip(A,{sec:S});

// 4) actions d'une industrie : chargement à la demande, bougies quand le fichier a l'OHLC
const I=inds.filter(i=>i.n>=5).sort((a,b)=>b.n-a.n)[0];
open(A,I.k);
const script=A.document.body.children.find(c=>c.src&&c.src.includes(I.f));
ok('ouvrir une industrie : chargement du fichier, versionné par la séance',!!script&&script.src===CFG.industries.folder+'/'+I.f+'.js?v='+IND.asof.replace(/-/g,'')&&/Chargement des actions/.test(A.$('secRows')._h),script&&script.src);
vm.runInContext(fs.readFileSync(script.src.split('?')[0],'utf8'),A.sb);
const F=A.sb.TV_STOCKS[I.f];
F.rows.forEach(r=>{const c=r[3];r[5]=c.map(v=>v==null?null:v*0.99);r[6]=c.map(v=>v==null?null:v*1.02);r[7]=c.map(v=>v==null?null:v*0.98);});   // OHLC simulé
A.R.secCanvas=[];script.onload();
const r3=rows(A), exp3=order(F.rows,F.dates);
ok('actions de l\'industrie, classées par TI65',r3.length===I.n&&r3.slice(0,exp3.length).map(r=>r.s).join('|')===exp3.join('|'),r3.slice(0,3).map(r=>r.s).join(', '));
ok('colonnes du niveau actions',heads(A).join(',')==='rank,sym,cap,adr,spark,dev,delta'&&!/data-open=/.test(A.$('secRows')._h),heads(A).join(','));
// ADR 20 j (OHLC simulé ci-dessus : haut = C × 1,02, bas = C × 0,98 → haut ÷ bas = 1,0408… → ADR ≈ 4,1 %), filtre et copie
{ const AD=CFG.adr.sessions, ia=heads(A).indexOf('adr'), rA=rows(A), exp=100*(1.02/0.98-1);
  ok('ADR '+AD+' j : 100 × (moyenne(haut ÷ bas) − 1) = recalcul',rA.length&&rA.every(r=>r.cells[ia]===exp.toFixed(1).replace('.',',')+' %'),rA[0]&&rA[0].cells[ia]);
  ok('niveau actions : filtre ADR et bouton Copier visibles',A.$('secAdr').hidden===false);
  A.L.adrMin.change({target:{value:'4,5'}});
  ok('filtre « ADR > 4,5 % » : aucune action (toutes à ~4,1 %), mémorisé',rows(A).length===0&&ls['mm.adrmin']==='4.5'&&/0 \/ \d+ actions/.test(A.$('adrInfo')._t||''),A.$('adrInfo')._t);
  A.L.adrMin.change({target:{value:'4'}});
  ok('filtre « ADR > 4 % » : toutes les actions',rows(A).length===rA.length,rows(A).length+' / '+rA.length);
  A.L.adrMin.change({target:{value:''}});
  // copie : tickers affichés, dans l'ordre du tableau, séparés par des virgules
  let copied=null; A.sb.navigator={clipboard:{writeText:s=>{copied=s;return Promise.resolve();}}}; A.sb.isSecureContext=true;
  A.L.secCopy.click({});
  ok('Copier : tickers du tableau dans l\'ordre, séparés par des virgules',copied===rows(A).map(r=>r.s).join(', '),String(copied).slice(0,60));
}

ok('fiche action : bougies japonaises',bodies(A)>20,bodies(A)+' corps de bougie');
ok('fiche action : pas de carte « % > 1 »',A.$('secBrdCard').hidden===true);
ok('fiche action : fiche standard (TI65, industrie, short) et lien Finviz',/finviz\.com\/quote\.ashx\?t=/.test(A.$('secLinks')._h)&&/Days to cover/.test(A.$('secFacts')._h)&&A.$('secCard').hidden===false);
up(A,1);
ok('remonter aux industries : filtre de secteur conservé, industrie sélectionnée',rows(A).length===inds.length&&(A.$('secRows')._h.match(/<tr data-s="([^"]+)" class="sel/)||[])[1].replace(/&amp;/g,'&')===I.k);
up(A,0);
ok('remonter aux secteurs : secteur quitté sélectionné',(A.$('secRows')._h.match(/<tr data-s="([^"]+)" class="sel/)||[])[1]===S);

// 5) groupes : courbe de tendance, même si le fichier avait des bougies d'indice ; carte « % > 1 » dans le temps
const D=boot({'mm.secview':'tv'},{after:"window.INDUSTRIES.sectors.forEach(x=>{x.o=x.c.map(v=>v*0.995);x.h=x.c.map(v=>v*1.01);x.l=x.c.map(v=>v*0.99);});"});
tab(D);
ok('secteur : courbe de tendance, jamais de bougie d\'indice',bodies(D)===0&&(D.Sx.secCanvas||{})['#d6d6d6']>0,bodies(D)+' corps de bougie');
ok('secteur : carte « % > 1 » affichée et tracée',D.$('secBrdCard').hidden===false&&(D.M.secBrdCv||[]).length>0&&/%<\/b> de \d+ actions/.test(D.$('secBrdNow')._h),strip(D.$('secBrdNow')._h));
D.L.secBrdCv.pointermove({clientX:600,clientY:60,pageX:600,pageY:60});
const tipEl=D.document.body.children[D.document.body.children.length-1];
ok('carte « % > 1 » : infobulle au survol',/des actions avec un TI65 &gt; 1|Indisponible/.test(tipEl.innerHTML),strip(tipEl.innerHTML));
ok('bulle de la carte « % > 1 »',/largeur/.test(tip(D,'secbrd')));

// 5 bis) noms venus de TradingView piégés (HTML) : toujours affichés comme du texte, jamais interprétés
{
  const evil='<img src=x onerror=alert(1)>';
  const X=boot({'mm.secview':'tv'},{after:`(()=>{const I=window.INDUSTRIES,s=I.sectors[0],old=s.k;s.k=old+${JSON.stringify(evil)};I.industries.forEach(i=>{if(i.sec===old){i.sec=s.k;i.k=i.k+${JSON.stringify(evil)};}});})();`});
  tab(X);
  const S0=X.sb.INDUSTRIES.sectors[0].k;
  const raw=()=>[X.$('secRows')._h,X.$('secFilt')._h,X.$('secChips')._h,X.$('secInfo')._h||'',X.$('secMeta')._h||'',X.$('pop')._h||''].join('');
  X.L.secRows.click({target:{closest:sel=>sel==='[data-open]'?{dataset:{open:S0}}:null}});
  tip(X,'tvsec:'+S0);
  const bad=/<img/i.test(raw()), shown=/&lt;img/.test(raw());
  ok('noms piégés : aucun HTML injecté (affichés échappés)',!bad&&shown,bad?'INJECTION':'échappé');
}

// 6) retour aux ETF, absence du fichier TradingView
view(A,'etf');
ok('retour ETF : 55 lignes, pas de pastilles TradingView',rows(A).length===A.sb.SECTORS.symbols.length&&A.$('secChips').hidden===true);
const E=boot({'mm.secview':'tv'},{files:['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js']}); tab(E);
// industries_data.js chargé à la demande (plus au démarrage) : le fichier est demandé à l'ouverture de l'onglet ; il manque → échec
const scrE=E.document.body.children.find(c=>c.src&&/^industries_data\.js/.test(c.src));
ok('industries_data.js demandé à l\'ouverture de l\'onglet Secteurs (pas au démarrage)',!!scrE,scrE&&scrE.src);
if(scrE)scrE.onerror();
ok('sans fichier TradingView : bascule désactivée, vue ETF',/data-v="tv"[^>]*disabled/.test(E.$('secView')._h)&&rows(E).length===E.sb.SECTORS.symbols.length);
// chargement à la demande : au démarrage (MM), pas d'industries_data.js ; ouverture de Secteurs → demandé, chargé, vue TradingView
const Fb=boot({'mm.secview':'tv'},{files:['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js','tickers_data.js']});
const reqI=X=>X.document.body.children.find(c=>c.src&&/^industries_data\.js/.test(c.src));
ok('démarrage sur le MM : industries_data.js non chargé',!reqI(Fb)&&!Fb.sb.INDUSTRIES);
tab(Fb);
ok('ouverture de Secteurs : « Chargement… » puis fichier demandé',!!reqI(Fb)&&/Chargement des secteurs et industries/.test(Fb.$('secRows')._h),strip(Fb.$('secRows')._h).slice(0,60));
vm.runInContext(fs.readFileSync('industries_data.js','utf8'),Fb.sb); reqI(Fb).onload();
ok('fichier chargé : vue TradingView affichée (secteurs classés)',rows(Fb).length===Fb.sb.INDUSTRIES.sectors.length&&!/disabled/.test(Fb.$('secView')._h),rows(Fb).length);
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
