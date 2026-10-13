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
for(const f of ['stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const strip=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const reset=()=>{for(const k of Object.keys(rects))delete rects[k];};
const PL=8,PW=900-8-64,RIGHT=PL+PW;
// derniere bougie dessinee et part d'espace libre a droite (sur le canvas des prix, barres de volume = rects alpha)
function stats(label){
  const r=(rects.price||[]).filter(x=>x[3]>0&&x[3]<20);
  const maxX=Math.max(...r.map(x=>x[1]+x[3]/2)), minX=Math.min(...r.map(x=>x[1]));
  console.log(label.padEnd(26),'|',strip($('sub')._h),'| bougies x:',minX.toFixed(0),'->',maxX.toFixed(0),'| vide a droite:',(100*(RIGHT-maxX)/PW).toFixed(0)+'%');
}
console.log('plage du graphique :',PL,'->',RIGHT);
stats('defaut (6M)');
const cv='price',ev=(x,dY,dX=0,ctrl=true)=>({clientX:x,clientY:50,pageX:x,pageY:50,deltaY:dY,deltaX:dX,deltaMode:0,ctrlKey:ctrl,preventDefault(){}});   // Ctrl + molette = zoom
reset();L[cv].wheel(ev(600,-300,0,false));stats('molette seule (defile la page)');
reset();L[cv].wheel(ev(600,-300));stats('zoom avant (curseur x=600)');
reset();L[cv].wheel(ev(600,-300));stats('zoom avant encore');
reset();L[cv].wheel(ev(400,+900));stats('dezoom');
reset();L[cv].pointerdown({clientX:500,pointerId:1});L[cv].pointermove({clientX:700,clientY:50,pageX:700,pageY:50});L[cv].pointerup({});stats('glisse 200 px vers la droite');
reset();L[cv].pointerdown({clientX:500,pointerId:1});L[cv].pointermove({clientX:100,clientY:50,pageX:100,pageY:50});L[cv].pointerup({});stats('glisse 400 px vers la gauche');
reset();L[cv].dblclick();stats('double-clic (retour 6M)');
// boutons
reset();L.zIn.click();stats('bouton +');
reset();L.zOut.click();L.zOut.click();stats('bouton - x2');
// vue manuelle conservee en changeant d'instrument (BTC trade le week-end)
// plages
const r1=$('ranges').children; console.log('boutons plage:',r1.map(b=>b.textContent+(b.className?'*':'')).join(' '));
reset();r1[0]._c();stats('plage 3M'); reset();r1[4]._c();stats('plage Tout');
// survol dans l'espace vide : pas d'infobulle
reset();L.price.pointermove({clientX:830,clientY:50,pageX:830,pageY:50});
const tip=document.body.children[document.body.children.length-1];
console.log('survol espace vide -> infobulle:',tip.style.display);
