// Suivis post-market : sauvegarde dans un dépôt GitHub privé (faux GitHub) — fusion par version la plus récente,
// traces de retrait, reprise après conflit, jeton refusé sans perte locale, entrées invalides ignorées, import de fichier.
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
const b64=o=>Buffer.from(o&&o.raw!==undefined?o.raw:JSON.stringify(o)).toString('base64'), unb64=t=>JSON.parse(Buffer.from(t,'base64').toString());
function fakeGitHub(file){
  const G={file,sha:file?'s1':null,puts:0,gets:0,fail:{},calls:[]};
  G.fetch=async(url,o={})=>{
    const m=o.method||'GET'; G.calls.push(m+' '+url+' '+((o.headers||{}).Authorization||''));
    const res=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
    if(G.fail.status){const st=G.fail.status;if(!G.fail.keep)G.fail={};return res(st,{});}
    if(/\/contents\//.test(url)){
      if(m==='GET'){G.gets++;return G.file?res(200,{sha:G.sha,content:b64(G.file)}):res(404,{});}
      const b=JSON.parse(o.body);
      if(G.fail.put409){G.fail.put409=false;return res(409,{});}
      if((b.sha||null)!==G.sha)return res(409,{});
      G.puts++;G.file=unb64(b.content);G.sha='s'+(G.puts+1);G.msg=b.message;return res(200,{});
    }
    return res(200,{private:true});
  };
  return G;
}
const it=(s,d,up,extra)=>({s,d,up,tag:'suivre',note:'',at:up,n:s+' Inc.',c:10,pc:11,pch:10,...extra});
const W=ls=>JSON.parse(ls['perso.suivis']||'{"items":{}}').items;
const cfg={'perso.sync.repo':'moi/mes-suivis','perso.sync.token':'github_pat_'+'x'.repeat(30)};

(async()=>{
  // 1) première synchronisation au chargement : fusion local + distant
  const remote={v:1,items:{
    'AAA|2026-08-27':it('AAA','2026-08-27','2026-08-27T22:00:00.000Z',{note:'ancienne note'}),
    'OLD|2026-08-26':{s:'OLD',d:'2026-08-26',del:true,up:'2026-08-28T08:00:00.000Z'},
    'CCC|2026-08-27':it('CCC','2026-08-27','2026-08-27T23:00:00.000Z',{tag:'setup'}),
    'BAD|2026-08-27':{s:'<img onerror=x>',d:'2026-08-27',up:'2026-08-27T23:00:00.000Z',tag:'suivre'}}};
  const ls={...cfg,'perso.suivis':JSON.stringify({v:1,items:{
    'AAA|2026-08-27':it('AAA','2026-08-27','2026-08-28T07:00:00.000Z',{note:'note récente'}),
    'OLD|2026-08-26':it('OLD','2026-08-26','2026-08-26T22:30:00.000Z')}})};
  const G=fakeGitHub(remote); EXT={fetch:G.fetch,TextEncoder,TextDecoder,btoa,atob};
  let A=boot(ls,PM); A.L.tabs.click({target:{closest:()=>({dataset:{tab:'pm'}})}}); await tick();
  ok('jeton envoyé seulement à api.github.com', G.calls.length>0 && G.calls.every(c=>/ https:\/\/api\.github\.com\/repos\/moi\/mes-suivis/.test(' '+c.split(' ').slice(1).join(' ')) && /Bearer github_pat_/.test(c)), G.calls.join(' | '));
  ok('fusion : la note la plus récente gagne', G.file && G.file.items['AAA|2026-08-27'].note==='note récente', JSON.stringify(G.file&&G.file.items['AAA|2026-08-27']));
  ok('fusion : le retrait distant plus récent gagne (pas de réapparition)', G.file.items['OLD|2026-08-26'].del===true && W(ls)['OLD|2026-08-26'].del===true);
  ok('fusion : suivi d\'un autre appareil récupéré', W(ls)['CCC|2026-08-27'] && W(ls)['CCC|2026-08-27'].tag==='setup');
  ok('entrée invalide ignorée (ni locale ni distante)', !W(ls)['BAD|2026-08-27'] && !G.file.items['BAD|2026-08-27']);
  ok('un seul enregistrement, message de la config', G.puts===1 && /^Suivis post-market : 2 suivis$/.test(G.msg), G.puts+' '+G.msg);
  ok('statut : synchronisé', /Synchronisé avec moi\/mes-suivis/.test(A.$('syncMsg')._t), A.$('syncMsg')._t);

  // 2) rien de neuf : relecture sans réécriture
  await A.L.syncNow.click(); await tick();
  ok('rien de neuf : pas de nouvel enregistrement', G.puts===1, G.puts);

  // 3) conflit (un autre appareil a écrit entre-temps) : on relit et on recommence
  A.L.pmRows.click({target:{closest:sel=>sel==='.tagb'?{dataset:{k:'BBB'}}:null}});
  G.fail.put409=true; await A.L.syncNow.click(); await tick();
  ok('conflit : reprise puis enregistrement', G.puts===2 && G.file.items['BBB|2026-08-27'] && G.file.items['BBB|2026-08-27'].tag==='suivre', G.puts);

  // 4) jeton refusé : message clair, suivis locaux intacts
  const avant=ls['perso.suivis']; G.fail={status:401};
  A.L.pmRows.click({target:{closest:sel=>sel==='.tagb'?{dataset:{k:'AAA'}}:null}});   // retrait local de AAA
  await A.L.syncNow.click(); await tick();
  ok('jeton refusé : message', /jeton refusé/.test(A.$('syncMsg')._t), A.$('syncMsg')._t);
  ok('jeton refusé : retrait gardé sur l\'appareil', W(ls)['AAA|2026-08-27'].del===true && ls['perso.suivis']!==avant);
  G.fail={}; await A.L.syncNow.click(); await tick();
  ok('jeton réparé : le retrait part au dépôt', G.file.items['AAA|2026-08-27'].del===true);

  // 5) fichier distant illisible : erreur, rien d'écrasé
  const putsAvant=G.puts;
  G.file={raw:'pas du json'}; await A.L.syncNow.click(); await tick();
  ok('fichier distant illisible : signalé, pas réécrit', /illisible/.test(A.$('syncMsg')._t) && G.puts===putsAvant, A.$('syncMsg')._t);
  G.file={v:2,autre:true}; await A.L.syncNow.click(); await tick();
  ok('fichier distant d\'un autre format : signalé, pas réécrit', /autre format/.test(A.$('syncMsg')._t) && G.puts===putsAvant && G.file.v===2, A.$('syncMsg')._t);

  // 6) import d'une sauvegarde : fusion sans écrasement
  const B_ls={}; EXT={}; const B=boot(B_ls,PM);
  await B.L.wImport.change({target:{value:'x',files:[{text:async()=>JSON.stringify({v:1,items:{'ZZZ|2026-07-01':it('ZZZ','2026-07-01','2026-07-01T22:00:00.000Z'),'BAD|x':{s:'BAD'}}})}]}});
  ok('import : suivi ajouté, entrée invalide ignorée', W(B_ls)['ZZZ|2026-07-01'] && !W(B_ls)['BAD|x'] && /1 suivis \(1 nouveaux\)/.test(B.$('syncMsg')._t), B.$('syncMsg')._t);
  ok('sans dépôt réglé : statut « que dans ce navigateur »', /que dans ce navigateur/.test((boot({},PM)).$('syncMsg')._t));

  console.log(bad?`${bad} échec(s)`:'tout est bon'); process.exit(bad?1:0);
})();
