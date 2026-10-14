const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
let cur='';const rects={};
const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='fillRect'?(x,y,w,h)=>{(rects[id]=rects[id]||[]).push([cur,x,y,w,h]);}:()=>{},set:(t,k,v)=>{if(k==='fillStyle')cur=v;return true;}});
const els={},L={};
const mkEl=id=>({id,children:[],style:{},classList:{add(){},remove(){},toggle(){}},className:'',_h:'',dataset:{},hidden:false,value:'',
 set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
 setAttribute(){},querySelector(){return mkEl('q');},querySelectorAll(){return [mkEl('a'),mkEl('b'),mkEl('c')];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
 parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:900,height:600})},
 clientWidth:900,clientHeight:200,offsetWidth:100,
 getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:200,width:900,height:200}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}});
const $=id=>els[id]||(els[id]=mkEl(id));
const docL={};
const document={getElementById:$,createElement:()=>mkEl('n'),querySelector:()=>mkEl('w'),body:mkEl('body'),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],
  addEventListener(e,f){docL[e]=f;}};
const ls={};
const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
  requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},getComputedStyle:()=>({getPropertyValue:k=>({'--s10':'#eda100','--s20':'#eb6834','--s50':'#6250d6','--s200':'#1baf7a'})[k]||'#000'}),setTimeout,console};
sb.window=sb;vm.createContext(sb);
for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const strip=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const reset=()=>{for(const k of Object.keys(rects))delete rects[k];};
const PL=64,PW=900-64-8,RIGHT=PL+PW;   // axe des prix a gauche (PAD.l = 64)
function vide(){const r=(rects.price||[]).filter(x=>x[3]>0&&x[3]<20);const maxX=Math.max(...r.map(x=>x[1]+x[3]/2));return (100*(RIGHT-maxX)/PW).toFixed(0)+'%';}
const state=l=>console.log(l.padEnd(34),'| curseur:',$('rightPad').value,strip($('rightPadOut')._h||$('rightPadOut')._t||'')||$('rightPadOut')._t,'| vide visuel:',vide(),'|',strip($('sub')._h));
console.log('barre :',strip($('instBtn')._t),'|',strip($('maBar')._h));
console.log('legende fond :',strip($('trendLegend')._h));
state('defaut');
// --- curseur d'espace a droite
for(const v of [40,0,60,15]){reset();$('rightPad').value=String(v);L.rightPad.input({target:{value:String(v)}});state('curseur -> '+v);}
console.log('memorise mm.pad =',ls['mm.pad']);
// --- poignee triangle
const N=sb.PRICES.QQQ.length;
function handleXpx(){ // meme formule que le code : x de la derniere barre
  return null;}
reset();
// la derniere barre est a ~ 85% de la plage : on cherche sa position dans le dessin
const last=(rects.price||[]);
L.price.pointermove({clientX:10,clientY:50,pageX:10,pageY:50}); // survol hors poignee
reset();L.price.pointerdown({clientX:10,clientY:190,pointerId:1});L.price.pointerup({});
// poignee : x derniere barre
const rr=[];(function(){const c=sb;})();
// on la localise en dessinant : derniere bougie = max x des petites barres
reset();L.rightPad.input({target:{value:'15'}});
const bars=(rects.price||[]).filter(x=>x[3]>0&&x[3]<20);const hx=Math.max(...bars.map(x=>x[1]+x[3]/2));
console.log('derniere barre x =',hx.toFixed(0));
reset();L.price.pointerdown({clientX:hx,clientY:190,pointerId:1});
L.price.pointermove({clientX:hx-200,clientY:190,pageX:hx-200,pageY:190});     // on tire vers la gauche = plus d'espace
state('poignee tiree 200 px a gauche');
L.price.pointerup({});console.log('memorise mm.pad =',ls['mm.pad']);
reset();L.price.pointerdown({clientX:hx-200,clientY:190,pointerId:1});
L.price.pointermove({clientX:hx+100,clientY:190,pageX:hx+100,pageY:190});     // vers la droite = marge a 0
state('poignee tiree a droite');
L.price.pointerup({});
// --- menu moyenne mobile 2 (SMA 20) : longueur 15 + EMA
const car={dataset:{i:'1'},getBoundingClientRect:()=>({left:100,top:10,right:140,bottom:30,width:40,height:20})};
L.maBar.click({target:{closest:s=>s==='.car'?car:null}});
console.log('menu ouvert :',strip($('menu')._h).slice(0,70),'| hidden:',$('menu').hidden);
L.menu.input({target:{dataset:{f:'len'},value:'15'}});
console.log('apres longueur 15 :',strip($('maBar')._h));
L.menu.input({target:{dataset:{f:'type'},value:'EMA'}});
console.log('apres type EMA    :',strip($('maBar')._h),'|',strip($('trendLegend')._h).slice(0,45));
L.menu.input({target:{dataset:{f:'color'},value:'#ff00ff'}});
console.log('couleur sauvegardee :',JSON.parse(ls['mm.mas'])[1]);
// verification EMA 15 de la derniere seance QQQ (amorcee par SMA, comme Pine)
const c=sb.PRICES.QQQ.map(b=>b[4]);let ema=c.slice(0,15).reduce((a,b)=>a+b)/15;for(let i=15;i<c.length;i++)ema+=(c[i]-ema)*2/16;
reset();L.rightPad.input({target:{value:'15'}});
const b2=(rects.price||[]).filter(x=>x[3]>0&&x[3]<20);const hx2=Math.max(...b2.map(x=>x[1]+x[3]/2));
L.price.pointermove({clientX:hx2,clientY:50,pageX:hx2,pageY:50});
const tip=document.body.children[document.body.children.length-1];
console.log('infobulle derniere seance :',strip(tip.innerHTML).slice(0,170));
console.log('EMA 15 attendue (indep.) :',ema.toFixed(2));
// --- masquer via le nom
L.maBar.click({target:{closest:s=>s==='.nm'?{dataset:{i:'3'}}:null}});
console.log('SMA 200 masquee :',JSON.parse(ls['mm.mas'])[3].on===false);
// --- menu instrument
L.instBtn.click();
console.log('menu instrument :',strip($('menu')._h));
L.menu.click({target:{closest:s=>s==='button.opt'?{dataset:{n:'BTC'}}:null}});
console.log('apres choix BTC :',strip($('instBtn')._t));
