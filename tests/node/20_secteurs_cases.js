// Onglet Secteurs, vue TradingView : cases en tête (décision du 20/10/2026) — industries, secteurs et actions au TI65 > 1,
// rotation ; valeurs recalculées indépendamment, raccourcis (filtre / tri, second toucher = retour), survol du graphique,
// fichier sans la série des actions (ancien format), vue ETF sans cases.
const fs=require('fs'),vm=require('vm');
require('./lib/fixtures');   // industries_data.js, tickers_data.js, industries/ : copie figée (tests/fixtures/)
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(ls,opts={}){
  // antérieur à la refonte du 27/10/2026 : vue ETF par défaut, bascule unique vers TradingView déjà faite (nouveau comportement : test 23)
  if(!('mm.secrefonte' in ls))ls['mm.secrefonte']='1';
  if(!('mm.secview' in ls))ls['mm.secview']='etf';
  // antérieur à la refonte du 27/10/2026 : vue TradingView ouverte sur Secteurs (défaut actuel : Leaders actifs, test 23)
  if(!('mm.tvnav' in ls))ls['mm.tvnav']=JSON.stringify({lvl:'sec',sec:'all',ind:null});
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


const nAbS=()=>IND.sectors.filter(x=>x.n>=CFG.industries.min_members&&sc(x.c,IND.dates.length-1)>1).length;
const kp=A=>[...A.$('secKpis')._h.matchAll(/<div class="kpi([^"]*)" data-sk="([^"]+)"[^>]*>([\s\S]*?)(?=<div class="kpi|$)/g)].map(m=>({k:m[2],on:/\bon\b/.test(m[1]),t:strip(m[3]),h:m[3]}));
const val=c=>strip((c.h.match(/<div class="val">([\s\S]*?)<\/div>/)||[])[1]);
const sk=(A,k)=>A.L.secKpis.click({target:{closest:()=>({dataset:{sk:k}})}});
const ls={};
let A=boot(ls);
const IND=A.sb.INDUSTRIES, CFG=A.sb.MM_CONFIG, K=CFG.sectors.kpis, N=IND.dates.length, min=CFG.industries.min_members, dl=CFG.ti65.delta;
tab(A);
ok('niveau ETF : les cases restent (point d\'ancrage du haut de page, 27/10/2026)',A.$('secKpis').hidden===false);
view(A,'tv');
let c=kp(A);
const tilesNow=K.tiles.filter(k=>k!=='stk'||(IND.stocks&&IND.stocks.b));
ok('vue TradingView : cases dans l\'ordre de la config (secteurs avant industries)',A.$('secKpis').hidden===false&&c.map(x=>x.k).join(',')===tilesNow.join(',')&&K.tiles.indexOf('sec')<K.tiles.indexOf('ind'),c.map(x=>x.k).join(','));
// industries / secteurs au TI65 > 1 : recalcul indépendant à la dernière séance
const cntAbove=L=>{const s=L.filter(x=>x.n>=min).map(x=>sc(x.c,N-1)).filter(v=>v!=null);return s.filter(v=>v>1).length+' / '+s.length;};
ok('industries TI65 > 1 = recalcul',val(c.find(x=>x.k==='ind'))===cntAbove(IND.industries),val(c.find(x=>x.k==='ind'))+' vs '+cntAbove(IND.industries));
ok('secteurs TI65 > 1 = recalcul',val(c.find(x=>x.k==='sec'))===cntAbove(IND.sectors),val(c.find(x=>x.k==='sec')));
// rotation : industries qui franchissent 1 en rotation_window séances (entrées / sorties), solde en grand comme le ±4 %
const W=K.rotation_window, I0=IND.industries.filter(x=>x.n>=min);
const ent=I0.filter(x=>{const a=sc(x.c,N-1-W),b=sc(x.c,N-1);return a!=null&&b!=null&&a<=1&&b>1;}).map(x=>x.k);
const out=I0.filter(x=>{const a=sc(x.c,N-1-W),b=sc(x.c,N-1);return a!=null&&b!=null&&a>1&&b<=1;}).map(x=>x.k);
const net=ent.length-out.length, rot=c.find(x=>x.k==='rot');
ok('rotation : solde, entrées et sorties = recalcul',val(rot)===(net>0?'+':'')+net&&rot.t.includes('+'+ent.length+' entrées')&&rot.t.includes('−'+out.length+' sorties'),rot.t.slice(0,100));
ok('rotation : le solde = variation du nombre d\'industries au-dessus de 1 (même ensemble d\'industries)',
  net===I0.filter(x=>sc(x.c,N-1-W)!=null&&sc(x.c,N-1)>1).length-I0.filter(x=>sc(x.c,N-1)!=null&&sc(x.c,N-1-W)>1).length);
ok('industries : plus de « il y a 5 j » (c\'est le solde de la rotation)',!/il y a/.test(c.find(x=>x.k==='ind').t));
// ratio de rotation : entrées / sorties de chaque séance (franchissement de 1), cumulées sur 5 (en grand) et 10 séances (dessous)
const RN=K.rotation_ratio_sessions;
const rwin=n=>{let en=0,ou=0;const keys=new Set();for(let j=N-n;j<=N-1;j++)for(const x of I0){const a=sc(x.c,j-1),b=sc(x.c,j);if(a==null||b==null)continue;if(a<=1&&b>1){en++;keys.add(x.k);}else if(a>1&&b<=1)ou++;}
  return {en,ou,txt:ou?(en/ou).toFixed(2).replace('.',','):(en?'∞':'—'),still:I0.filter(x=>keys.has(x.k)&&sc(x.c,N-1)>1).map(x=>x.k)};};
const w5=rwin(RN), still=w5.still, rr=c.find(x=>x.k==='rr');
ok('ratio rotation '+RN+' j en grand, « entrées / sorties » dessous (plus de 10 jours) = recalcul',!!rr&&val(rr)===w5.txt&&rr.t.includes(w5.en+' entrées / '+w5.ou+' sorties')&&!/10 jours/.test(rr.t),rr&&rr.t.slice(0,90));
// actions TI65 > 1 : série du robot ; ancien fichier sans la série → message, pas d'erreur
const stk=c.find(x=>x.k==='stk');
if(IND.stocks)ok('actions TI65 > 1 = dernière valeur de la série du robot',val(stk)===Math.round(IND.stocks.b[N-1])+' %',val(stk));
else ok('actions TI65 > 1 : fichier sans la série → case masquée (pas de case vide)',!stk);
const lsB={}, B=boot(lsB,{after:`INDUSTRIES.stocks={n:1234,b:INDUSTRIES.dates.map((_,i)=>i<70?null:40+i%7)};`});tab(B);view(B,'tv');
const sB=kp(B).find(x=>x.k==='stk');
ok('actions TI65 > 1 avec la série : valeur et effectif',val(sB)===(40+(N-1)%7)+' %'&&/1 234 actions/.test(sB.t),sB.t);
// raccourcis
sk(A,'ind');
ok('Industries > 1 : niveau industries (tous secteurs), filtre TI65 > 1, case active',crumbs(A).length===2&&ls['mm.tvabove']==='1'&&kp(A).find(x=>x.k==='ind').on);
const nAb=IND.industries.filter(x=>x.n>=min&&sc(x.c,N-1)>1).length;
ok('Industries > 1 : la liste montre les industries au-dessus de 1',rows(A).length===nAb,rows(A).length+' / '+nAb);
sk(A,'ind');
ok('Industries > 1 touchée à nouveau : filtre retiré, case inactive',ls['mm.tvabove']==='0'&&!kp(A).find(x=>x.k==='ind').on);
// Rotation : flux par secteur (d'où part et où arrive le mouvement), même séance que les cases
const secOf=new Map(IND.industries.map(x=>[x.k,x.sec])), byS=new Map();
ent.forEach(k=>{const s=secOf.get(k);byS.set(s,(byS.get(s)||0)+1);}); out.forEach(k=>{const s=secOf.get(k);byS.set(s,(byS.get(s)||0)-1);});
const best=[...byS].sort((a,b)=>b[1]-a[1])[0], worst=[...byS].sort((a,b)=>a[1]-b[1])[0];
const fr=CFG.sector_fr, lab=k=>fr[k]||k;
const tops=[...byS].filter(x=>best&&x[1]===best[1]).map(x=>lab(x[0])), bots=[...byS].filter(x=>worst&&x[1]===worst[1]).map(x=>lab(x[0]));   // égalités : l'un des secteurs ex aequo
ok('Rotation : dernière ligne = secteur où l\'on entre le plus (↑) et celui qu\'on quitte le plus (↓)',(!best||best[1]<=0||tops.some(s=>rot.t.includes('↑ '+s)))&&(!worst||worst[1]>=0||bots.some(s=>rot.t.includes('↓ '+s))),rot.t.slice(-60));
sk(A,'rot');
const fh=A.$('secFlow')._h, frows=[...fh.matchAll(/data-flsec="([^"]+)"[^>]*>[\s\S]*?<span class="fc">([\s\S]*?)<\/span><span class="fn">/g)].map(m=>{const c=m[2];const p=c.match(/class="pos">\+(\d+)/),n=c.match(/class="neg">−(\d+)/);return [m[1].replace(/&amp;/g,'&'),p?+p[1]:0,n?+n[1]:0];});
ok('Rotation touchée : panneau « flux par secteur », totaux = entrées / sorties, case active',A.$('secFlow').hidden===false&&frows.reduce((s,r)=>s+r[1],0)===ent.length&&frows.reduce((s,r)=>s+r[2],0)===out.length&&kp(A).find(x=>x.k==='rot').on,frows.slice(0,3).map(r=>r.join(' ')).join(' | '));
const nets=frows.map(r=>r[1]-r[2]), iPos=nets.filter(v=>v>0).length, iNeg=nets.filter(v=>v<0).length;
ok('flux : « l\'argent arrive » (soldes > 0 décroissants) puis « l\'argent repart » (du plus fort) puis mouvements compensés',
  /L'argent arrive/.test(strip(fh))===(iPos>0)&&/L'argent repart/.test(strip(fh))===(iNeg>0)&&nets.slice(0,iPos).every((v,i)=>v>0&&(!i||v<=nets[i-1]))&&nets.slice(iPos,iPos+iNeg).every((v,i,a)=>v<0&&(!i||v>=a[i-1]))&&nets.slice(iPos+iNeg).every(v=>v===0),nets.join(' '));
A.L.secFlow.click({target:{closest:()=>({dataset:{flsec:frows[0][0]}})}});
ok('toucher un secteur du flux : ses industries (filtre de secteur), panneau refermé',A.$('secFlow').hidden===true&&chips(A).some(c=>c.on&&c.k===frows[0][0])&&rows(A).every(r=>IND.industries.find(i=>i.k===r.s).sec===frows[0][0]),chips(A).filter(c=>c.on).map(c=>c.k).join(','));
up(A,0); sk(A,'ind'); sk(A,'ind');
sk(A,'rr');
ok('Ratio rotation : industries entrées ces '+RN+' séances et toujours au-dessus de 1',rows(A).map(r=>r.s).sort().join('|')===still.slice().sort().join('|')&&kp(A).find(x=>x.k==='rr').on&&!kp(A).find(x=>x.k==='rot').on,rows(A).length+' / '+still.length);
sk(A,'rr');
ok('Ratio rotation touchée à nouveau : toutes les industries',rows(A).length===IND.industries.length);
sk(A,'sec');
ok('Secteurs > 1 : niveau secteurs, filtre TI65 > 1',crumbs(A).length===1&&ls['mm.tvabove']==='1'&&kp(A).find(x=>x.k==='sec').on);
sk(A,'sec'); sk(B,'stk');
ok('Actions > 1 : niveau affiché classé par % > 1',lsB['mm.tvsort.sec']==='{"k":"brd","dir":-1}'&&kp(B).find(x=>x.k==='stk').on);
sk(B,'stk');
ok('Actions > 1 touchée à nouveau : retour au classement',lsB['mm.tvsort.sec']==='{"k":"rank","dir":1}');
// une seule case active à la fois : la case touchée remplace l'effet de la précédente
sk(A,'ind'); sk(A,'rot');
const onNow=()=>kp(A).filter(x=>x.on).map(x=>x.k).join(',');
ok('Industries puis Rotation : seule Rotation active, filtre TI65 > 1 retiré',onNow()==='rot'&&ls['mm.tvabove']==='0'&&A.$('secFlow').hidden===false,onNow()+' / tvabove '+ls['mm.tvabove']);
sk(A,'rr');
ok('Rotation puis Ratio rotation : seul Ratio actif, panneau du flux refermé',onNow()==='rr'&&A.$('secFlow').hidden===true,onNow());
sk(A,'sec');
ok('Ratio puis Secteurs : seul Secteurs actif, filtre « entrées » levé',onNow()==='sec'&&rows(A).length===nAbS(),onNow());
sk(A,'sec');
ok('case active touchée : plus aucune case active',onNow()===''&&ls['mm.tvabove']==='0');
// survol du graphique : les cases suivent la séance survolée, puis reviennent à la séance du classement
const note0=strip(A.$('secKpiNote')._t);
A.L.secCanvas.pointermove({clientX:200,clientY:50,pageX:200,pageY:50,pointerType:'mouse'});
const note1=strip(A.$('secKpiNote')._t);
A.L.secCanvas.mouseleave({});
ok('survol : « Survol : <séance> », puis retour à la séance du classement',/^Séance du /.test(note0)&&/^Survol : /.test(note1)&&strip(A.$('secKpiNote')._t)===note0,note1);
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
