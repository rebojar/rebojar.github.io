'use strict';
// A altura vem da janela; a medição usa a mesma tipografia do papel.
function notebookSize(){
 const bar=document.querySelector('.barra'),desk=document.querySelector('.mesa'),binding=document.querySelector('.encadernacao'),nav=document.querySelector('.folhear');
 let height=window.innerHeight-bar.getBoundingClientRect().height-65;
 if(window.innerWidth>=700){const bs=getComputedStyle(binding),ns=getComputedStyle(nav);const n=v=>parseFloat(v)||0;height=desk.clientHeight-nav.getBoundingClientRect().height-n(ns.marginTop)-n(ns.marginBottom)-n(bs.paddingTop)-n(bs.paddingBottom)-n(bs.borderTopWidth)-n(bs.borderBottomWidth)-4;}
 document.documentElement.style.setProperty('--altura-folha',Math.max(1,Math.floor(height))+'px');
}
function splitToFit(text,fits){
 if(fits(text))return [text,''];
 let low=0,high=text.length;
 while(low<high){const mid=Math.ceil((low+high)/2);if(fits(text.slice(0,mid)))low=mid;else high=mid-1;}
 // Não separar o par UTF-16 de um emoji.
 if(low>0&&/[\uD800-\uDBFF]/.test(text[low-1]))low--;
 if(low===0)return ['',text];
 const boundary=text.slice(0,low).search(/\s+\S*$/);
 if(boundary>low*.6)low=boundary+1;
 return [text.slice(0,low),text.slice(low)];
}
function pageMeasurement(page,field='text'){
 const paper=document.querySelector('.folha'),body=document.getElementById('palavras'),heading=document.getElementById('tituloVista');
 const probe=document.createElement('div'),style=getComputedStyle(field==='title'?heading:body),ps=getComputedStyle(paper);
 Object.assign(probe.style,{position:'fixed',left:'-20000px',top:'0',visibility:'hidden',pointerEvents:'none',width:(page.positions?.[field]?.width||body.clientWidth)+'px',font:style.font,lineHeight:style.lineHeight,whiteSpace:'pre-wrap',overflowWrap:'anywhere',minHeight:'0',padding:'0',margin:'0'});
 document.body.append(probe);
 const title=document.createElement('div'),hs=getComputedStyle(heading);
 Object.assign(title.style,{font:hs.font,lineHeight:hs.lineHeight,whiteSpace:'pre-wrap',overflowWrap:'anywhere'});title.innerHTML=richHTML(page,'title');probe.append(title);
 const titleHeight=page.title?title.getBoundingClientRect().height:parseFloat(hs.lineHeight)||36;
 let reserved=titleHeight;
 if(field==='title'){const bs=getComputedStyle(body);Object.assign(title.style,{font:bs.font,lineHeight:bs.lineHeight});title.innerHTML=richHTML(page,'text');reserved=page.text?title.getBoundingClientRect().height:0;}
 const available=Math.max(parseFloat(style.lineHeight)||32,paper.clientHeight-parseFloat(ps.paddingTop)-paper.querySelector('.cabecalho-folha').offsetHeight-reserved-Math.max(0,page.positions?.[field]?.y||0)-parseFloat(hs.marginTop)-parseFloat(hs.marginBottom)-46);
 title.remove();
 return {fits:text=>{probe.innerHTML=richHTML({[field]:text,rich:{[field]:splitRuns(cleanRuns(page.rich?.[field],page[field]),text.length)[0]}},field);return probe.getBoundingClientRect().height<=available;},remove:()=>probe.remove()};
}
function caretOffset(el){
 const selection=window.getSelection();if(!selection.rangeCount||!el.contains(selection.anchorNode))return el.innerText.length;
 const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(el);range.setEnd(selection.focusNode,selection.focusOffset);return range.toString().length;
}
function placeCaret(el,offset){
 el.focus({preventScroll:true});let remaining=offset,found=false;const range=document.createRange();
 function visit(node){if(found)return;if(node.nodeType===3){if(remaining<=node.textContent.length){range.setStart(node,remaining);found=true;}else remaining-=node.textContent.length;return;}for(const child of node.childNodes)visit(child);if(node!==el&&node.nodeName==='DIV'&&node.nextSibling)remaining=Math.max(0,remaining-1);}
 visit(el);if(!found){range.selectNodeContents(el);range.collapse(false);}else range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
function flowInput(page,el,event,field='text'){
 if(typeof richFormatting!=='undefined'&&richFormatting)return;
 const beforeText=page[field],beforeRich=JSON.stringify(page.rich?.[field]);page.rich??={};if(el.nodeType){page.rich[field]=readRich(el);page[field]=page.rich[field].map(r=>r.text).join('');}else{page[field]=el.innerText;page.rich[field]=cleanRuns(null,page[field]);}if(beforeText!==page[field]||beforeRich!==JSON.stringify(page.rich[field]))recordTextChange(page,field);if(event?.isComposing){persist();return;}
 let index=page===state.guard?-1:state.pages.indexOf(page),caret=el.nodeType?richOffset(el):caretOffset(el),focusIndex=index,focusOffset=caret;
 let next=page,changed=false,limit=false;
 while(next){
  const measurement=pageMeasurement(next,field);const [head,tail]=splitToFit(next[field],measurement.fits);measurement.remove();
  if(!tail)break;
  if(!head||index>=498){limit=true;break;}
  const [headRuns,tailRuns]=splitRuns(cleanRuns(next.rich?.[field],next[field]),head.length);changed=true;next.rich??={};next.rich[field]=headRuns;next[field]=head;
  if(focusIndex===index&&focusOffset>head.length){focusIndex++;focusOffset-=head.length;}
  index++;
  if(!state.pages[index])state.pages.push({...pagina(),title:'',date:page.date});
  next=state.pages[index];next.textMeta??={};if(!next.textMeta[field]&&page.textMeta?.[field])next.textMeta[field]={...page.textMeta[field]};next.rich??={};next.rich[field]=tailRuns.concat(cleanRuns(next.rich[field],next[field]));next[field]=tail+next[field];
 }
 persist();
 if(!changed){if(limit)avisar('Sem espaço para distribuir este texto; ele foi preservado.');return;}
 const newSpread=focusIndex<0?0:Math.ceil(focusIndex/2)*2;
 let ghost=null;
 if(newSpread!==current){
  const old=el.closest('article'),rect=old.getBoundingClientRect();ghost=old.cloneNode(true);ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  ghost.setAttribute('aria-hidden','true');ghost.inert=true;Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',zIndex:'90',pointerEvents:'none',transformOrigin:'left center'});document.body.append(ghost);
 }
 while(state.pages.length<=newSpread)state.pages.push({...pagina(),title:''});current=newSpread;render();
 const target=focusIndex===current?document.getElementById(field==='title'?'tituloVista':'palavras'):document.querySelector(field==='title'?'#folhaEsquerda h2':'.texto-esquerdo');placeCaret(target,focusOffset);
 if(ghost){if(ghost.animate){const animation=ghost.animate([{transform:'perspective(1600px) rotateY(0deg)'},{transform:'perspective(1600px) rotateY(-180deg)'}],{duration:650,easing:'ease-in-out'});animation.onfinish=animation.oncancel=()=>ghost.remove();}else ghost.remove();}
 if(limit)avisar('Limite de páginas atingido; o restante do texto foi preservado.');
}
function paginateSavedTitles(){
 if(closed)return;
 let changed=false;
 for(let i=-1;i<state.pages.length&&i<498;i++){
  const page=i<0?state.guard:state.pages[i];if(!page||page.title.length<80)continue;
  const measure=pageMeasurement(page,'title'),[head,tail]=splitToFit(page.title,measure.fits);measure.remove();
  if(!tail||!head)continue;
  const [headRuns,tailRuns]=splitRuns(cleanRuns(page.rich?.title,page.title),head.length);page.rich??={};page.rich.title=headRuns;page.title=head;const target=i+1;
  if(!state.pages[target])state.pages.push({...pagina(),title:'',date:page.date});
  state.pages[target].rich??={};state.pages[target].rich.title=tailRuns.concat(cleanRuns(state.pages[target].rich.title,state.pages[target].title));state.pages[target].title=tail+state.pages[target].title;changed=true;
 }
 if(changed){render();persist();}
}
window.addEventListener('resize',notebookSize);
document.addEventListener('DOMContentLoaded',()=>{notebookSize();if('ResizeObserver' in window){const observer=new ResizeObserver(notebookSize);observer.observe(document.querySelector('.barra'));observer.observe(document.querySelector('main'));}});
notebookSize();
