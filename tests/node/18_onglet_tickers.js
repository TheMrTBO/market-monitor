// Onglet Tickers : saisie d'une liste (formats variés), secteur / industrie / TI65 / short interest, thèmes chauds
// (règle de config/display.toml recalculée ici), inconnus, tri, ouverture dans l'onglet Secteurs, noms échappés.
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
const tab=(A,t)=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:t}})}});
const rows=A=>[...A.$('tkRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1],h:m[2],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))}));
const themes=A=>[...A.$('tkThemes')._h.matchAll(/<button type="button" class="tktheme([^"]*)" data-ind="([^"]+)"[^>]*>(.*?)<\/button>/g)].map(m=>({hot:/hot/.test(m[1]),ind:m[2].replace(/&amp;/g,'&'),t:strip(m[3])}));
const sc=(c,e)=>{if(e<64)return null;let s7=0,s65=0;for(let i=e-64;i<=e;i++){if(c[i]==null)return null;s65+=c[i];if(i>e-7)s7+=c[i];}return s7/7/(s65/65);};

const ls={};
let A=boot(ls);
const CFG=A.sb.MM_CONFIG, IND=A.sb.INDUSTRIES, T=A.sb.TICKERS, TK=CFG.tickers;
tab(A,'tk');
ok('onglet Tickers : vue affichée, champ vide, exemple en indication',A.$('view-tk').hidden===false&&A.$('tkInput').placeholder.includes(TK.example.split(',')[0]));
// saisie : formats variés, doublons, inconnu
A.$('tkInput').value='nvda, $MU  NASDAQ:AMD\nPENG;nvda ZZZZQ BRK-B';
A.L.tkGo.click();
{ let copied=null; A.sb.navigator={clipboard:{writeText:s=>{copied=s;return Promise.resolve();}}}; A.sb.isSecureContext=true; A.L.tkCopy.click({});
  ok('Copier : tickers affichés dans l\'ordre, séparés par des virgules',copied===rows(A).map(r=>r.s).join(', ')&&rows(A).length>0,String(copied)); }
const r=rows(A), syms=r.map(x=>x.s);
ok('saisie : $, préfixe de bourse, minuscules, séparateurs, doublons',['NVDA','MU','AMD','PENG'].every(s=>syms.includes(s))&&syms.filter(s=>s==='NVDA').length===1,syms.join(','));
ok('BRK-B reconnu pour BRK.B',syms.includes('BRK.B')||!T.rows.some(x=>x[0]==='BRK.B'));
ok('inconnu signalé',/Inconnus/.test(A.$('tkNote')._h)&&/ZZZZQ/.test(A.$('tkNote')._h));
ok('liste mémorisée',ls['mm.tklist']==='nvda, $MU  NASDAQ:AMD\nPENG;nvda ZZZZQ BRK-B');
// contenu d'une ligne : secteur / industrie / TI65 depuis l'index
const col=Object.fromEntries(T.cols.map((k,i)=>[k,i])), mu=T.rows.find(x=>x[0]==='MU'), muInd=T.inds[mu[col.ind]][0], muSec=T.secs[T.inds[mu[col.ind]][1]];
const rmu=r.find(x=>x.s==='MU');
ok('ligne MU : secteur traduit, industrie, TI65 de l\'index',rmu.cells[1].startsWith(CFG.sector_fr[muSec]||muSec)&&rmu.cells[2].startsWith(muInd)&&rmu.cells[3].startsWith(((mu[col.ti]-1)*100>=0?'+':'')+((mu[col.ti]-1)*100).toFixed(2).replace('.',',')),rmu.cells.slice(1,4).join(' | '));
// thèmes chauds : règle recalculée ici
const end=IND.dates.length-1, rk=at=>IND.industries.filter(x=>x.n>=CFG.industries.min_members).map(x=>[x.k,sc(x.c,at)]).filter(x=>x[1]!=null).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)).map(x=>x[0]);
const now=rk(end), hotMax=Math.ceil(now.length*TK.hot_top_pct/100);
const heat=k=>{const i=now.indexOf(k), x=IND.industries.find(v=>v.k===k), s=sc(x.c,end), b=x.b[end], prev=rk(end-CFG.ti65.delta).indexOf(k);
  if(i>=0&&i+1<=hotMax&&s>1&&b!=null&&b>=TK.hot_min_breadth)return 'hot'; if(s>1&&i>=0&&prev>=0&&prev-i>=TK.emerging_min_delta)return 'emerging'; return '';};
const th=themes(A);
ok('thèmes : une carte par industrie de la liste, triées par rang',th.length===new Set(r.map(x=>x.cells[2].split(/ rang/)[0].replace(/ (chaud|émergent)$/,''))).size
  &&th.map(t=>now.indexOf(t.ind)).filter(i=>i>=0).every((v,i,a)=>!i||a[i-1]<=v),th.map(t=>t.ind+(t.hot?'*':'')).join(' · '));
ok('thèmes : étiquette chaud / émergent = règle de la config',th.every(t=>{const h=heat(t.ind);return (h==='hot')===t.hot&&(h!=='emerging'||/émergent/.test(t.t));}),th.map(t=>t.ind+':'+heat(t.ind)).join(' · '));
// short interest (si le fichier est là)
if(A.sb.SHORT){const s=A.sb.SHORT.rows['PENG'];const rp=r.find(x=>x.s==='PENG');ok('short interest PENG : % shorté et days to cover',!s||(rp.cells[7].startsWith((s[2]*100).toFixed(1).replace('.',','))&&rp.cells[8].startsWith(s[3].toFixed(1).replace('.',','))),rp.cells.slice(6,8).join(' | '));}
// tri par days to cover
A.L.tkHead.click({target:{closest:()=>({dataset:{k:'dtc'}})}});
const d1=rows(A).map(x=>parseFloat((x.cells[8]||'').replace(',','.'))).filter(v=>!isNaN(v));
ok('tri par days to cover (décroissant)',d1.every((v,i,a)=>!i||a[i-1]>=v),d1.join(' > '));
// bulles
ok('bulle sur chaque en-tête',(A.$('tkHead')._h.match(/data-tip="tk:/g)||[]).length===9);
{ const T2=A.sb.TICKERS, ci=Object.fromEntries(T2.cols.map((c,i)=>[c,i])), rr=rows(A);
  const ok1=rr.every(x=>{const row=T2.rows.find(y=>y[ci.s]===x.s), v=row&&ci.adr!=null?row[ci.adr]:null; return x.cells[4]===(v==null?'—':v.toFixed(1).replace('.',',')+' %');});
  ok('colonne ADR = valeur de l\'index (tickers_data.js) ou « — »',ok1,rr.map(x=>x.s+' '+x.cells[4]).join(' · ')); }
// clic : onglet Secteurs, vue TradingView, action retenue ouverte
A.L.tkRows.click({target:{closest:sel=>sel==='[data-open]'?{dataset:{open:'MU'}}:sel==='tr'?{dataset:{s:'MU'}}:null}});
const nav=JSON.parse(ls['mm.tvnav']);
ok('clic sur MU : onglet Secteurs, vue TradingView, industrie de MU',ls['mm.tab']==='sec'&&ls['mm.secview']==='tv'&&nav.ind===muInd&&nav.lvl==='stk'&&ls['mm.tvsel']==='MU',JSON.stringify(nav));
// thème cliqué : niveau industries filtré sur le secteur
tab(A,'tk'); A.L.tkThemes.click({target:{closest:()=>({dataset:{ind:muInd}})}});
const nav2=JSON.parse(ls['mm.tvnav']);
ok('clic sur un thème : industries filtrées sur son secteur, industrie sélectionnée',ls['mm.tab']==='sec'&&nav2.lvl==='ind'&&nav2.sec===muSec&&ls['mm.tvsel']===muInd);
// noms piégés
{
  const X=boot({},{after:"window.TICKERS.rows[0][1]='<img src=x onerror=alert(1)>';window.TICKERS.inds[window.TICKERS.rows[0][2]][0]+='<b>x</b>';"});
  tab(X,'tk'); X.$('tkInput').value=X.sb.TICKERS.rows[0][0]; X.L.tkGo.click();
  const raw=X.$('tkRows')._h+X.$('tkThemes')._h;
  ok('noms piégés : aucun HTML injecté',!/<img|<b>x/.test(raw)&&/&lt;img/.test(raw));
}
// sans index : message, pas d'erreur
const E=boot({'mm.tab':'tk'},{files:['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js','industries_data.js']}); tab(E,'tk');
ok('index pas encore chargé : message de chargement, fichier demandé',/Chargement/.test(E.$('tkRows')._h)&&E.document.body.children.some(c=>c.src&&c.src.startsWith(TK.file)));
// fiche : clic sur une ligne = fiche + graphique en bougies (fichier de l'industrie chargé à la demande)
{
  const ls2={}; const F=boot(ls2); tab(F,'tk');
  F.$('tkInput').value='MU, NVDA, AMD'; F.L.tkGo.click();
  F.R.tkCanvas=[];
  F.L.tkRows.click({target:{closest:sel=>sel==='[data-open]'?null:sel==='tr'?{dataset:{s:'NVDA'}}:null}});
  ok('clic sur une ligne : fiche de l\'action (reste dans l\'onglet Tickers)',ls2['mm.tab']==='tk'&&ls2['mm.tksel']==='NVDA'&&/NVDA/.test(F.$('tkTitle')._t||''),F.$('tkTitle')._t);
  const I=F.sb.INDUSTRIES.industries.find(i=>i.k===muInd), sc=F.document.body.children.find(c=>c.src&&c.src.includes(I.f+'.js'));
  ok('graphique : fichier de l\'industrie demandé',!!sc&&/Chargement|chargement/.test(F.$('tkInfo')._t||''),sc&&sc.src);
  vm.runInContext(fs.readFileSync(sc.src.split('?')[0],'utf8'),F.sb); F.R.tkCanvas=[]; sc.onload();
  const bodies=(F.R.tkCanvas||[]).filter(r=>r[3]>0&&r[3]<20&&r[4]>0&&(r[0]==='#f6e24b'||r[0]==='#cf5148')).length;
  const hasOhlc=F.sb.TV_STOCKS[I.f].rows[0].length>=8;
  ok('graphique : bougies japonaises (si le fichier a l\'OHLC)',!hasOhlc||bodies>20,bodies+' corps de bougie');
  ok('courbe du TI65 tracée',(F.M.tkScoreCv||[]).length>0);
  ok('fiche : capitalisation, flottant, short, secteur, industrie, lien Finviz',/Capitalisation/.test(F.$('tkFacts')._h)&&/Days to cover/.test(F.$('tkFacts')._h)&&/Industrie/.test(F.$('tkFacts')._h)&&/finviz/.test(F.$('tkLinks')._h));
  // navigation ‹ › dans l'ordre affiché
  const order=rows(F).map(x=>x.s);
  F.L.tkRows.click({target:{closest:sel=>sel==='[data-open]'?null:sel==='tr'?{dataset:{s:order[0]}}:null}});
  F.L.tkNext.click(); ok('› : ticker suivant de la liste',ls2['mm.tksel']===order[1],order.join(',')+' → '+ls2['mm.tksel']);
  F.L.tkPrev.click(); ok('‹ : ticker précédent',ls2['mm.tksel']===order[0]);
  // mobile : toucher une ligne ouvre la vue détail, « ‹ Liste » revient
  F.sb.innerWidth=375;
  F.L.tkRows.click({target:{closest:sel=>sel==='[data-open]'?null:sel==='tr'?{dataset:{s:'AMD'}}:null}});
  ok('mobile : toucher une ligne ouvre la fiche (vue détail)',F.$('view-tk').classList._s.has('detail')&&ls2['mm.tksel']==='AMD');
  F.L.tkBack.click({});
  ok('mobile : « ‹ Liste » revient à la liste',!F.$('view-tk').classList._s.has('detail'));
  // action hors filtres : graphique depuis le fichier « hors filtres » de son industrie, chargé pour sa fiche
  const hr=T.rows.find(x=>!x[col.kept]&&x[col.ti]!=null&&T.inds[x[col.ind]][2]), hors=hr[0], xf=T.inds[hr[col.ind]][2];
  F.sb.innerWidth=1200; F.$('tkInput').value=hors; F.L.tkGo.click();
  const sx=F.document.body.children.find(c=>c.src&&c.src.includes(xf+'.js'));
  ok('action hors filtres : signalée, fichier hors filtres demandé',/hors filtres/.test(F.$('tkInfo')._t||'')&&!!sx,hors+' : '+(sx&&sx.src));
  vm.runInContext(fs.readFileSync(sx.src.split('?')[0],'utf8'),F.sb); F.R.tkCanvas=[]; sx.onload();
  const b2=(F.R.tkCanvas||[]).filter(r=>r[3]>0&&r[3]<20&&r[4]>0&&(r[0]==='#f6e24b'||r[0]==='#cf5148')).length;
  ok('action hors filtres : bougies japonaises',b2>20,b2+' corps de bougie');
  // action sans historique de cours : graphique indisponible, expliqué
  const nh=T.rows.find(x=>!x[col.kept]&&x[col.c]==null);
  if(nh){F.$('tkInput').value=nh[0]; F.L.tkGo.click(); ok('action sans historique : graphique indisponible, expliqué',/pas d'historique/.test(F.$('tkInfo')._t||''),nh[0]+' : '+F.$('tkInfo')._t);}
}
// post-market : même fiche standard + informations du scan ; liste du scan → onglet Tickers ; « Ajouter à Tickers »
{
  const ls3={'mm.pmdir':'all'};
  const P=boot(ls3,{files:["config_data.js","stockbee_data.js","prices_data.js","vix_data.js","sectors_data.js","industries_data.js","tickers_data.js","postmarket_data.js","status_data.js"].concat(fs.existsSync("short_data.js")?["short_data.js"]:[])});
  tab(P,'pm');
  const f=strip(P.$('pmFacts')._h);
  ok('post-market : fiche standard (TI65, industrie, secteur, short) + infos du scan',/TI65 de l'action/.test(f)&&/Industrie/.test(f)&&/Days to cover/.test(f)&&/Post-market/.test(f)&&/Lendemain/.test(f),f.slice(0,120));
  ok('post-market : liens Finviz, Secteurs, Tickers',/finviz/.test(P.$('pmNote')._h)&&/data-goto=/.test(P.$('pmNote')._h)&&/data-addtk=/.test(P.$('pmNote')._h));
  const pmSyms=[...P.$('pmRows')._h.matchAll(/<tr data-s="([^"]+)"/g)].map(m=>m[1]);
  P.L.pmToTk.click();
  ok('bouton Tickers : liste du scan analysée dans l\'onglet Tickers',ls3['mm.tab']==='tk'&&pmSyms.length>0&&pmSyms.every(x=>ls3['mm.tklist'].includes(x)),ls3['mm.tklist']);
  P.$('tkInput').value='MU'; P.L.tkGo.click(); tab(P,'pm');
  P.DL.click.forEach(fn=>fn({target:{closest:sel=>sel==='[data-goto], [data-addtk]'?{dataset:{addtk:pmSyms[0]}}:null}}));
  ok('« Ajouter à Tickers » : ajouté à la liste existante, onglet ouvert',ls3['mm.tab']==='tk'&&/MU/.test(ls3['mm.tklist'])&&ls3['mm.tklist'].includes(pmSyms[0])&&ls3['mm.tksel']===pmSyms[0],ls3['mm.tklist']);
}
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
