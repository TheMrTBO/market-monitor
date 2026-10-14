const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
let cur='',curId='';const rects={};
const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='fillRect'?(x,y,w,h)=>{(rects[id]=rects[id]||[]).push([cur,x,y,w,h]);}:()=>{},set:(t,k,v)=>{if(k==='fillStyle')cur=v;return true;}});
const els={},L={};
const mkEl=id=>({id,children:[],style:{},classList:{add(){},remove(){},toggle(){}},className:'',_h:'',dataset:{},hidden:false,
 set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
 setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [mkEl('a'),mkEl('b'),mkEl('c')];},getContext(){return mkCtx(id);},setPointerCapture(){},
 get clientWidth(){return {hist:900,hist25m:900,hist2:900}[id]||900;},clientHeight:200,offsetWidth:100,value:'',contains:()=>false,parentElement:{getBoundingClientRect:()=>({left:0,top:0})},
 getBoundingClientRect:()=>({left:0,top:0,width:900,height:200}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
const $=id=>els[id]||(els[id]=mkEl(id));
const document={getElementById:$,createElement:()=>mkEl('n'),querySelector:()=>mkEl('w'),body:mkEl('body'),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],addEventListener(){}};
const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:()=>null,setItem(){}},
  requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},getComputedStyle:()=>({getPropertyValue:()=>'#000'}),setTimeout,console};
sb.addEventListener=()=>{};sb.window=sb;vm.createContext(sb);
for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const strip=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const reset=()=>{for(const k of Object.keys(rects))delete rects[k];};
const PL=8,PW=900-8-64,RIGHT=PL+PW;
// derniere bougie dessinee et part d'espace libre a droite (sur le canvas des prix, barres de volume = rects alpha)
// Mobile : appui prolongé = réticule qui suit le doigt (la fenêtre ne bouge pas), on lâche = dernière séance ;
// glisser sans appui prolongé = déplacement dans le temps.
const assert=require('assert');
const s4=()=>strip($('sum4')._h).split(' ·')[0], subt=()=>strip($('sub')._h);
const P=(t,x)=>L.price[t]({clientX:x,clientY:100,pageX:x,pageY:100,pointerId:3,pointerType:'touch',preventDefault(){}});
(async()=>{
  const w=ms=>new Promise(r=>setTimeout(r,ms));
  const d0=s4(), win0=subt();
  P('pointerdown',300); await w(200); assert.strictEqual(s4(),d0,'réticule avant 0,35 s');
  await w(250); const d1=s4(); assert.notStrictEqual(d1,d0,'pas de réticule après appui prolongé');
  P('pointermove',500); const d2=s4(); assert.notStrictEqual(d2,d1,'le réticule ne suit pas le doigt'); assert.strictEqual(subt(),win0,'la fenêtre a bougé pendant le réticule');
  P('pointerup',500); await w(50); assert.strictEqual(s4(),d0,'relâché : pas de retour à la dernière séance');
  P('pointerdown',300); P('pointermove',305); P('pointermove',450); P('pointerup',450); await w(50);
  assert.notStrictEqual(subt(),win0,'glisser horizontal sans appui : la fenêtre ne s\'est pas déplacée');
  console.log('ok : appui',d1,'| doigt',d2,'| relâché',s4(),'| glisser :',subt());
})().catch(e=>{console.log('Error',e.message);process.exit(1);});
