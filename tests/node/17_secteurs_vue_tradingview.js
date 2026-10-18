// Onglet Secteurs, vue TradingView : bascule ETF / TradingView, secteurs -> industries -> actions classés par TI65,
// fil d'Ariane, chargement du fichier d'une industrie à l'ouverture, fiche action (lien Finviz), mémorisation, rangs.
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
  for(const f of (opts.files||["config_data.js","stockbee_data.js","prices_data.js","vix_data.js","sectors_data.js","industries_data.js"]))vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}

const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const heads=A=>[...A.$('secHead')._h.matchAll(/<th[^>]*data-c="([^"]+)"[^>]*>(.*?)<\/th>/g)].map(m=>m[1]);
const rows=A=>[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1].replace(/&amp;/g,'&'),h:m[2],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))}));
const crumbs=A=>[...A.$('secFilt')._h.matchAll(/<button data-lvl="(\d)"[^>]*>(.*?)<\/button>/g)].map(m=>strip(m[2]));
const tab=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const view=(A,v)=>A.L.secView.click({target:{closest:()=>({dataset:{v},disabled:false})}});
const open=(A,s)=>A.L.secRows.click({target:{closest:sel=>sel==='[data-open]'?{dataset:{open:s}}:null}});
const up=(A,lvl)=>A.L.secFilt.click({target:{closest:()=>({dataset:{lvl:String(lvl)}})}});
const sc=(c,e)=>{if(e<64)return null;let s7=0,s65=0;for(let i=e-64;i<=e;i++){if(c[i]==null)return null;s65+=c[i];if(i>e-7)s7+=c[i];}return s7/7/(s65/65);};
const order=(items,dates,minN)=>items.filter(x=>minN==null||x.n>=minN).map(x=>[x.k||x[0],sc(x.c||x[3],dates.length-1)]).filter(x=>x[1]!=null).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)).map(x=>x[0]);

const ls={};
let A=boot(ls);
const IND=A.sb.INDUSTRIES, CFG=A.sb.MM_CONFIG;
tab(A);
ok('vue ETF par défaut (55 lignes)',rows(A).length===A.sb.SECTORS.symbols.length,rows(A).length);
ok('titre : nom de l\'indicateur depuis la config',A.$('secTiName')._t===CFG.ti65.name&&A.$('secScoreName')._t==='Score '+CFG.ti65.name,A.$('secTiName')._t);
ok('bascule : ETF et TradingView, ETF actif',/data-v="etf" class="on"/.test(A.$('secView')._h)&&/data-v="tv"/.test(A.$('secView')._h)&&!/disabled/.test(A.$('secView')._h));

// 1) niveau secteurs (traces du graphique remises à zéro : la vue ETF a dessiné des bougies)
A.R.secCanvas=[];A.Sx.secCanvas={};
view(A,'tv');
const r1=rows(A), exp1=order(IND.sectors,IND.dates,CFG.industries.min_members);
ok('TradingView : un rang par secteur classable',r1.filter(r=>r.cells[0]!=='—').length===exp1.length,exp1.length+' secteurs');
ok('ordre des secteurs = TI65 recalculé',r1.slice(0,exp1.length).map(r=>r.s).join('|')===exp1.join('|'),r1.slice(0,3).map(r=>r.s).join(', '));
ok('colonnes du niveau secteurs',heads(A).join(',')==='rank,sym,cnt,brd,dev,delta',heads(A).join(','));
ok('colonne › (ouvrir) en dernier',/<th class="c-open"/.test(A.$('secHead')._h)&&/data-open="/.test(r1[0].h));
ok('secteur traduit ; sous-titre (mobile) : nom TradingView et % > 1 ; nom au survol',r1[0].cells[1]===(CFG.sector_fr[r1[0].s]||r1[0].s)+' '+r1[0].s+' · '+r1[0].cells[3]+' > 1'&&r1[0].h.includes('title="'+r1[0].s+'"'),r1[0].cells[1]);
const s0=IND.sectors.find(s=>s.k===r1[0].s);
ok('% > 1 = valeur du fichier à la dernière séance',r1[0].cells[3]===(Math.round(s0.b[s0.b.length-1])+' %').replace('.',','),r1[0].cells[3]);
ok('fil d\'Ariane : Secteurs seul',crumbs(A).join(' > ')==='Secteurs '+IND.sectors.length,crumbs(A).join(' > '));
ok('méta : secteurs classés',/secteurs classés/.test(A.$('secMeta')._t),A.$('secMeta')._t);
ok('fiche : titre, info, bouton Industries',/Secteur TradingView · indice équipondéré de \d+ actions/.test(A.$('secInfo')._t)&&A.$('secOpen').hidden===false&&/^Industries \(\d+\) ›$/.test(A.$('secOpen')._t),A.$('secInfo')._t+' | '+A.$('secOpen')._t);
const bodies=(A.R.secCanvas||[]).filter(r=>r[3]>0&&r[3]<20&&(r[0]==='#f6e24b'||r[0]==='#cf5148')).length;
ok('graphique : courbe (gris clair du graphique), pas de bougies',bodies===0&&(A.Sx.secCanvas||{})['#d6d6d6']>0,bodies+' corps de bougie');

// 2) niveau industries du secteur ouvert
const S=IND.sectors.find(s=>IND.industries.some(i=>i.sec===s.k&&i.n<CFG.industries.few_members)&&IND.industries.filter(i=>i.sec===s.k).length>=4).k;
open(A,S);
const inds=IND.industries.filter(i=>i.sec===S), r2=rows(A), exp2=order(inds,IND.dates,CFG.industries.min_members);
ok('ouvrir un secteur : ses industries seulement',r2.length===inds.length&&r2.every(r=>inds.some(i=>i.k===r.s)),S+' : '+r2.length+' industries');
ok('ordre des industries = TI65 recalculé',r2.slice(0,exp2.length).map(r=>r.s).join('|')===exp2.join('|'));
ok('colonnes du niveau industries',heads(A).join(',')==='rank,sym,cnt,brd,dev,delta',heads(A).join(','));
ok('fil d\'Ariane : Secteurs › secteur',crumbs(A).length===2&&crumbs(A)[1].startsWith(CFG.sector_fr[S]||S),crumbs(A).join(' › '));
ok('chemin mémorisé',ls['mm.tvpath']===JSON.stringify([S]),ls['mm.tvpath']);
const few=r2.find(r=>{const i=inds.find(x=>x.k===r.s);return i.n>=CFG.industries.min_members&&i.n<CFG.industries.few_members;});
ok('industrie de 3-4 titres : classée, étiquette « peu »',!few||(few.cells[0]!=='—'&&/peu/.test(few.cells[2])),few?few.s+' : '+few.cells[2]:'aucune');
const tiny=r2.find(r=>inds.find(x=>x.k===r.s).n<CFG.industries.min_members);
ok('industrie de moins de 3 titres : sans rang, étiquette',!tiny||(tiny.cells[0]==='—'&&/< 3 titres/.test(tiny.cells[4].replace('&lt;','<'))),tiny?tiny.s+' : '+tiny.cells[4]:'aucune');

// 3) niveau actions : chargement du fichier de l'industrie à l'ouverture
const I=inds.filter(i=>i.n>=5).sort((a,b)=>b.n-a.n)[0];
open(A,I.k);
const script=A.document.body.children.find(c=>c.src&&c.src.includes(I.f));
ok('ouvrir une industrie : chargement du fichier',!!script&&script.src===CFG.industries.folder+'/'+I.f+'.js'&&/Chargement des actions/.test(A.$('secRows')._h),script&&script.src);
vm.runInContext(fs.readFileSync(script.src,'utf8'),A.sb); script.onload();
const F=A.sb.TV_STOCKS[I.f], r3=rows(A), exp3=order(F.rows,F.dates);
ok('actions de l\'industrie, autant que de titres retenus',r3.length===I.n&&F.rows.length===I.n,r3.length+' actions');
ok('ordre des actions = TI65 recalculé',r3.slice(0,exp3.length).map(r=>r.s).join('|')===exp3.join('|'),r3.slice(0,3).map(r=>r.s).join(', '));
ok('colonnes du niveau actions (pas de ›)',heads(A).join(',')==='rank,sym,grp,cap,dev,delta'&&!/data-open=/.test(A.$('secRows')._h),heads(A).join(','));
ok('fil d\'Ariane : 3 niveaux',crumbs(A).length===3&&crumbs(A)[2].startsWith(I.k.replace(/&/g,'&amp;'))||crumbs(A)[2].startsWith(I.k),crumbs(A).join(' › '));
ok('fiche action : industrie, capitalisation, lien Finviz',/capitalisation/.test(A.$('secInfo')._h)&&/finviz\.com\/quote\.ashx\?t=/.test(A.$('secInfo')._h)&&A.$('secOpen').hidden===true,strip(A.$('secInfo')._h));
ok('méta : actions classées',/actions classées/.test(A.$('secMeta')._t),A.$('secMeta')._t);

// 4) remonter par le fil d'Ariane : l'industrie quittée reste sélectionnée
up(A,1);
ok('remonter aux industries, industrie quittée sélectionnée',rows(A).length===inds.length&&/<tr data-s="[^"]*" class="sel/.test(A.$('secRows')._h)&&[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)" class="sel/g)][0][1].replace(/&amp;/g,'&')===I.k);
// 5) rechargement : vue, chemin et ordre de colonnes restaurés
open(A,I.k);
const B=boot(ls); tab(B);
const sB=B.document.body.children.find(c=>c.src&&c.src.includes(I.f));
ok('rechargement : vue TradingView et industrie restaurées (fichier redemandé)',!!sB&&/data-v="tv" class="on"/.test(B.$('secView')._h));
// 6) retour aux ETF : sélection et colonnes des ETF intactes
view(A,'etf');
ok('retour ETF : 55 lignes, colonnes ETF',rows(A).length===A.sb.SECTORS.symbols.length&&heads(A).join(',')==='rank,sym,grp,dev,delta',heads(A).join(','));
// 7) sans industries_data.js : bascule désactivée, ETF inchangés
const C=boot({'mm.secview':'tv'},{files:['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js']}); tab(C);
ok('sans fichier TradingView : bascule désactivée, vue ETF',/data-v="tv"[^>]*disabled/.test(C.$('secView')._h)&&rows(C).length===C.sb.SECTORS.symbols.length);
if(bad) console.log('Error : '+bad+' contrôle(s) en échec');
