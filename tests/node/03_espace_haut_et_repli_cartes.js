const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
let cur='';const rects={},moves={};
const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='fillRect'?(x,y,w,h)=>{(rects[id]=rects[id]||[]).push([cur,x,y,w,h]);}:k==='moveTo'?(x,y)=>{(moves[id]=moves[id]||[]).push([x,y]);}:()=>{},set:(t,k,v)=>{if(k==='fillStyle')cur=v;return true;}});
const els={},L={};
const mkEl=id=>({id,children:[],style:{},classList:{add(){},remove(){},toggle(){}},className:'',_h:'',dataset:{},hidden:false,value:'',
 set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
 setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [mkEl('a'),mkEl('b'),mkEl('c')];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
 parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:200,offsetWidth:100,
 getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:200,width:900,height:200}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
const $=id=>els[id]||(els[id]=mkEl(id));
const body=mkEl('cbody'),car=mkEl('car'),head=mkEl('chead');head.dataset.key='c4';head.nextElementSibling=body;head.closest=()=>({querySelector:()=>body});head.querySelector=()=>car;
const ls={};
const document={getElementById:$,createElement:()=>mkEl('n'),querySelector:()=>mkEl('w'),body:mkEl('body'),documentElement:{scrollWidth:1200},
  querySelectorAll:s=>s==='.chead'?[head]:[],addEventListener(){}};
const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
  requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},getComputedStyle:()=>({getPropertyValue:()=>'#000'}),setTimeout,console};
sb.window=sb;vm.createContext(sb);
for(const f of ['stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const PT=8,PH=200-8-22;
for(const i of [0,1,2,3]) L.maBar.click({target:{closest:q=>q==='.nm'?{dataset:{i:String(i)}}:null}});   // masque les MM : seules les bougies restent
const topY=()=>{const m=(moves.price||[]).filter(x=>x[0]>64.5&&x[0]<892&&x[1]<190);return Math.min(...m.map(x=>x[1]));};
const reset=()=>{for(const k of Object.keys(rects))delete rects[k];for(const k of Object.keys(moves))delete moves[k];};
const show=l=>console.log(l.padEnd(32),'| curseur haut:',$('topPad').value,$('topPadOut')._t,'| plus haut cours a y =',topY().toFixed(1),'(attendu',(PT+ +$('topPad').value/100*PH).toFixed(1)+')');
reset();L.rightPad.input({target:{value:'15'}});show('defaut');
for(const v of [30,0,60]){reset();L.topPad.input({target:{value:String(v)}});show('curseur haut -> '+v);}
console.log('memorise mm.top =',ls['mm.top']);
// poignee ▶ (axe des prix a gauche) : en bas de la plage, tirer de 100 px vers le bas
reset();L.topPad.input({target:{value:'6'}});
const hy=PT+0.06*PH;
L.price.pointerdown({clientX:9,clientY:hy,pointerId:1});
reset();L.price.pointermove({clientX:9,clientY:100,pageX:9,pageY:100});
show('poignee ▶ tiree a y=100');L.price.pointerup({});
console.log('memorise mm.top =',ls['mm.top']);
// repli de la carte +4 %
console.log('--- carte +4 % : repli');
console.log('avant : hidden =',body.hidden,'| resume =',$('sum4')._t);
L.chead&&0; (L['chead']||{}).click&&L['chead'].click();
console.log('apres clic : hidden =',body.hidden,'| fleche =',car._t,'| memorise =',ls['mm.card.c4']);
console.log('resume +25 %/mois :',$('sum25m')._t);
console.log('resume +25 %/trim :',$('sum25q')._t);
(L['chead']||{}).click&&L['chead'].click();
console.log('re-ouvert : hidden =',body.hidden,'| fleche =',car._t,'| memorise =',ls['mm.card.c4']);
