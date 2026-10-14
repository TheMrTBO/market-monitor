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
  for(const f of ['config_data.js','stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}
const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const ls={};
let A=boot(ls);
A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
const heads=()=>[...A.$('secHead')._h.matchAll(/<th[^>]*data-c="([^"]+)"[^>]*>(.*?)<\/th>/g)].map(m=>m[1]+':'+strip(m[2]));
const firstRow=()=>{const m=A.$('secRows')._h.match(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/);return {s:m[1],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))};};
console.log('1. colonnes :',heads().join(' | '));
console.log('   pas de colonne avg :',!heads().some(h=>/avgC7/.test(h)),'| libelle ecart :',heads().find(h=>h.startsWith('dev')));
console.log('   1re ligne :',firstRow().cells.join(' | '));
// --- glisser-deposer d'une colonne : delta -> avant rang
const th=(c,x)=>({closest:()=>({dataset:{c},getBoundingClientRect:()=>({left:100,width:100}),classList:{add(){},remove(){}}}),_x:x});
A.L.secHead.dragstart({target:th('delta').closest?th('delta'):null,dataTransfer:{setData(){}}});
A.L.secHead.drop({target:th('rank'),clientX:110,preventDefault(){}});
console.log('2. apres glisser Δ rang avant Rang :',heads().join(' | '));
console.log('   memorise mm.seccols =',ls['mm.seccols']);
console.log('   1re ligne :',firstRow().cells.join(' | '));
// deplacer 'grp' apres 'dev' ; une colonne retiree ('nm') glissee est ignoree
A.L.secHead.dragstart({target:th('grp'),dataTransfer:{setData(){}}});
A.L.secHead.drop({target:th('dev'),clientX:190,preventDefault(){}});
A.L.secHead.dragstart({target:th('nm'),dataTransfer:{setData(){}}});
A.L.secHead.drop({target:th('rank'),clientX:190,preventDefault(){}});
console.log('   puis Groupe apres Ecart (Nom ignore) :',heads().map(h=>h.split(':')[0]).join(' > '));
// rechargement : ordre restaure
const B=boot(ls);B.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
console.log('   rechargement :',[...B.$('secHead')._h.matchAll(/data-c="([^"]+)"/g)].map(m=>m[1]).join(' > '));
// tri par ecart
A.L.secHead.click({target:{closest:()=>({dataset:{k:'dev',c:'dev'}})}});
console.log('3. tri ecart : fleche',heads().find(h=>h.startsWith('dev')),'| 1er',firstRow().s);
// --- graphique : mecaniques du graphique principal
const cv='secCanvas',ev=(x,dY)=>({clientX:x,clientY:100,pageX:x,pageY:100,deltaY:dY,deltaX:0,deltaMode:0,preventDefault(){}});
const bodies=()=>(A.R[cv]||[]).filter(r=>r[3]>0&&r[3]<20&&(r[0]==='#f6e24b'||r[0]==='#cf5148')).length/2;
const lastX=()=>{const r=(A.R[cv]||[]).filter(r=>r[3]>0&&r[3]<20&&(r[0]==='#f6e24b'||r[0]==='#cf5148'));return Math.max(...r.map(x=>x[1]+x[3]/2));};
const reset=()=>{A.R[cv]=[];A.Sx[cv]={};A.M[cv]=[];};
const state=l=>console.log(('4. '+l).padEnd(36),'| barres',Math.round(bodies()/(1)),'| derniere barre x =',lastX().toFixed(0),'| espace droit',$p(),'%');
const $p=()=>A.$('rightPadSOut')._t.replace(' %','');
reset();A.L.ranges;
A.$('ranges').children[1]._c();   // preset 6M
reset();A.L.secRows.click({target:{closest:()=>({dataset:{s:'XLE'}})}});
console.log('   graphique',A.$('secTitle')._t,'|',strip(A.$('secInfo')._h));
console.log('   curseurs : droite',A.$('rightPadS').value,'% | haut',A.$('topPadS').value,'%');
state('6M (preset)');
reset();A.L[cv].wheel(ev(600,-600));state('molette zoom avant');
reset();A.L[cv].wheel(ev(600,+1500));state('molette dezoom');
reset();A.L[cv].pointerdown({clientX:500,pointerId:1});A.L[cv].pointermove({clientX:700,clientY:100,pageX:700,pageY:100});A.L[cv].pointerup({});state('glisse 200 px (passe)');
reset();A.L[cv].dblclick();state('double-clic (6M)');
// curseurs
reset();A.L.rightPadS.input({target:{value:'40'}});state('curseur droite 40');
reset();A.L.topPadS.input({target:{value:'30'}});
const topY=Math.min(...(A.M[cv]||[]).filter(m=>m[0]>20&&m[0]<830&&m[1]<480).map(m=>m[1]));
console.log('   curseur haut 30 : plus haut a y =',topY.toFixed(1),'(attendu',(8+0.30*(500-8-22)).toFixed(1)+' si MM masquees ; sinon MM peuvent depasser)');
// poignees
reset();A.L.rightPadS.input({target:{value:'15'}});
const hx=lastX();
A.L[cv].pointerdown({clientX:hx,clientY:500-22+6,pointerId:1});A.L[cv].pointermove({clientX:hx-150,clientY:500-22+6,pageX:hx-150,pageY:500});A.L[cv].pointerup({});
console.log('   poignee ▲ tiree de 150 px : espace droit =',$p(),'%  (memorise',ls['mm.pad']+')');
A.L[cv].pointerdown({clientX:9,clientY:8+0.30*(500-8-22),pointerId:1});A.L[cv].pointermove({clientX:9,clientY:200,pageX:9,pageY:200});A.L[cv].pointerup({});
console.log('   poignee ▶ tiree a y=200 : haut =',A.$('topPadS').value,'% (memorise',ls['mm.top']+')');
