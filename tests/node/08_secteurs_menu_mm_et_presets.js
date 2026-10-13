const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(ls){
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
  for(const f of ['stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}

const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ls={};
const A=boot(ls);
A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const cv='secCanvas';
const ev=(x,dY)=>({clientX:x,clientY:100,pageX:x,pageY:100,deltaY:dY,deltaX:0,deltaMode:0,ctrlKey:true,preventDefault(){}});   // Ctrl + molette = zoom
const sel=s=>A.L.secRows.click({target:{closest:()=>({dataset:{s}})}});
sel('SMH');
console.log('barre MM (secteurs) :',strip(A.$('secMa')._h));
console.log('legende             :',strip(A.$('secTrend')._h));
// --- menu d'une MM depuis l'onglet secteurs : s'ouvre dans menuSec (visible dans cet onglet)
A.L.secMa.click({target:{closest:s=>s==='.car'?{dataset:{i:'2'},getBoundingClientRect:()=>({left:50,top:10,right:80,bottom:30})}:null}});
console.log('menu secteurs ouvert :',!A.$('menuSec').hidden,'| menu principal ouvert :',!A.$('menu').hidden,'|',strip(A.$('menuSec')._h).slice(0,48));
// changer la longueur de la MM 3 (SMA 20 -> 15) + type EMA
A.L.menuSec.input({target:{dataset:{f:'len'},value:'15'}});
A.L.menuSec.input({target:{dataset:{f:'type'},value:'EMA'}});
console.log('apres modif :',strip(A.$('secMa')._h));
console.log('legende fond :',strip(A.$('secTrend')._h).slice(0,40),'| memorise',JSON.parse(ls['mm.mas'])[2]);
// --- infobulle : valeurs verifiees de facon independante (EMA 15, SMA 50, avgC7/avgC65)
A.R[cv]=[];A.L[cv].pointermove({clientX:400,clientY:100,pageX:400,pageY:100});
const tip=A.document.body.children[A.document.body.children.length-1];
const t0=strip(tip.innerHTML);console.log('infobulle :',t0.slice(0,400));
const MO={'janv.':1,'févr.':2,'mars':3,'avr.':4,'mai':5,'juin':6,'juil.':7,'août':8,'sept.':9,'oct.':10,'nov.':11,'déc.':12};
const m=t0.match(/(\d+) (\S+) (\d{4})/);const iso=`${m[3]}-${String(MO[m[2]]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
const S_=A.sb.SECTORS,x=S_.symbols.find(s=>s.s==='SMH');
const idx=[];S_.dates.forEach((d,i)=>{if(x.c[i]!=null)idx.push(i);});const cl=idx.map(i=>x.c[i]);
const k=idx.findIndex(i=>S_.dates[i]===iso);
const sma=n=>cl.slice(k-n+1,k+1).reduce((a,b)=>a+b)/n;
let ema=cl.slice(0,15).reduce((a,b)=>a+b)/15;for(let i=15;i<=k;i++)ema+=(cl[i]-ema)*2/16;
const f=v=>v.toFixed(2).replace('.',',');
console.log('attendu',iso,': EMA 15',f(ema),'| SMA 50',f(sma(50)),'| avgC7',f(sma(7)),'| avgC65',f(sma(65)),'| ratio',(sma(7)/sma(65)).toFixed(3).replace('.',','));
// --- fond de tendance retire du graphique des secteurs (demande utilisateur)
const bg=(A.R[cv]||[]).filter(r=>String(r[0]).startsWith('rgba')).length;
console.log('fond de tendance absent (attendu true) :',bg===0);
// --- boutons de l'en-tete agissent sur le graphique des secteurs
const before=A.$('rightPadSOut')._t;
A.R[cv]=[];A.$('ranges').children[0]._c();   // 3M
const bars=()=>{const r=(A.R[cv]||[]);const lastBg=r.map((q,i)=>q[0]==='#000000'?i:-1).filter(i=>i>=0).pop();return r.slice(lastBg+1).filter(q=>['#f6e24b','#cf5148'].includes(q[0])&&q[3]>0&&q[3]<20).length/2;};
console.log('preset 3M : barres',bars());
A.R[cv]=[];A.$('ranges').children[2]._c();console.log('preset 1A : barres',bars());
A.R[cv]=[];A.L.zIn.click();console.log('bouton + : barres',bars());
A.R[cv]=[];A.L.zOut.click();A.L.zOut.click();console.log('bouton - x2 : barres',bars());
// --- changer d'ETF conserve le preset ; zoom manuel conserve les memes dates
A.$('ranges').children[1]._c();sel('XLK');console.log('XLK en 6M :',bars()?'ok':'?',strip(A.$('secTitle')._t));
A.R[cv]=[];A.L[cv].wheel(ev(500,-500));const nZoom=bars();sel('IGV');A.R[cv]=[];A.L[cv].pointermove({clientX:10,clientY:100,pageX:10,pageY:100});
console.log('zoom manuel puis autre ETF : barres',nZoom,'->',bars(),'(meme fenetre de dates, plage nulle)');
// --- onglet principal intact
A.L.tabs.click({target:{closest:()=>({dataset:{tab:'main'}})}});
console.log('retour onglet principal : view-main hidden =',A.$('view-main').hidden,'| sub =',strip(A.$('sub')._h));
