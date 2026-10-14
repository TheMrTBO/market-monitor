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
const heads=A=>[...A.$('secHead')._h.matchAll(/<th[^>]*data-c="([^"]+)"[^>]*>(.*?)<\/th>/g)].map(m=>m[1]+':'+strip(m[2]));
const rows=A=>[...A.$('secRows')._h.matchAll(/<tr data-s="([^"]+)"[^>]*>(.*?)<\/tr>/g)].map(m=>({s:m[1],h:m[2],cells:[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>strip(x[1]))}));
const tab=A=>A.L.tabs.click({target:{closest:()=>({dataset:{tab:'sec'}})}});
// 1) colonnes et Groupe = libelle court integre au dashboard, description au survol
let A=boot({});
tab(A);
console.log('colonnes            :',heads(A).join(' | '));
const r0=rows(A)[0];
console.log('1re ligne           :',r0.cells.join(' | '),'| description au survol :',/title="Cybersécurité : éditeurs/.test(r0.h));
const cats=new Set(A.sb.SECTORS.symbols.map(x=>x.g));
console.log('libelles courts     :',rows(A).filter(r=>!cats.has(r.cells[2])).length,'/',rows(A).length,'(attendu 55 / 55, aucune categorie brute)');
console.log('ecart : barre derriere le chiffre, ancree a droite :',/<div class="devc"><i class="u" style="width:[\d.]+%"><\/i><span class="v pos">/.test(r0.h),'| plus grand |ecart| = 100 % :',rows(A).some(r=>/style="width:100%"/.test(r.h)));
// 2) migration d'un ancien ordre memorise (Nom, Description, jauge)
const B=boot({'mm.seccols':JSON.stringify(['delta','rank','sym','nm','grp','desc','dev','bar'])});tab(B);
console.log('ordre migre         :',heads(B).map(h=>h.split(':')[0]).join(' > '),'(attendu : delta > rank > sym > grp > dev)');
// 3) filtre par groupe : rangs globaux conserves
A.L.secFilt.click({target:{closest:()=>({dataset:{g:'Matières'}})}});
const rm=rows(A);
console.log('filtre Matieres     :',rm.length,'lignes | rangs',rm.map(r=>r.cells[0]).join(','),'| memorise',A.sb.localStorage.getItem('mm.secgrp'));
A.L.secFilt.click({target:{closest:()=>({dataset:{g:'all'}})}});
console.log('filtre Tous         :',rows(A).length,'lignes');
// 4) classement a la seance choisie dans « Stats du » (2026-08-04)
const D=A.sb.SECTORS.dates, idx=D.indexOf('2026-08-04');
const sc=(c,e)=>{let s7=0,s65=0;for(let i=e-64;i<=e;i++){s65+=c[i];if(i>e-7)s7+=c[i];}return s7/7/(s65/65);};
const exp=A.sb.SECTORS.symbols.filter(x=>x.c.slice(idx-64,idx+1).every(v=>v!=null)).map(x=>[x.s,sc(x.c,idx)]).sort((a,b)=>b[1]-a[1])[0][0];
A.L.dPick.change({target:{value:'2026-08-04'}});
console.log('Stats du 4 aout     :',strip(A.$('secMeta')._t),'| 1er',rows(A)[0].s,'(attendu',exp+')');
A.L.dToday.click();
console.log('Aujourd\'hui         :',strip(A.$('secMeta')._t),'| 1er',rows(A)[0].s);
// 5) score sous le graphique et en-tete
A.L.secRows.click({target:{closest:()=>({dataset:{s:'DRAM'}})}});
console.log('graphique DRAM      :',strip(A.$('secTitle')._t),'|',strip(A.$('secInfo')._t),'|',strip(A.$('secScoreNow')._h));
console.log('ligne 1,00 du score tracee :',(A.M.secScoreCv||[]).length>0);
// 6) carte du score : survol -> infobulle avec la valeur du score
A.L.secScoreCv.pointermove({clientX:600,clientY:80,pageX:600,pageY:80});
const tipEl=A.document.body.children[A.document.body.children.length-1];
console.log('survol du score     :',strip(tipEl.innerHTML));
// 7) mobile : toucher un ticker ouvre le detail, « ‹ Classement » revient a la liste
A.sb.innerWidth=375;
A.L.secRows.click({target:{closest:()=>({dataset:{s:'SMH'}})}});
const det=()=>A.$('view-sec').classList._s.has('detail');
console.log('mobile : toucher SMH -> detail',det(),'| titre',A.$('secTitle')._t);
A.L.secBack.click({});
console.log('mobile : retour -> detail',det());
A.sb.innerWidth=1200;A.L.secRows.click({target:{closest:()=>({dataset:{s:'XLK'}})}});
console.log('bureau : clic XLK -> detail',det(),'(attendu false)');
