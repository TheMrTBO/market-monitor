const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('stockbee_dashboard.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
let fill='',stroke='';const fills={},strokes={},bg={};
const mkCtx=id=>new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):
  k==='fillRect'?(x,y,w,h)=>{(fills[id]=fills[id]||{})[fill]=(fills[id][fill]||0)+1; if(x===0&&y===0&&w>100)bg[id]=fill;}:
  k==='stroke'?()=>{(strokes[id]=strokes[id]||{})[stroke]=(strokes[id][stroke]||0)+1;}:()=>{},
  set:(t,k,v)=>{if(k==='fillStyle')fill=v;if(k==='strokeStyle')stroke=v;return true;}});
const els={},L={};let seq=0;
const mkEl=id=>{const kids={};return {id,children:[],style:{},classList:{add(){},remove(){},toggle(){}},className:'',_h:'',dataset:{},hidden:false,value:'',
 set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},appendChild(c){this.children.push(c);return c;},addEventListener(e,f){(L[id]=L[id]||{})[e]=f;},
 setAttribute(){},querySelector(sel){return kids[sel]||(kids[sel]=els[id+'>'+sel]=mkEl(id+'>'+sel));},
 querySelectorAll(){return [mkEl('a'),mkEl('b')];},getContext(){return mkCtx(id);},setPointerCapture(){},contains:()=>false,
 parentElement:{getBoundingClientRect:()=>({left:0,top:0})},clientWidth:900,clientHeight:300,offsetWidth:100,
 getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:300,width:900,height:300}),set textContent(v){this._t=v;},get textContent(){return this._t;},set onclick(f){this._c=f;}};};
const $=id=>els[id]||(els[id]=mkEl(id));
const ls={};
const document={getElementById:$,createElement:()=>mkEl('card'+(++seq)),querySelector:()=>mkEl('w'),body:mkEl('body'),documentElement:{scrollWidth:1200},querySelectorAll:()=>[],addEventListener(){}};
const vars={'--cbg':'#000000','--cgrid':'#1c1c1c','--cref':'#444444','--ctext':'#9aa0a6','--ccross':'#d6d6d6','--cup':'#f6e24b','--cdown':'#cf5148','--up':'#2a78d6','--down':'#e34948','--panel':'#ffffff','--muted':'#667085','--grid':'#e6e9ef','--axis':'#c3c2b7','--t2108':'#d4537e'};
const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
  requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},getComputedStyle:()=>({getPropertyValue:k=>vars[k]||'#000'}),setTimeout,clearTimeout,console};
sb.window=sb;vm.createContext(sb);
for(const f of ['stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const assert=require('assert');
// Onglet SA : titres sans « Daily », variation depuis le début de la période, T2108 en ligne (pas de bougie inventée),
// mode Base 100 (3 courbes, mémorisé), clic = séance figée partagée avec MM (barre « Stats du »).
L.tabs.click({target:{closest:()=>({dataset:{tab:'cmp'}})}});
// cartes créées par createElement : QQQ, IWM, BTC (titre .perf) puis T2108 et VIX, dans cet ordre
const perfs=Object.keys(els).filter(k=>/^card\d+>\.perf$/.test(k)).sort((a,b)=>parseInt(a.slice(4))-parseInt(b.slice(4)));
const q=perfs[0].replace('>.perf',''), t2='card'+(parseInt(q.slice(4))+3)+'>canvas';
assert(!/Daily<\/b>/.test(html),'titre « Daily » encore présent');
assert(/depuis le/.test($(q+'>.perf')._h),'variation sur la période absente du titre QQQ');
assert(/MM \d+[<>=]\d+/.test($(q+'>.px')._h),'constat MM absent du titre');
assert(/SMA 5[\s\S]*SMA 200/.test($(q+'>.mabar')._h),'légende des MM absente du graphique QQQ (comme MM)');
assert((strokes[t2]||{})['#d4537e']>0,'T2108 non tracé en ligne');
assert(!((fills[t2]||{})['#f6e24b']||(fills[t2]||{})['#cf5148']),'T2108 encore en bougies');
const last=$('dPick').value;
L.cmpMode.click({target:{closest:()=>({dataset:{m:'b100'}})}});
assert.strictEqual(ls['mm.cmpmode'],'b100','mode Base 100 non mémorisé');
for(const c of ['#199e70','#d95926','#9085e9'])assert((strokes.b100cv||{})[c]>0,'courbe Base 100 manquante : '+c);
assert(/QQQ/.test($('b100leg')._h)&&/IWM/.test($('b100leg')._h)&&/BTC/.test($('b100leg')._h),'légende Base 100 incomplète');
L.b100cv.pointerdown({clientX:300,clientY:100,pageX:300,pageY:100,pointerId:1,pointerType:'mouse'});
L.b100cv.pointerup({type:'pointerup',clientX:300,clientY:100,pageX:300,pageY:100,pointerType:'mouse'});
const pin=$('dPick').value;
assert(pin&&pin<last,'clic sur le graphique : séance non figée ('+pin+' / '+last+')');
assert(/depuis le .*→/.test($('b100px')._t||''),'période Base 100 absente');
L.tabs.click({target:{closest:()=>({dataset:{tab:'main'}})}});
assert.strictEqual($('dPick').value,pin,'séance figée non partagée avec MM');
console.log('ok : séance figée',pin,'| légende',$('b100leg')._h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
