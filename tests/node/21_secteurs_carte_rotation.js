// Onglet Secteurs, vue TradingView : carte de rotation (type RRG) relative au marché (décision du 20/10/2026, « où va l'argent »).
// Valeurs recalculées indépendamment (force relative = TI65 de indice ÷ marché, accélération), zones, toucher (détail puis
// ouverture), marché du robot ou approché, taille des points (volume en dollars relatif), flux avec le volume.
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



const ls={}; let A=boot(ls);
const IND=A.sb.INDUSTRIES, CFG=A.sb.MM_CONFIG, R=CFG.sectors.rrg, N=IND.dates.length, min=CFG.industries.min_members;
tab(A); view(A,'tv');
ok('carte visible en vue TradingView, titre « secteurs · relatif au marché »',A.$('secRrg').hidden===false&&/secteurs · relatif au marché/.test(A.$('rrgWhat')._t||''),A.$('rrgWhat')._t);
// marché approché (ancien fichier sans stocks.c) : indices des secteurs pondérés par leur nombre de titres
const S=IND.sectors.filter(x=>x.n>=min);
const mk=[100]; for(let k=1;k<N;k++){let w=0,s=0;for(const x of IND.sectors){const a=x.c[k-1],b=x.c[k];if(a&&b){s+=x.n*(b/a-1);w+=x.n;}}mk.push(mk[k-1]*(1+(w?s/w:0)));}
const rx=(x,m,e)=>{const rs=x.c.map((v,k)=>v&&m[k]?v/m[k]:null);return sc(rs,e)==null?null:100*sc(rs,e);};
const q=(a,b)=>a>=100?(b>=100?'lead':'weak'):(b>=100?'impr':'lag');
const cnt={lead:0,weak:0,lag:0,impr:0};
for(const x of S){const a=rx(x,mk,N-1),a0=rx(x,mk,N-1-R.momentum);if(a==null||a0==null)continue;cnt[q(a,100*a/a0)]++;}
const info=strip(A.$('rrgInfo')._h);
ok('zones = recalcul (marché approché) : '+Object.entries(cnt).map(([k,v])=>R.labels[k]+' '+v).join(', '),Object.entries(cnt).every(([k,v])=>info.includes(R.labels[k]+' '+v))&&/marché approché/.test(A.$('rrgWhat')._t),info);
ok('sans volume relatif du robot : la carte le signale',/taille des points : au prochain passage du robot/.test(info));
// marché fourni par le robot (stocks.c) + volume relatif (rv) : plus d'approximation
const B=boot({},{after:`INDUSTRIES.stocks={n:9999,b:INDUSTRIES.dates.map(()=>50),c:INDUSTRIES.sectors[0].c.slice(),rv:INDUSTRIES.dates.map(()=>1)};INDUSTRIES.sectors.forEach((x,i)=>x.rv=INDUSTRIES.dates.map(()=>i%2?1.5:0.7));`});
tab(B); view(B,'tv');
const m2=B.sb.INDUSTRIES.stocks.c, c2={lead:0,weak:0,lag:0,impr:0};
for(const x of B.sb.INDUSTRIES.sectors.filter(x=>x.n>=min)){const a=rx(x,m2,N-1),a0=rx(x,m2,N-1-R.momentum);if(a==null||a0==null)continue;c2[q(a,100*a/a0)]++;}
const info2=strip(B.$('rrgInfo')._h);
ok('marché du robot (stocks.c) : zones = recalcul, pas « approché »',Object.entries(c2).every(([k,v])=>info2.includes(R.labels[k]+' '+v))&&!/approché/.test(B.$('rrgWhat')._t)&&!/prochain passage/.test(info2),info2);
// flux : volume relatif au marché affiché quand le robot le publie
B.L.secKpis.click({target:{closest:()=>({dataset:{sk:'rot'}})}});
ok('flux par secteur : « vol. ×… » quand le volume relatif existe',/vol\. ×(0,70|1,50)/.test(B.$('secFlow')._h),strip(B.$('secFlow')._h).slice(0,160));
// toucher : premier = détail, second = ouvre le secteur (industries filtrées), carte des industries du secteur
const hits=()=>vm.runInContext('typeof rrgHits!=="undefined"?rrgHits:null',A.sb);
const tapAt=(X,x,y)=>X.L.rrgCv.click({clientX:x,clientY:y});
A.$('rrgCv').getBoundingClientRect=()=>({left:0,top:0,width:900,height:500});
// position d'un point : recalculée comme le dessin (canvas 900 × 500 du DOM simulé)
const T0=Math.max(0,N-1-R.trail+1), pts=S.map(x=>({x,tr:Array.from({length:N-1-T0+1},(_,j)=>{const a=rx(x,mk,T0+j),a0=rx(x,mk,T0+j-R.momentum);return a==null||a0==null?null:[a,100*a/a0];}).filter(Boolean)})).filter(o=>o.tr.length);
let hx=0,hy=0;pts.forEach(o=>o.tr.forEach(([a,b])=>{hx=Math.max(hx,Math.abs(a-100));hy=Math.max(hy,Math.abs(b-100));}));hx*=1.18;hy*=1.18;
const P=6,W=900,H=500,X=v=>P+(v-100+hx)/(2*hx)*(W-2*P),Y=v=>H-P-(v-100+hy)/(2*hy)*(H-2*P);
const far=pts.map(o=>({k:o.x.k,p:o.tr[o.tr.length-1]})).sort((u,v)=>Math.abs(v.p[0]-100)-Math.abs(u.p[0]-100))[0];
tapAt(A,X(far.p[0]),Y(far.p[1]));
const lab=(CFG.sector_fr||{})[far.k]||far.k;
ok('premier toucher sur un point : détail (nom, zone, force relative)',strip(A.$('rrgInfo')._h).startsWith(lab)&&/force relative/.test(strip(A.$('rrgInfo')._h)),strip(A.$('rrgInfo')._h).slice(0,100));
tapAt(A,X(far.p[0]),Y(far.p[1]));
ok('second toucher : ouvre le secteur (industries filtrées) et la carte montre ses industries',crumbs(A).length===2&&chips(A).some(c=>c.on&&c.k===far.k)&&/industries · /.test(A.$('rrgWhat')._t),A.$('rrgWhat')._t);
// repliée : rien n'est dessiné, l'état est mémorisé
A.L.rrgHead.click({});
ok('repli de la carte mémorisé',ls['mm.rrg']==='0'&&A.$('rrgBody').hidden===true);
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
