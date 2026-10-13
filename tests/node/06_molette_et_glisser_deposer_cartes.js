const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
function run(ls){
  const L={},els={};let drawn={};
  const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='fillRect'?()=>{drawn[id]=(drawn[id]||0)+1;}:()=>{},set:()=>true});
  const mkEl=(id,extra={})=>Object.assign({id,children:[],style:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},toggle(){}},className:'',_h:'',dataset:{},hidden:false,value:'',
    set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
    setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [mkEl('a'),mkEl('b')];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,focus(){},
    parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:200,offsetWidth:100,
    getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:200,width:900,height:200}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}},extra);
  const $=id=>els[id]||(els[id]=mkEl(id));
  // --- groupe de cartes factice avec ordre DOM reel
  const cards=['c4','c25m','c25q'].map((k,i)=>{const c=mkEl('card-'+k,{dataset:{card:k},draggable:false,
      getBoundingClientRect:()=>({top:100+i*300,height:250,left:0,width:900})});
    c.grip=mkEl('grip-'+k,{});c.querySelector=s=>s==='.grip'?c.grip:mkEl('q');return c;});
  const g={children:cards.slice(),
    querySelectorAll:s=>s==='.hcard'?g.children:[],
    querySelector:s=>{const m=s.match(/data-card="(.+)"/);return m?g.children.find(c=>c.dataset.card===m[1])||null:null;},
    appendChild(c){g.children=g.children.filter(x=>x!==c);g.children.push(c);return c;},
    insertBefore(c,ref){g.children=g.children.filter(x=>x!==c);const i=ref?g.children.indexOf(ref):g.children.length;g.children.splice(i<0?g.children.length:i,0,c);return c;}};
  cards.forEach(c=>{Object.defineProperty(c,'previousElementSibling',{get:()=>g.children[g.children.indexOf(c)-1]||null});
                    Object.defineProperty(c,'nextElementSibling',{get:()=>g.children[g.children.indexOf(c)+1]||null});});
  els.hgroup=g;
  const document={getElementById:$,createElement:()=>mkEl('n'),querySelector:()=>mkEl('w'),body:mkEl('body'),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],addEventListener(){}};
  const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
    requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},getComputedStyle:()=>({getPropertyValue:()=>'#000'}),setTimeout,console};
  sb.window=sb;vm.createContext(sb);
  for(const f of ['stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  vm.runInContext(main,sb);
  return {L,els,g,cards,ls,sb,document,drawn:()=>drawn,$};
}
const order=g=>g.children.map(c=>c.dataset.card).join(' > ');
const ls={};
let A=run(ls);
console.log('ordre initial           :',order(A.g));
// --- molette : seulement sur le graphique de prix
const has=id=>!!(A.L[id]&&A.L[id].wheel);
console.log('molette zoom  price:',has('price'),'| hist:',has('hist'),'| net4:',has('net4'),'| hist25m:',has('hist25m'),'| net25m:',has('net25m'),'| hist2:',has('hist2'),'| net25:',has('net25'));
// --- glisser-deposer : c4 vers le bas, sous c25q
const c4=A.cards[0],c25q=A.cards[2];
A.L['grip-c4'].mousedown({});
console.log('poignee saisie -> draggable :',c4.draggable);
A.L['card-c4'].dragstart({dataTransfer:{setData(){}}});
A.L['card-c25q'].dragover({clientY:100+2*300+200,preventDefault(){}});     // moitie basse de c25q : on passe apres
console.log('apres survol bas c25q    :',order(A.g));
A.L['card-c4'].dragend({});
console.log('apres depot (memorise)   :',order(A.g),'| mm.order =',ls['mm.order'],'| draggable =',c4.draggable);
// --- clavier : Alt+↑ sur c4 (derniere place) -> remonte d'un cran
A.L['grip-c4'].keydown({altKey:true,key:'ArrowUp',preventDefault(){}});
console.log('Alt+↑ sur c4             :',order(A.g),'| mm.order =',ls['mm.order']);
// --- rechargement : l'ordre est restaure
const B=run(ls);
console.log('apres rechargement       :',order(B.g));
// --- survol milieu haut : placer avant
A.L['card-c25m'].dragstart({}); 
