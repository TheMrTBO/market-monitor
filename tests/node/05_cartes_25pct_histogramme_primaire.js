const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const drawn={};
const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='fillRect'?()=>{drawn[id]=(drawn[id]||0)+1;}:()=>{},set:()=>true});
const els={},L={};
// un canvas est "visible" (largeur > 0) sauf s'il est dans un bloc replie
const parentRaw={hist:'raw4',net25m:'raw25m',net25:'raw25'};
const mkEl=id=>({id,children:[],style:{},classList:{add(){},remove(){},toggle(){}},className:'',_h:'',dataset:{},hidden:false,value:'',
 set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
 setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [mkEl('a'),mkEl('b')];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
 parentElement:{getBoundingClientRect:()=>({left:0,top:0})},
 get clientWidth(){const r=parentRaw[id];return r&&els[r]&&els[r].hidden?0:900;},clientHeight:200,offsetWidth:100,
 getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:200,width:900,height:200}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
const $=id=>els[id]||(els[id]=mkEl(id));
['raw4','raw25m','raw25'].forEach(r=>$(r).hidden=true);
const discs=[['raw4'],['raw25m'],['raw25']].map(([t])=>{const b=mkEl('disc-'+t);b.dataset.target=t;b._t='▸ Détail : x';return b;});
const ls={};
const document={getElementById:$,createElement:()=>mkEl('n'),querySelector:()=>mkEl('w'),body:mkEl('body'),documentElement:{scrollWidth:1200},
  querySelectorAll:s=>s==='.disc'?discs:[],addEventListener(){}};
const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
  requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},getComputedStyle:()=>({getPropertyValue:()=>'#000'}),setTimeout,console};
sb.window=sb;vm.createContext(sb);
for(const f of ['stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const reset=()=>{for(const k of Object.keys(drawn))delete drawn[k];};
const show=l=>console.log(l.padEnd(34),'| +4% net4:',drawn.net4||0,'hist:',drawn.hist||0,'| +25%/mois hist25m:',drawn.hist25m||0,'net25m:',drawn.net25m||0,'| +25%/trim hist2:',drawn.hist2||0,'net25:',drawn.net25||0);
reset();L.rightPad.input({target:{value:'15'}});show('etat initial');
reset();L['disc-raw25m'].click();show('detail mois ouvert (solde net)');
reset();L['disc-raw25'].click();show('detail trimestre ouvert (solde net)');
reset();L['disc-raw4'].click();show('detail +4% ouvert (histogramme brut)');
console.log('textes des boutons :',discs.map(b=>b._t).join(' | '));
