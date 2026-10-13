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
  for(const f of ['stockbee_data.js','prices_data.js','vix_data.js','sectors_data.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sb);
  vm.runInContext(main,sb);
  return {L,els,DL,R,Sx,M,sb,$,document};
}

const strip=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const heads=A=>[...A.$('secHead')._h.matchAll(/<th[^>]*data-c="([^"]+)"[^>]*>(.*?)<\/th>/g)].map(m=>m[1]+':'+strip(m[2]));
const rows=A=>[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))}));
// 1) etat neuf
let A=boot({});A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
console.log('colonnes (neuf)     :',heads(A).join(' | '));
console.log('colonne jauge ?     :',heads(A).some(h=>/^bar/.test(h)),'| cellules .bar dans le tableau :',/class="bar"/.test(A.$('secRows')._h));
const r0=rows(A)[0];console.log('1re ligne           :',r0.cells.join(' | '));
// 2) migration d'un ordre memorise avec l'ancienne colonne « bar »
const B=boot({'mm.seccols':JSON.stringify(['delta','rank','sym','grp','dev','bar','nm'])});
B.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
console.log('ordre migre         :',heads(B).map(h=>h.split(':')[0]).join(' > '),'(attendu : delta rank sym grp desc dev nm)');
// 3) tri par description, graphique et infos
A.L.secHead.click({target:{closest:()=>({dataset:{k:'desc',c:'desc'}})}});
const order=rows(A).map(r=>r.cells[heads(A).findIndex(h=>h.startsWith('desc'))]);
const ranked=order.slice(0,-1);
console.log('tri description A→Z :',ranked.slice(0,3).join(' / '),'| ordre valide',ranked.every((v,i)=>i===0||ranked[i-1].localeCompare(v,'fr')<=0),'| fleche',heads(A).find(h=>h.startsWith('desc')));
A.L.secRows.click({target:{closest:()=>({dataset:{s:'DRAM'}})}});
console.log('graphique DRAM      :',strip(A.$('secTitle')._t),'|',strip(A.$('secInfo')._h));
// 4) toutes les descriptions presentes
const S_=A.sb.SECTORS;console.log('descriptions        :',S_.symbols.filter(x=>x.d&&x.d.length>8).length,'/',S_.symbols.length);
