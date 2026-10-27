const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function boot(ls){
  // antérieur à la refonte du 27/10/2026 : vue ETF par défaut, bascule unique vers TradingView déjà faite (nouveau comportement : test 23)
  if(!('mm.secrefonte' in ls))ls['mm.secrefonte']='1';
  if(!('mm.secview' in ls))ls['mm.secview']='etf';
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
  sb.innerHeight=900;sb.pageYOffset=0;sb.window=sb;vm.createContext(sb);
  for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}

const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ls={};
const A=boot(ls);
// rectangles de position differentes pour la liste et le canvas
const rectOf={secScroll:{top:180},secCanvas:{top:120}};
for(const [id,r] of Object.entries(rectOf)){const el=A.$(id);el.getBoundingClientRect=()=>({left:0,top:r.top,right:900,bottom:r.top+400,width:900,height:400});}
A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
console.log('liste  : hauteur =',A.$('secScroll').style.height,'(attendu',900-180-14+'px)');
console.log('graph. : hauteur =',A.$('secCanvas').style.height,'(attendu',900-120-14-200-8-6+'px : carte du score 200 px par defaut + 8 px d\'ecart)');
// redimensionnement de la fenetre
A.sb.innerHeight=700;
A.L.tabs.click({target:{closest:()=>({dataset:{tab:'main'}})}});A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
console.log('fenetre 700 px : liste =',A.$('secScroll').style.height,'| graph. =',A.$('secCanvas').style.height);
// plus de lignes avgC7 / avgC65, ni dans le dessin ni dans la legende
A.Sx.secCanvas={};A.L.secRows.click({target:{closest:()=>({dataset:{s:'XLK'}})}});
const st=A.Sx.secCanvas||{};
console.log('traits blanc (#ffffff) / cyan (#22d3ee) :',st['#ffffff']||0,'/',st['#22d3ee']||0,'| couleurs tracees :',Object.keys(st).join(' '));
console.log('legende :',strip(A.$('secTrend')._h));
// infobulle
A.L.secCanvas.pointermove({clientX:400,clientY:100,pageX:400,pageY:100});
const tip=A.document.body.children[A.document.body.children.length-1];
console.log('infobulle :',strip(tip.innerHTML));
