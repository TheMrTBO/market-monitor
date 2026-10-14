// Suivis post-market : sauvegarde dans le stockage privé (jeu postmarket_watch, format git_csv) via l'API Git de GitHub (faux
// GitHub en mémoire). Contrat de format : le site écrit exactement tests/fixtures/postmarket_watch_2026-10.csv (relu à l'octet
// près par mm/store dans tests/test_store_private.py). Fusion par version la plus récente, traces de retrait, un commit atomique,
// reprise après conflit, jeton refusé sans perte locale, fichier distant non conforme jamais écrasé, import de fichier.
let EXT={};
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const SS={};
function boot(ls,pm,status){
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
  Object.assign(sb,EXT);sb.window=sb;vm.createContext(sb);
  for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(pm)sb.POSTMARKET=JSON.parse(JSON.stringify(pm));
  sb.STATUS=status||{updated:'2026-10-13T22:17:00+00:00',pm:'2026-10-13T22:17:00+00:00',sources:{}};sb.location={search:''};sb.clearTimeout=()=>{};sb.sessionStorage={getItem:k=>SS[k]??null,setItem:(k,v)=>{SS[k]=v;},removeItem:k=>{delete SS[k];}};
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}


let bad=0; const ok=(label,cond,extra)=>{ if(!cond)bad++; console.log((cond?'ok    ':'Error ')+label+(extra!==undefined?' : '+extra:'')); };
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const COLS=['t','s','n','sec','ind','c','ch','pc','pch','pv','rv','cap','flt','er','nx','ng'];
const row=(s,pch,pv,er,nx)=>['NASDAQ:'+s,s,s+' Inc.','Finance','Banks',10,1.5,+(10*(1+pch/100)).toFixed(2),pch,pv,1.2,2e9,5e7,er||'',nx??null,nx==null?null:0.5];
const dates=[];for(let i=0;i<70;i++){const d=new Date(Date.UTC(2026,6,1)+i*86400000);if(d.getUTCDay()%6)dates.push(d.toISOString().slice(0,10));}
const cut=dates.indexOf('2026-08-27')+1, D=dates.slice(0,cut);
const bars=n=>[0].concat(D.map((d,i)=>{const c=10+Math.sin(i/5)*n;return [c-0.2,c+0.4,c-0.5,c,100000+i];}));
const PM={cols:COLS,filters:{price:3,vol:100000,chg:4},
  snaps:[{d:'2026-08-26',at:'2026-08-27T00:15:00+00:00',closed:true,nextd:'2026-08-27',rows:[row('OLD',9,500000,'',6.2)]},
         {d:'2026-08-27',at:'2026-08-27T22:17:00+00:00',closed:false,rows:[row('BBB',5,2000000),row('AAA',12,900000,'amc'),row('CCC',-7,300000,'bmo'),row('DDD',-30,150000)]}],
  hist:{dates:D,bars:{AAA:bars(1),BBB:bars(2),CCC:bars(1.5)}}};
const heads=A=>[...A.$('pmHead')._h.matchAll(/data-k="([^"]+)"/g)].map(m=>m[1]);
const syms=A=>[...A.$('pmRows')._h.matchAll(/<tr data-s="([^"]+)"/g)].map(m=>m[1]);
const go=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}});

const tick=()=>new Promise(r=>setTimeout(r,30));
const FIX=fs.readFileSync('tests/fixtures/postmarket_watch_2026-10.csv','utf8');
const HEADER=FIX.split('\n')[0];
function fakeGit(files){                                  // files : { chemin: texte } ; une branche main
  const G={files:{...files},head:'c0',commits:0,calls:[],fail:{},msgs:[]};
  let n=0; const sha=t=>'b'+Buffer.from(t).toString('base64').slice(0,12)+(n++);
  G.blobs={}; G.tree=()=>Object.entries(G.files).map(([path,t])=>{const s=sha(t);G.blobs[s]=t;return {path,type:'blob',sha:s};});
  G.fetch=async(url,o={})=>{
    const m=o.method||'GET', p=url.replace('https://api.github.com/repos/moi/mes-suivis',''); G.calls.push(m+' '+url+' '+((o.headers||{}).Authorization||''));
    const res=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
    if(G.fail.status){const st=G.fail.status;G.fail={};return res(st,{});}
    if(m==='GET'&&p==='/git/ref/heads/main')return res(200,{object:{sha:G.head}});
    if(m==='GET'&&p.startsWith('/git/commits/'))return res(200,{tree:{sha:'t-'+G.head}});
    if(m==='GET'&&p.startsWith('/git/trees/'))return res(200,{truncated:false,tree:G.tree().concat([{path:'README.md',type:'blob',sha:'r'}])});
    if(m==='GET'&&p.startsWith('/git/blobs/'))return res(200,{content:Buffer.from(G.blobs[p.split('/').pop()]).toString('base64')});
    if(m==='POST'&&p==='/git/trees'){const b=JSON.parse(o.body);G.pending={base:b.base_tree,entries:b.tree};return res(201,{sha:'nt'});}
    if(m==='POST'&&p==='/git/commits'){const b=JSON.parse(o.body);G.pendingParent=b.parents[0];G.pendingMsg=b.message;return res(201,{sha:'nc'});}
    if(m==='PATCH'&&p==='/git/refs/heads/main'){
      if(G.fail.race){G.fail={};G.files['postmarket_watch/2026/2026-10.csv']=G.raceFile;G.head='c-autre';return res(422,{});}
      if(G.pendingParent!==G.head||JSON.parse(o.body).force!==false)return res(422,{});
      for(const e of G.pending.entries)G.files[e.path]=e.content; G.commits++; G.head='c'+G.commits; G.msgs.push(G.pendingMsg); return res(200,{});
    }
    if(m==='GET'&&p==='')return res(200,{private:true});
    return res(404,{});
  };
  return G;
}
const W=ls=>JSON.parse(ls['perso.suivis']||'{"items":{}}').items;
const cfg={'perso.sync.repo':'moi/mes-suivis','perso.sync.token':'github_pat_'+'x'.repeat(30)};
const FIXITEMS={v:1,items:{
  'AEHL|2026-10-13':{s:'AEHL',d:'2026-10-13',tag:'piege',note:'+150 %, sans news "à vérifier"',at:'2026-10-14T09:52:59.279Z',up:'2026-10-14T09:52:59.312Z',n:'Antelope Enterprise Holdings Limited Class A',c:8.55,pc:21.45,pch:150.88},
  'BRK.B|2026-10-02':{s:'BRK.B',d:'2026-10-02',tag:'setup',note:'',at:'2026-10-02T21:00:00.000Z',up:'2026-10-02T21:00:00.000Z',n:'Berkshire Hathaway Inc. Class B',c:500,pc:505,pch:1},
  'LQDA|2026-10-13':{s:'LQDA',d:'2026-10-13',tag:'suivre',note:'',at:'2026-10-14T09:52:59.274Z',up:'2026-10-14T09:52:59.274Z',n:'Liquidia Corporation',c:26.81,pc:38.2,pch:42.48},
  'XYZ|2026-10-01':{s:'XYZ',d:'2026-10-01',del:true,up:'2026-10-14T10:00:00.000Z'}}};

(async()=>{
  // 1) contrat de format : dépôt vide de suivis → le site écrit exactement le fichier de référence (un seul commit)
  let ls={...cfg,'perso.suivis':JSON.stringify(FIXITEMS)}, G=fakeGit({}); EXT={fetch:G.fetch,TextEncoder,TextDecoder,btoa,atob};
  let A=boot(ls,PM); A.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}}); await tick();
  ok('format : fichier écrit = fichier de référence (lu à l\'identique par mm/store)', G.files['postmarket_watch/2026/2026-10.csv']===FIX, JSON.stringify(G.files['postmarket_watch/2026/2026-10.csv']));
  ok('un seul commit, message de la config', G.commits===1 && G.msgs[0]==='Suivis post-market : 3 suivis', G.msgs.join());
  ok('jeton envoyé seulement à api.github.com', G.calls.every(c=>/^[A-Z]+ https:\/\/api\.github\.com\/repos\/moi\/mes-suivis/.test(c) && /Bearer github_pat_/.test(c)));
  await A.L.syncNow.click(); await tick();
  ok('rien de neuf : aucun commit', G.commits===1);

  // 2) fusion avec un autre appareil : la version la plus récente gagne, retraits respectés, partitions par mois
  const autre=HEADER+'\n'+[
    'AEHL,2026-10-13,piege,ancienne note,false,2026-10-14T09:52:59.279Z,2026-10-14T08:00:00.000Z,Antelope,8.55,21.45,150.88',
    'LQDA,2026-10-13,,,true,,2026-10-15T08:00:00.000Z,,,,',
    'XYZ,2026-10-01,setup,revenu,false,2026-10-01T22:00:00.000Z,2026-10-13T00:00:00.000Z,XYZ Corp,5.0,6.0,20.0'].join('\n')+'\n';
  const sept=HEADER+'\nOLD,2026-09-30,suivre,,false,2026-09-30T22:00:00.000Z,2026-09-30T22:00:00.000Z,Old Inc.,10.0,11.0,10.0\n';
  ls={...cfg,'perso.suivis':JSON.stringify(FIXITEMS)}; G=fakeGit({'postmarket_watch/2026/2026-10.csv':autre,'postmarket_watch/2026/2026-09.csv':sept}); EXT={fetch:G.fetch,TextEncoder,TextDecoder,btoa,atob};
  A=boot(ls,PM); A.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}}); await tick();
  ok('fusion : ma note plus récente gagne', W(ls)['AEHL|2026-10-13'].note==='+150 %, sans news "à vérifier"');
  ok('fusion : retrait plus récent d\'un autre appareil appliqué ici', W(ls)['LQDA|2026-10-13'].del===true);
  ok('fusion : mon retrait plus récent gagne (pas de réapparition)', W(ls)['XYZ|2026-10-01'].del===true && /\nXYZ,2026-10-01,,,true,/.test(G.files['postmarket_watch/2026/2026-10.csv']));
  ok('fusion : suivi d\'un autre mois récupéré, sa partition inchangée', W(ls)['OLD|2026-09-30'] && G.files['postmarket_watch/2026/2026-09.csv']===sept);
  ok('fusion : un commit, seule la partition modifiée', G.commits===1);

  // 3) conflit : un autre appareil écrit pendant la sauvegarde → relecture, refusion, puis commit
  A.L.pmRows.click({target:{closest:sel=>sel==='.tagb'?{dataset:{k:'BBB'}}:null}});
  G.raceFile=G.files['postmarket_watch/2026/2026-10.csv'].replace('\n','\nZZZ,2026-10-05,setup,,false,2026-10-05T22:00:00.000Z,2026-10-20T00:00:00.000Z,Zed,1.0,2.0,100.0\n');
  G.fail.race=true; await A.L.syncNow.click(); await tick();
  ok('conflit : rien de perdu (mon ajout et celui de l\'autre appareil)', G.commits===2 && /\nZZZ,2026-10-05,/.test(G.files['postmarket_watch/2026/2026-10.csv']) && W(ls)['ZZZ|2026-10-05'] && G.files['postmarket_watch/2026/2026-08.csv'] && /\nBBB,2026-08-27,suivre/.test(G.files['postmarket_watch/2026/2026-08.csv']), Object.keys(G.files).join());

  // 4) jeton refusé : message clair, rien de perdu localement, puis reprise
  G.fail={status:401}; A.L.pmRows.click({target:{closest:sel=>sel==='.tagb'?{dataset:{k:'BBB'}}:null}});
  await A.L.syncNow.click(); await tick();
  ok('jeton refusé : message', /jeton refusé/.test(A.$('syncMsg')._t), A.$('syncMsg')._t);
  ok('jeton refusé : retrait gardé sur l\'appareil', W(ls)['BBB|2026-08-27'].del===true);
  await A.L.syncNow.click(); await tick();
  ok('reprise : le retrait part au dépôt', /\nBBB,2026-08-27,,,true,/.test(G.files['postmarket_watch/2026/2026-08.csv']));

  // 5) fichier distant non conforme : erreur, jamais écrasé
  const c0=G.commits;
  G.files['postmarket_watch/2026/2026-10.csv']='symbol,autre\nA,b\n'; await A.L.syncNow.click(); await tick();
  ok('en-tête différent : signalé, pas réécrit', /illisible \(en-tête différent du modèle\)/.test(A.$('syncMsg')._t) && G.commits===c0, A.$('syncMsg')._t);
  G.files['postmarket_watch/2026/2026-10.csv']=HEADER+'\nAAA,2026-10-01,suivre,,peut-être,,2026-10-01T00:00:00Z,,,,\n'; await A.L.syncNow.click(); await tick();
  ok('valeur non conforme : signalée, pas réécrit', /illisible \(deleted\)/.test(A.$('syncMsg')._t) && G.commits===c0, A.$('syncMsg')._t);
  G.files['postmarket_watch/2026/2026-10.csv']=HEADER+'\nAAA,2026-09-01,suivre,,false,,2026-10-01T00:00:00Z,,,,\n'; await A.L.syncNow.click(); await tick();
  ok('ligne dans la mauvaise partition : signalée, pas réécrit', /non conforme/.test(A.$('syncMsg')._t) && G.commits===c0, A.$('syncMsg')._t);

  // 6) dépôt vide (sans README) : message utile
  ls={...cfg}; G=fakeGit({}); G.fail={status:409}; EXT={fetch:G.fetch,TextEncoder,TextDecoder,btoa,atob};
  A=boot(ls,PM); await tick();                            // synchronisation au chargement : la 1re lecture répond « dépôt vide »
  ok('dépôt vide : conseil README', /Add a README file/.test(A.$('syncMsg')._t), A.$('syncMsg')._t);

  // 7) import d'une sauvegarde fichier : fusion, entrées invalides ignorées
  const B_ls={}; EXT={}; const B=boot(B_ls,PM);
  await B.L.wImport.change({target:{value:'x',files:[{text:async()=>JSON.stringify({v:1,items:{'ZZZ|2026-07-01':{s:'ZZZ',d:'2026-07-01',tag:'suivre',note:'',at:'2026-07-01T22:00:00.000Z',up:'2026-07-01T22:00:00.000Z',n:'Z',c:1,pc:2,pch:100},'BAD|x':{s:'BAD'}}})}]}});
  ok('import : suivi ajouté, entrée invalide ignorée', W(B_ls)['ZZZ|2026-07-01'] && !W(B_ls)['BAD|x'] && /1 suivis \(1 nouveaux\)/.test(B.$('syncMsg')._t), B.$('syncMsg')._t);
  ok('sans dépôt réglé : statut « que dans ce navigateur »', /que dans ce navigateur/.test((boot({},PM)).$('syncMsg')._t));

  console.log(bad?`${bad} échec(s)`:'tout est bon'); process.exit(bad?1:0);
})();
