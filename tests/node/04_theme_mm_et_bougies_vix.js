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
const vars={'--cbg':'#000000','--cgrid':'#1c1c1c','--cref':'#444444','--ctext':'#9aa0a6','--ccross':'#d6d6d6','--cup':'#f6e24b','--cdown':'#cf5148','--up':'#2a78d6','--down':'#e34948','--panel':'#ffffff','--muted':'#667085','--grid':'#e6e9ef','--axis':'#c3c2b7'};
const sb={document,devicePixelRatio:1,matchMedia:()=>({addEventListener(){}}),ResizeObserver:class{observe(){}},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}},
  requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame(){},addEventListener(){},getComputedStyle:()=>({getPropertyValue:k=>vars[k]||'#000'}),setTimeout,console};
sb.window=sb;vm.createContext(sb);
for(const f of ['stockbee_data.js','prices_data.js','vix_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
vm.runInContext(main,sb);
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
console.log('barre des MM :',strip($('maBar')._h));
console.log('legende fond :',strip($('trendLegend')._h));
const maHex={5:'#f4a0c0',10:'#f5a623',20:'#5b7cfa',50:'#9a9a9a',100:'#7dbb5a',200:'#e8574f'};
// couleurs des 6 lignes de MM dessinees sur le graphique de prix principal
const used=strokes.price||{};
console.log('lignes MM dessinees :',Object.entries(maHex).map(([n,c])=>`SMA ${n}:${used[c]?'oui':'NON'}`).join(' '));
console.log('couleurs des MM dans la barre :',(($('maBar')._h.match(/background:(#[0-9a-f]{6})/gi))||[]).map(x=>x.slice(11)).join(' '));
console.log('fond du graphique prix :',bg.price,'| bougies jaunes/rouges :',(fills.price||{})['#f6e24b']||0,'/',(fills.price||{})['#cf5148']||0);
console.log('histogramme net (reste bleu/rouge) :',(fills.net4||{})['#2a78d6']||0,'/',(fills.net4||{})['#e34948']||0,'| fond net4 :',bg.net4||'(transparent)');
// onglet cmp
L.tabs.click({target:{closest:()=>({dataset:{tab:'cmp'}})}});
const cm=Object.keys(els).filter(k=>/^card\d+>canvas$/.test(k));
console.log('cmp fonds :',cm.map(k=>bg[k]).join(' '),'| bougies jaunes/rouges colonne 1 :',(fills[cm[0]]||{})['#f6e24b']||0,'/',(fills[cm[0]]||{})['#cf5148']||0);
console.log('cmp MM 5 et 100 dessinees :',!!(strokes[cm[0]]||{})['#f4a0c0'],!!(strokes[cm[0]]||{})['#7dbb5a']);
console.log('boites T2108 / VIX : fond',bg[cm[3]],bg[cm[4]],'| bougies jaunes/rouges VIX',(fills[cm[4]]||{})['#f6e24b']||0,'/',(fills[cm[4]]||{})['#cf5148']||0);
// valeurs SMA 5 / 100 / 10 / 20 de la derniere seance QQQ
L.tabs.click({target:{closest:()=>({dataset:{tab:'main'}})}});
const P=sb.PRICES.QQQ,c=P.map(b=>b[4]),last=c.length-1,sma=n=>c.slice(last-n+1).reduce((a,b)=>a+b)/n;
L.price.pointermove({clientX:700,clientY:60,pageX:700,pageY:60});
const tip=document.body.children[document.body.children.length-1];
console.log('infobulle :',strip(tip.innerHTML).slice(0,330));
console.log('attendu',P[last][0],':',[5,10,20,50,100,200].map(n=>`SMA ${n} ${sma(n).toFixed(2).replace('.',',')}`).join(' · '));
