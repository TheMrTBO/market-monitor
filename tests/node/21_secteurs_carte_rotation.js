// Onglet Secteurs, vue TradingView : carte de rotation (type RRG) relative au marché (décision du 20/10/2026, « où va l'argent »).
// Valeurs recalculées indépendamment (force relative = TI65 de indice ÷ marché, accélération), zones, toucher (détail puis
// ouverture), marché du robot ou approché, taille des points (volume en dollars relatif), flux avec le volume.
const fs=require('fs'),vm=require('vm');
require('./lib/fixtures');   // industries_data.js, tickers_data.js, industries/ : copie figée (tests/fixtures/)
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(ls,opts={}){
  // antérieur à la refonte du 27/10/2026 : vue TradingView sur Secteurs, carte ouverte (défauts actuels : Leaders actifs, carte repliée ; test 23)
  if(!('mm.tvnav' in ls))ls['mm.tvnav']=JSON.stringify({lvl:'sec',sec:'all',ind:null});
  if(!('mm.rrgopen' in ls))ls['mm.rrgopen']='1';
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
  vm.runInContext('MM_CONFIG.sectors.rrg.shown=true;',sb);   // carte retirée de la page le 27/10/2026 (config shown = false) : testée réactivée
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



// cas « ancien fichier » (sans indice de marché ni volume relatif) simulé : le robot publie ces séries depuis le 20/10/2026, le test
// ne doit pas dépendre du fichier du jour (il échouait dès la première publication des séries)
const ls={}; let A=boot(ls,{after:'delete INDUSTRIES.stocks;'});
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
const B=boot({},{after:`INDUSTRIES.stocks={n:9999,b:INDUSTRIES.dates.map(()=>50),c:INDUSTRIES.sectors[0].c.slice(),rv:INDUSTRIES.dates.map(()=>1)};INDUSTRIES.sectors.forEach((x,i)=>x.rv=INDUSTRIES.dates.map(()=>i%2?1.5:0.7));INDUSTRIES.industries.forEach((x,i)=>x.rv=INDUSTRIES.dates.map(()=>i%2?1.5:0.7));`});
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
// une seule page, dans l'ordre (demande du 20/10/2026 ; refonte du 27/10/2026 : groupes actifs avant le classement, carte en fin d'onglet)
{ const H=fs.readFileSync('stockbee_dashboard.html','utf8'), at=id=>H.indexOf('id="'+id+'"');
  const ids=['secKpis','secFrise','frisePh','secKpiNote','secFlow','secAct','listFold','secTable','secRrg','view-pm'];   // 27/10 : cases fixes, frise en séparateur
  ok('ordre de la page : '+ids.join(' → '),ids.every((id,i)=>at(id)>0&&(!i||at(id)>at(ids[i-1])))&&!/id="secSub"/.test(H)); }
// tableau « Depuis la veille » (21/10/2026) : au niveau secteurs de la carte, il liste les industries de tout le marché (secteur
// sous le nom) ; vues Pistes (par défaut) / Confirmés / Changements, Tous en lien ; lignes recalculées indépendamment (marché
// approché de A) : TI65 seul, part des actions > 1 et sa variation, persistance (« Depuis »), forts, limites, toucher
{ const by=x=>(CFG.sector_fr||{})[x]||x, [W1,W2]=R.delta_windows, e=N-1;
  const IS=IND.industries.filter(x=>x.n>=min);
  const mkRows=(m,list)=>{const P=list.map(x=>{const rs=x.c.map((v,k)=>v&&m[k]?v/m[k]:null),px=rs.map((_,k)=>{const v=sc(rs,k);return v==null?null:100*v;});
      return {x,rs,px,py:px.map((v,k)=>v==null||k<R.momentum||px[k-R.momentum]==null?null:100*v/px[k-R.momentum])};});
    return k=>{const L=P.map(({x,px,py})=>{const a=px[k],b=py[k],a1=px[k-W1],b1=py[k-W1],a2=k>=W2?px[k-W2]:null,b2=k>=W2?py[k-W2]:null;if([a,b,a1,b1].some(v=>v==null))return null;
        const edge=Math.min((a1>=100)!==(a>=100)?Math.abs(a-100):Infinity,(b1>=100)!==(b>=100)?Math.abs(b-100):Infinity),t65=sc(x.c,k);
        const br=Array.isArray(x.b)&&x.b[k]!=null?{share:x.b[k]/100,pct:x.b[k],w:k>=W2&&x.b[k-W2]!=null?x.b[k]-x.b[k-W2]:null}:null;
        const d2=a2==null?null:a-a2,dy2=b2==null?null:b-b2,to=q(a,b),pist=a<=R.pistes_max_rs&&d2>0&&dy2>0&&(!br||br.w==null||br.w>0);
        return {k:x.k,sec:x.sec,n:x.n,a,from:q(a1,b1),to,d1:a-a1,d2,dy2,t65,br,m:Math.hypot(a-a1,b-b1),lim:edge<R.zone_margin,pist,
          conf:to==='lead'&&t65!=null&&t65>R.confirm_ti65&&(!br||br.share>=R.confirm_breadth)&&d2>0,fade:dy2<0,watch:!pist&&to==='lag'&&dy2>0&&a-a1>=0};}).filter(Boolean);
      const ms=L.map(r=>r.m).sort((p,r)=>p-r),med=(ms[(ms.length-1)>>1]+ms[ms.length>>1])/2;
      L.forEach(r=>{r.fort=r.m>=R.major_factor*med;r.bas=r.from!==r.to;r.weak=r.bas&&r.lim&&!r.fort;});return L;};};
  const exp=m=>{const at=mkRows(m,IS),L=at(e),memo={},st=(k,key)=>{let n=0;for(let j=e;j>=0&&n<R.streak_max;j--){const r=(memo[j]=memo[j]||new Map(at(j).map(x=>[x.k,x]))).get(k);if(!r||!r[key])break;n++;}return n;};
    L.forEach(r=>{r.nc=r.conf?st(r.k,'conf'):0;r.np=r.pist?st(r.k,'pist'):0;});const wd=r=>r.br&&r.br.w!=null?r.br.w:0;
    return {L,pist:L.filter(r=>r.pist).sort((p,r)=>r.np-p.np||wd(r)-wd(p)||r.d2-p.d2).concat(L.filter(r=>r.watch).sort((p,r)=>r.dy2-p.dy2)),conf:L.filter(r=>r.conf).sort((p,r)=>r.a-p.a),
      chg:L.filter(r=>r.fort||r.bas).sort((p,r)=>p.weak-r.weak||r.m-p.m),all:L.slice().sort((p,r)=>r.a-p.a)};};
  const cl=(h,c)=>{const m=h.match(new RegExp('<td class="[^"]*\\b'+c+'\\b[^"]*">(.*?)</td>'));return m?strip(m[1]).replace(/&amp;/g,'&'):null;};
  const trs=X=>[...X.$('rrgTab')._h.matchAll(/<tr data-mv="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({k:m[1].replace(/&amp;/g,'&'),h:m[2],on:/class="on/.test(m[0])}));
  const name=r=>strip(r.h.match(/<td class="rtn">(.*?)<small>/)[1].replace(/<span class="(rttag|etat)[^>]*>.*?<\/span>/g,'').replace(/<span class="rtsec">.*?<\/span>/,'')).replace(/&amp;/g,'&');
  const rv=(X,v)=>X.L.rrgTab.click({target:{closest:sel=>sel==='[data-rv]'?{dataset:{rv:v}}:null}});
  const tapRow=(X,k)=>X.L.rrgTab.click({target:{closest:sel=>sel==='[data-mv]'?{dataset:{mv:k}}:null}});
  const rall=X=>X.L.rrgTab.click({target:{closest:sel=>sel==='[data-rall]'?{dataset:{rall:'1'}}:null}});
  const same=(X,list,label)=>{const T=trs(X),want=list.slice(0,R.table_rows);
    ok(label+' : '+(want.map(r=>r.k+(r.np?' '+r.np+' j':'')).join(', ')||'aucune ligne'),want.length?T.map(name).join('|')===want.map(r=>r.k).join('|'):T.length===0&&/class="rtnone"/.test(X.$('rrgTab')._h),T.map(name).join('|'));return T;};
  A.L.rrgNav.click({target:{closest:()=>({dataset:{up:'sec',sec:''}})}});                       // retour au niveau secteurs
  const ns=x=>x.replace(/[+\-−]/g,''), E=exp(mk), f1=v=>{const r=Math.round(v*10)/10||0;return (r>0?'+':'')+Math.abs(r).toFixed(1).replace('.',',');};
  console.log('      (fixtures, '+IS.length+' industries : '+E.pist.length+' piste(s), '+E.conf.length+' confirmé(s), '+E.chg.length+' changement(s))');
  ok('tableau au niveau secteurs : industries de tout le marché, vue '+R.default_view+' par défaut, compteurs des trois vues, lien « Tous »',/Depuis la veille/.test(strip(A.$('rrgTab')._h))
    &&new RegExp('data-rv="'+R.default_view+'" class="on"').test(A.$('rrgTab')._h)&&/<th class="rtn">Industrie/.test(A.$('rrgTab')._h)
    &&['pist','conf','chg'].every(v=>new RegExp('data-rv="'+v+'"[^>]*>[^<]*<b>'+E[v].length+'</b>').test(A.$('rrgTab')._h))&&new RegExp('data-rv="all">Tous \\('+E.all.length+'\\)').test(A.$('rrgTab')._h),strip(A.$('rrgTab')._h).slice(0,140));
  ok('en-tête du tableau : son périmètre écrit (« '+E.all.length+' industries, tout le marché »)',strip(A.$('rrgTab')._h).includes(E.all.length+' industries, tout le marché'));
  rv(A,'pist'); let T=same(A,E.pist,'Pistes = recalcul (force ≤ '+R.pistes_max_rs+', Δ '+W2+' j > 0, accélération en hausse, part des actions > 1 en hausse ; tri persistance, élargissement, Δ '+W2+' j ; puis surveillance)');
  ok('Pistes : colonne « Depuis » = séances consécutives recalculées, « '+R.tags.watch+' » sur les En retard dont la baisse ralentit',T.every((t,i)=>{const r=E.pist[i];return cl(t.h,'rts')===(r.np?(r.np>=R.streak_max?R.streak_max+'+':r.np)+' j':'—')&&t.h.includes('>'+R.tags.watch+'<')===!!r.watch;}),T.map(t=>cl(t.h,'rts')).join(' '));
  ok('secteur et nombre de titres sous chaque industrie',T.every((t,i)=>new RegExp('<span class="rtsec">'+by(E.pist[i].sec).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' · '+E.pist[i].n+' titres</span>').test(t.h.replace(/&amp;/g,'&'))),T.length&&strip(T[0].h).slice(0,80));
  rv(A,'conf'); T=same(A,E.conf,'Confirmés = recalcul (Meneur, TI65 seul > '+R.confirm_ti65+', ≥ '+R.confirm_breadth*100+' % des actions > 1, Δ '+W2+' j > 0, tri force relative)');
  ok('Confirmés : « '+R.tags.fade+' » quand l\'accélération baisse (libellés de la config)',T.every((t,i)=>(t.h.includes('>'+R.tags.fade+'<')||t.h.includes('>'+R.tags.fade.replace("'","&#39;")+'<'))===E.conf[i].fade));
  rv(A,'all'); T=trs(A);
  ok('Tous : '+R.table_rows+' lignes triées par force relative, puis « Voir les N autres » (coût du rendu borné)',T.length===Math.min(R.table_rows,E.all.length)&&T.map(name).join('|')===E.all.slice(0,R.table_rows).map(r=>r.k).join('|')
    &&(E.all.length<=R.table_rows||new RegExp('Voir les '+(E.all.length-R.table_rows)+' autres').test(A.$('rrgTab')._h)),T.length);
  rall(A); T=trs(A);
  ok('Tous dépliés : toutes les industries',T.length===E.all.length&&T.map(name).join('|')===E.all.map(r=>r.k).join('|'),T.length);
  ok('colonnes TI65 seul, Δ '+W1+' j, Δ '+W2+' j, Act. > 1 = recalcul',T.every((t,i)=>{const r=E.all[i],b=cl(t.h,'rtb');return cl(t.h,'rtt')===(r.t65==null?'—':r.t65.toFixed(3).replace('.',','))
    &&ns(cl(t.h,'rd1'))===ns(f1(r.d1))&&ns(cl(t.h,'rd2'))===(r.d2==null?'—':ns(f1(r.d2)))&&(r.br?b.startsWith(Math.round(r.br.pct)+' %'):b==='—');}),
    T.slice(0,3).map(t=>['rtt','rd1','rd2','rtb'].map(c=>cl(t.h,c)).join(' ')).join(' | '));
  const hd=X=>[...X.$('rrgTab')._h.matchAll(/<th(?:[^>"]|"[^"]*")*>(.*?)<\/th>/g)].map(m=>strip(m[1].replace(/<span class="tipbtn.*?<\/span>/g,'').replace(/<span class="rtmob">.*?<\/span><\/span>/g,'')));
  ok('en-têtes (vue Tous) : 8 colonnes bien formées',hd(A).length===8&&hd(A)[0]==='Industrie'&&hd(A)[6]==='Act. &gt; 1'&&hd(A)[7]==='Vol.',hd(A).join(' | '));
  rv(A,'pist');
  ok('en-têtes (vue Pistes) : colonne « Depuis » en plus',hd(A).length===9&&hd(A)[2]==='Depuis',hd(A).join(' | '));
  // explications dans des bulles ⓘ placées là où elles servent : une par vue, une par colonne, le titre
  const H=A.$('rrgTab')._h, phr='Pistes : force relative ≤ '+R.pistes_max_rs+' (pas encore étendue), en hausse sur '+W2+' j, accélération en hausse, part des actions au-dessus de 1 en hausse ; triées par persistance (depuis), puis élargissement, puis Δ '+W2+' j. « surveillance » : '+R.labels.lag+' dont la baisse ralentit.';
  const ids=['use','conf','pist','chg','all','zone','since','force','ti65','delta','brd','vol'];
  ok('bulles du tableau : une par vue (dans son bouton), par colonne et pour le titre',ids.every(k=>H.includes('data-tip="skpi:rt'+k+'"'))&&/data-rv="pist"[^>]*>Pistes <b>\d+<\/b><span class="tipbtn/.test(H),ids.filter(k=>!H.includes('data-tip="skpi:rt'+k+'"')).join(','));
  const tp=k=>tip(A,'skpi:rt'+k);
  ok('bulle Pistes : critères au niveau des industries',tp('pist').includes(phr),tp('pist').slice(0,300));
  ok('bulles Confirmés / Changements / Act. > 1 / TI65 / Depuis / titre : chacune son sujet',/Confirmés : Meneur/.test(tp('conf'))&&!/Pistes :/.test(tp('conf'))&&tp('chg').includes(R.tags.strong+' : déplacement')
    &&/Part des actions/.test(tp('brd'))&&/sans le comparer au marché/.test(tp('ti65'))&&/Séances consécutives/.test(tp('since'))&&/industries de tout le marché/.test(tp('use')),tp('use').slice(0,120));
  ok('rien sous le tableau à part les liens',!/Pistes :|Confirmés :|Fort :/.test(strip(H.split('class="rtfoot"')[1]||'')));
  rv(A,'chg'); T=trs(A);
  ok('Changements = recalcul (forts puis bascules, limites en dernier) : '+E.chg.slice(0,R.table_rows).map(r=>r.k+(r.fort?' fort':'')+(r.bas?' '+r.from+'→'+r.to:'')+(r.lim?' limite':'')).join(', '),
    T.map(name).join('|')===E.chg.slice(0,R.table_rows).map(r=>r.k).join('|')&&T.every((t,i)=>t.h.includes('>'+R.tags.strong+'<')===E.chg[i].fort&&t.h.includes('>'+R.tags.edge+'<')===(E.chg[i].bas&&E.chg[i].lim)),T.map(name).join(' | '));
  ok('vue mémorisée',ls['mm.rrgview']==='chg');
  if(E.chg.length>R.table_rows){ ok('« Voir les N autres » présent',new RegExp('Voir les '+(E.chg.length-R.table_rows)+' autres').test(A.$('rrgTab')._h));
    rall(A); ok('« Voir les N autres » : toutes les lignes',trs(A).length===E.chg.length,trs(A).length); }
  // toucher une industrie sur la carte des secteurs (retour du 21/10/2026 : « le même titre réapparaît ») : 1er = son secteur en
  // avant, la ligne marquée et « Ouvrir › » sous la carte ; 2e = l'industrie s'ouvre (ses actions), pas son secteur
  const r0=E.chg[0];
  tapRow(A,r0.k);
  ok('industrie touchée : la ligne marquée, son secteur en avant sur la carte, « Ouvrir › » pour l\'industrie',trs(A).find(t=>t.k===r0.k).on&&strip(A.$('rrgInfo')._h).startsWith(r0.k+' · '+by(r0.sec))
    &&/data-openind="1"/.test(A.$('rrgInfo')._h),strip(A.$('rrgInfo')._h).slice(0,90));
  tapRow(A,r0.k);
  ok('industrie touchée à nouveau : l\'industrie s\'ouvre (ses actions)',A.$('rrgWhat')._t.includes('actions · '+r0.k),A.$('rrgWhat')._t);
  A.L.rrgNav.click({target:{closest:()=>({dataset:{up:'ind',sec:r0.sec}})}});
  ok('dans un secteur : le tableau suit la carte (ses industries), vue « '+R.views[R.default_view_in]+' » par défaut, celle du marché gardée',
    A.$('rrgWhat')._t.includes('industries · '+by(r0.sec))&&trs(A).length===IND.industries.filter(x=>x.sec===r0.sec&&x.n>=min).length&&!/class="rtsec"/.test(A.$('rrgTab')._h)
    &&!/data-rv="(pist|conf|chg)" class="on"/.test(A.$('rrgTab')._h)&&ls['mm.rrgview']==='chg',trs(A).map(t=>t.k).join(', '));
  ok('dans un secteur : périmètre « industries de '+by(r0.sec)+' »',strip(A.$('rrgTab')._h).includes('industries de '+by(r0.sec)));
  rv(A,'pist');
  ok('vue choisie dans un secteur : mémorisée à part, la vue du marché inchangée',ls['mm.rrgviewin']==='pist'&&ls['mm.rrgview']==='chg');
  ok('niveau industries : en-têtes « Industrie » et « Act. > 1 »',/<th class="rtn">Industrie/.test(A.$('rrgTab')._h)&&/>Act\. &gt; 1/.test(A.$('rrgTab')._h));
  rv(A,'all');
  // réduire le tableau sans réduire la carte : en-tête et vues gardés, lignes masquées, mémorisé
  const tog=X=>X.L.rrgTab.click({target:{closest:sel=>sel==='[data-rtog]'?{dataset:{rtog:'1'}}:null}});
  A.L.rrgNav.click({target:{closest:()=>({dataset:{up:'sec',sec:''}})}}); tog(A);
  const th=A.$('rrgTab')._h;
  ok('tableau réduit : lignes masquées, en-tête et vues gardés, carte toujours dessinée, mémorisé',!/<table/.test(th)&&/data-rv="pist"/.test(th)&&/aria-expanded="false"/.test(th)
    &&A.$('secRrg').hidden===false&&/Meneur \d+/.test(strip(A.$('rrgInfo')._h))&&ls['mm.rrgtab']==='0',strip(th).slice(0,80));
  tog(A);
  ok('tableau déplié à nouveau',/<table/.test(A.$('rrgTab')._h)&&ls['mm.rrgtab']==='1');
  // clavier : Entrée sur une ligne = toucher, sans déclencher le raccourci Entrée du classement (propagation arrêtée)
  { let clicked=0, stopped=0; const t={dataset:{mv:'x'},click(){clicked++;}};
    A.L.rrgTab.keydown({key:'Enter',target:{closest:sel=>sel==='tr[data-mv]'?t:null},preventDefault(){},stopPropagation(){stopped++;}});
    ok('clavier : Entrée sur une ligne = toucher, propagation arrêtée',clicked===1&&stopped===1); }
  // repère mesuré au niveau des industries : recalculé indépendamment sur le fichier réel (marché du robot), comparé aux bulles
  { const Z=boot({}); tab(Z); view(Z,'tv'); const ZI=Z.sb.INDUSTRIES, at=mkRows(ZI.stocks.c,ZI.industries.filter(x=>x.n>=min)), ZN=ZI.dates.length, H=R.measure_sessions[0];
    const rsOf=x=>x.c.map((v,k)=>v&&ZI.stocks.c[k]?v/ZI.stocks.c[k]:null), RS=new Map(ZI.industries.map(x=>[x.k,rsOf(x)]));
    const F=Array.from({length:ZN},(_,k)=>new Map(at(k).map(r=>[r.k,r]))), c={all:[],conf:[],pist:[],long:[]}, run={}; let hit=0,np=0;
    const streak=F.map(m=>{const o={};for(const k of RS.keys()){const r=m.get(k);run[k]=r&&r.pist?(run[k]||0)+1:0;o[k]=run[k];}return o;});
    for(let k=0;k+H<ZN;k++)for(const [key,r] of F[k]){const rs=RS.get(key),A_=rs[k],B_=rs[k+H];if(!A_||!B_)continue;const v=100*(B_/A_-1);c.all.push(v);if(r.conf)c.conf.push(v);
      if(r.pist){c.pist.push(v);np++;if(streak[k][key]>=R.measure_streak)c.long.push(v);for(let j=1;j<=H;j++){const g=F[k+j].get(key);if(g&&g.conf){hit++;break;}}}}
    const avg=a=>a.reduce((p,v)=>p+v,0)/a.length, P=v=>(v>0?'+':'')+v.toFixed(2).replace('.',',')+' %';
    const tc=tip(Z,'skpi:rtconf'), tpi=tip(Z,'skpi:rtpist');
    ok('repère Confirmés ('+H+' séances, industries) = recalcul : '+P(avg(c.conf))+' ('+c.conf.length+' cas) · toutes '+P(avg(c.all))+' ('+c.all.length+' cas)',
      tc.includes(H+' séances : '+R.views.conf+' '+P(avg(c.conf))+' ('+c.conf.length+' cas')&&tc.includes('toutes les industries '+P(avg(c.all))+' ('+c.all.length+' cas'),tc.slice(tc.indexOf('Repère'),tc.indexOf('Repère')+260));
    ok('repère Pistes : '+P(avg(c.pist))+' ('+np+' cas), depuis '+R.measure_streak+' séances ou plus '+P(avg(c.long))+' ('+c.long.length+' cas), passées en '+R.views.conf+' en '+H+' séances : '+Math.round(100*hit/np)+' %',
      tpi.includes(R.views.pist+' '+P(avg(c.pist))+' ('+np+' cas')&&tpi.includes('depuis '+R.measure_streak+' séances ou plus '+P(avg(c.long))+' ('+c.long.length+' cas')&&tpi.includes(H+' séances : '+Math.round(100*hit/np)+' % ('+np+' cas)'),
      tpi.slice(tpi.indexOf('Repère'),tpi.indexOf('Repère')+300)); }
  // ancien fichier sans séries « b » (part des actions > 1) : colonne « — », aucun critère de largeur, pas d'erreur
  const O=boot({},{after:'INDUSTRIES.industries.forEach(x=>delete x.b);INDUSTRIES.sectors.forEach(x=>delete x.b);'}); tab(O); view(O,'tv'); rv(O,'all');
  ok('ancien fichier sans part des actions : colonne « — », tableau rendu',/<th class="rtn">Industrie/.test(O.$('rrgTab')._h)&&trs(O).length>0&&trs(O).every(t=>cl(t.h,'rtb')==='—'),trs(O).length);
  // volume relatif (B : une industrie sur deux à ×1,5, les autres à ×0,7) : colonne Vol. seulement, aucun critère n'en dépend
  B.L.rrgNav.click({target:{closest:()=>({dataset:{up:'sec',sec:''}})}}); rv(B,'all'); rall(B);
  const EB=exp(m2), TB=trs(B);
  ok('avec volume : colonne « ×1,50 / ×0,70 », lignes = recalcul sans le volume',TB.every(t=>/^×(1,50|0,70)$/.test(cl(t.h,'rvol')))&&TB.map(name).join('|')===EB.all.map(r=>r.k).join('|'),TB.slice(0,4).map(t=>cl(t.h,'rvol')).join(' '));
}
// frise temporelle : survol souris = aperçu (cases, carte) ; clic = « Stats du » ; doigt : glisser = aperçu, lever = « Stats du »
const C=boot({}); tab(C); view(C,'tv');
C.$('friseCv').getBoundingClientRect=()=>({left:0,top:0,width:900,height:56});
// frise = bande des phases seule depuis le 27/10/2026 : elle commence à la première séance qui a une phase (séances Stockbee publiées)
const sbD=new Set(C.sb.STOCKBEE.rows.map(r=>r[0])), i0=Math.max(0,IND.dates.findIndex(d=>sbD.has(d))), at=f=>IND.dates[Math.round(i0+(f*900-4)/(900-8)*(N-1-i0))];
C.L.friseCv.pointermove({pointerType:'mouse',clientX:0.5*900,clientY:20});
const dh=at(0.5);
ok('frise : survol = aperçu à la séance survolée (cases et carte), « Stats du » inchangé',/^Survol : /.test(C.$('secKpiNote')._t)&&C.$('dPick').value===C.$('dPick').max&&!(C.$('rrgWhat')._t||'').includes(' 19 oct.'),C.$('secKpiNote')._t+' | '+C.$('rrgWhat')._t);
C.L.friseCv.pointerleave({pointerType:'mouse'});
ok('frise : souris sortie = retour à la séance du classement',/^Séance du /.test(C.$('secKpiNote')._t),C.$('secKpiNote')._t);
C.L.friseCv.click({pointerType:'mouse',clientX:0.5*900,clientY:20});
ok('frise : clic = la séance devient celle de « Stats du »',C.$('dPick').value===dh,C.$('dPick').value+' / '+dh);
C.L.friseCv.pointerdown({pointerType:'touch',pointerId:3,clientX:0.3*900,clientY:20});
C.L.friseCv.pointermove({pointerType:'touch',pointerId:3,clientX:0.25*900,clientY:20});
ok('frise au doigt : glisser = aperçu, « Stats du » inchangé pendant le geste',/^Survol : /.test(C.$('secKpiNote')._t)&&C.$('dPick').value===dh);
C.L.friseCv.pointerup({pointerType:'touch',pointerId:3,clientX:0.25*900,clientY:20});
ok('frise au doigt : lever = « Stats du » à la séance relâchée',C.$('dPick').value===at(0.25),C.$('dPick').value+' / '+at(0.25));
// tickers saisis : leurs secteurs en avant ; pastille = descente jusqu'à l'industrie (actions) ; fil et ‹ pour remonter
const TK=A.sb.TICKERS, tc=Object.fromEntries(TK.cols.map((c,i)=>[c,i])), tkr=TK.rows.find(r=>r[tc.kept]&&IND.industries.some(i=>i.k===TK.inds[r[tc.ind]][0]&&i.n>=min));
const sym=tkr[tc.s], [indName,secIx]=TK.inds[tkr[tc.ind]], secName=TK.secs[secIx], secLab=(CFG.sector_fr||{})[secName]||secName;
const lsT={'mm.rrgtk':sym+', ZZZZQ','mm.secview':'tv','mm.rrg':'1'}, Dd=boot(lsT); tab(Dd);
const chipsH=strip(Dd.$('rrgChips')._h);
ok('tickers : pastille « '+sym+' → secteur › industrie », ticker inconnu signalé',chipsH.includes(sym+' → '+secLab+' › '+indName)&&/ZZZZQ \?/.test(chipsH),chipsH);
ok('tickers : leur secteur mis en avant sur la carte',strip(Dd.$('rrgInfo')._h).startsWith('En avant : '+secLab),strip(Dd.$('rrgInfo')._h).slice(0,80));
Dd.L.rrgChips.click({target:{closest:s=>s==='[data-tkgo]'?{dataset:{tkgo:sym}}:null}});
const fI=IND.industries.find(i=>i.k===indName).f, scr=Dd.document.body.children.find(c=>c.src&&c.src.includes(fI+'.js'));
if(scr){vm.runInContext(fs.readFileSync(scr.src.split('?')[0],'utf8'),Dd.sb);scr.onload();}
const navH=strip(Dd.$('rrgNav')._h);
ok('pastille : la carte descend jusqu\'aux actions de l\'industrie (fil Secteurs › secteur › industrie, ‹)',/^‹ Secteurs › /.test(navH)&&navH.endsWith('› '+indName)&&/actions · /.test(Dd.$('rrgWhat')._t),navH);
ok('niveau actions : le ticker lui-même en avant',strip(Dd.$('rrgInfo')._h).startsWith('En avant : '+sym),strip(Dd.$('rrgInfo')._h).slice(0,60));
Dd.L.rrgNav.click({target:{closest:()=>({dataset:{up:'ind',sec:secName}})}});
ok('‹ : retour aux industries du secteur, l\'industrie du ticker en avant',/industries · /.test(Dd.$('rrgWhat')._t)&&strip(Dd.$('rrgInfo')._h).startsWith('En avant : '+indName),Dd.$('rrgWhat')._t);
Dd.L.rrgNav.click({target:{closest:()=>({dataset:{up:'sec',sec:secName}})}});
ok('fil « Secteurs » : retour aux secteurs',/· secteurs · /.test(Dd.$('rrgWhat')._t));
Dd.L.rrgChips.click({target:{closest:s=>s==='[data-tkclear]'?{dataset:{tkclear:'1'}}:null}});
ok('✕ : tickers effacés et mémorisation vidée',lsT['mm.rrgtk']===''&&strip(Dd.$('rrgChips')._h)==='');
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
