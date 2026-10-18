// Onglet Tickers : saisie d'une liste (formats variés), secteur / industrie / TI65 / short interest, thèmes chauds
// (règle de config/display.toml recalculée ici), inconnus, tri, ouverture dans l'onglet Secteurs, noms échappés.
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
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,console};
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
if(A.sb.SHORT){const s=A.sb.SHORT.rows['PENG'];const rp=r.find(x=>x.s==='PENG');ok('short interest PENG : % shorté et days to cover',!s||(rp.cells[6].startsWith((s[2]*100).toFixed(1).replace('.',','))&&rp.cells[7].startsWith(s[3].toFixed(1).replace('.',','))),rp.cells.slice(6,8).join(' | '));}
// tri par days to cover
A.L.tkHead.click({target:{closest:()=>({dataset:{k:'dtc'}})}});
const d1=rows(A).map(x=>parseFloat((x.cells[7]||'').replace(',','.'))).filter(v=>!isNaN(v));
ok('tri par days to cover (décroissant)',d1.every((v,i,a)=>!i||a[i-1]>=v),d1.join(' > '));
// bulles
ok('bulle sur chaque en-tête',(A.$('tkHead')._h.match(/data-tip="tk:/g)||[]).length===8);
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
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
