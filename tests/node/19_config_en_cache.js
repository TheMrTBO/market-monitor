// Mise en ligne : page plus récente que sa config en cache (GitHub Pages, 10 min) → rechargement forcé une seule fois,
// puis message clair ; jamais de page cassée.
let PATCH=null;
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
  const document={getElementById:$,createElement:()=>mkEl('n'+(++seq)),querySelector:()=>$('wrap'),body:Object.assign(mkEl('body'),{dataset:{}}),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],
    addEventListener(e,f){(DL[e]=DL[e]||[]).push(f);}};
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},
    getComputedStyle:()=>({getPropertyValue:k=>({'--cup':'#f6e24b','--cdown':'#cf5148','--cbg':'#000000','--cgrid':'#1c1c1c','--ctext':'#9aa0a6','--ccross':'#d6d6d6'})[k]||'#000'}),setTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  if(PATCH)PATCH(sb);if(pm)sb.POSTMARKET=JSON.parse(JSON.stringify(pm));
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


// 1) config complète : pas de rechargement, drapeau effacé
SS['mm.cfgreload']='1'; let A=boot({},PM);
ok('config complète : page normale', A.sb.location.search==='' && !/fatal/.test(A.document.querySelector('.wrap')._h||'') && SS['mm.cfgreload']===undefined);
// 2) config ancienne (sans section private) : rechargement forcé une fois
PATCH=sb=>{delete sb.MM_CONFIG.private;}; A=boot({},PM);
ok('config ancienne : rechargement avec ?v=', /^\?v=\d+$/.test(A.sb.location.search) && SS['mm.cfgreload']==='1', A.sb.location.search);
// 3) toujours ancienne après le rechargement : message, pas de boucle
A=boot({},PM);
ok('toujours ancienne : pas de 2e rechargement', A.sb.location.search==='');
ok('toujours ancienne : message clair', /Mise en ligne en cours[\s\S]*private\.store/.test(A.document.querySelector('.wrap')._h), A.document.querySelector('.wrap')._h);
console.log(bad?`${bad} échec(s)`:'tout est bon'); process.exit(bad?1:0);
