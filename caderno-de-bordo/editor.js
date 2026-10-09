'use strict';
const richKeys=['color','backgroundColor','fontSize','fontWeight','fontStyle','textDecoration','textAlign'];
function cleanRecentColors(colors){return (Array.isArray(colors)?colors:[]).filter(c=>c&&/^#[\da-f]{6}$/i.test(c.hex)).slice(-6).map(c=>({hex:c.hex.toLowerCase(),alpha:Math.max(0,Math.min(100,Number.isFinite(c.alpha)?c.alpha:100)),pinned:c.pinned===true}));}
function nextRecentColors(colors,hex,alpha){
 const cleaned=cleanRecentColors(colors),normalized={hex:hex.toLowerCase(),alpha:Math.max(0,Math.min(100,Number(alpha))),pinned:false},existing=cleaned.findIndex(c=>c.hex===normalized.hex&&c.alpha===normalized.alpha);
 if(existing>=0){if(cleaned[existing].pinned)return cleaned;return [...cleaned.slice(0,existing),...cleaned.slice(existing+1),cleaned[existing]];}
 if(cleaned.length<6)return [...cleaned,normalized];
 const removable=cleaned.findIndex(c=>!c.pinned);if(removable<0)return cleaned;
 return [...cleaned.slice(0,removable),...cleaned.slice(removable+1),normalized];
}
let lastColorTarget={id:'markColor',alpha:'markAlpha',cmd:'hiliteColor'};
function rememberColor(hex,alpha,target){state.colorHistory??={text:[],mark:[]};const key=target==='textColor'?'text':'mark';state.colorHistory[key]=nextRecentColors(state.colorHistory[key],hex,alpha);renderRecentColors();persist();}
function toggleRecentColorPinned(key,hex,alpha){state.colorHistory??={text:[],mark:[]};state.colorHistory[key]=cleanRecentColors(state.colorHistory[key]).map(color=>color.hex===hex&&color.alpha===alpha?{...color,pinned:!color.pinned}:color);renderRecentColors();persist();}
function reorderRecentColors(colors,from,to){const ordered=cleanRecentColors(colors);if(from<0||from>=ordered.length||to<0||to>=ordered.length||from===to)return ordered;const [moved]=ordered.splice(from,1);ordered.splice(to,0,moved);return ordered;}
function hasFormattingSelection(){const selection=window.getSelection?.();return spreadSelection.length>0||!!(editorTarget?.isConnected&&editorRange&&!editorRange.collapsed&&selection?.rangeCount&&!selection.isCollapsed);}
function useRecentColor(t,color){document.getElementById(t.id).value=color.hex;document.getElementById(t.alpha).value=color.alpha;document.getElementById(t.alpha+'Value').textContent=color.alpha+'%';if(!hasFormattingSelection()){toggleRecentColorPinned(t.key,color.hex,color.alpha);return;}const hex=color.hex;formatText(t.cmd,'rgba('+parseInt(hex.slice(1,3),16)+','+parseInt(hex.slice(3,5),16)+','+parseInt(hex.slice(5,7),16)+','+color.alpha/100+')');rememberColor(color.hex,color.alpha,t.id);}
function renderRecentColors(){
 for(const t of [{id:'textColor',alpha:'textAlpha',cmd:'foreColor',key:'text',row:'coresTexto'},{id:'markColor',alpha:'markAlpha',cmd:'hiliteColor',key:'mark',row:'coresGrifo'}]){
 const row=document.getElementById(t.row);if(!row)continue;row.replaceChildren();let colors=cleanRecentColors(state.colorHistory?.[t.key]);
 for(let i=0;i<6;i++){const button=document.createElement('button'),color=colors[i];button.disabled=!color;
  button.dataset.index=i;
  if(color){const fill=document.createElement('span');fill.style.backgroundColor=color.hex;fill.style.opacity=color.alpha/100;button.append(fill);button.classList.toggle('cor-fixada',color.pinned);button.setAttribute('aria-pressed',String(color.pinned));button.title=color.hex+' · '+color.alpha+'%'+(color.pinned?' · fixa':'')+' · arraste para organizar';button.setAttribute('aria-label',(color.pinned?'Cor fixa ':'Usar ou fixar cor ')+button.title);let drag=null;
   button.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,y:e.clientY,index:Number(button.dataset.index),moved:false};button.setPointerCapture?.(e.pointerId);};
   button.onpointermove=e=>{if(!drag)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.moved=true;button.classList.add('cor-arrastada');const target=document.elementFromPoint?.(e.clientX,e.clientY)?.closest?.('button');if(!target||target.parentElement!==row||target===button)return;const to=Math.min(colors.length-1,Number(target.dataset.index));if(!Number.isFinite(to)||to===drag.index)return;colors=reorderRecentColors(colors,drag.index,to);state.colorHistory??={text:[],mark:[]};state.colorHistory[t.key]=colors;row.insertBefore(button,to>drag.index?target.nextSibling:target);[...row.children].forEach((item,index)=>item.dataset.index=index);drag.index=to;};
   const finish=e=>{if(!drag)return;const moved=drag.moved;drag=null;button.classList.remove('cor-arrastada');try{button.releasePointerCapture?.(e.pointerId);}catch{}if(moved){persist();renderRecentColors();}else useRecentColor(t,color);};button.onpointerup=finish;button.onpointercancel=e=>{if(!drag)return;const moved=drag.moved;drag=null;button.classList.remove('cor-arrastada');if(moved){persist();renderRecentColors();}};button.onclick=e=>e.preventDefault();
   button.onkeydown=e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const from=Number(button.dataset.index),to=Math.max(0,Math.min(colors.length-1,from+(e.key==='ArrowRight'?1:-1)));if(to!==from){state.colorHistory[t.key]=reorderRecentColors(colors,from,to);renderRecentColors();persist();document.querySelectorAll('#'+t.row+' button')[to]?.focus();}return;}if(e.key==='Enter'||e.key===' '){e.preventDefault();useRecentColor(t,color);}};
  }
  else button.setAttribute('aria-label','Espaço de cor ainda vazio');row.append(button);
 }
 }
}
function cleanTextMeta(meta={}){return Object.fromEntries(['title','text'].map(key=>{const m=meta?.[key]||{};return [key,{createdAt:typeof m.createdAt==='string'&&!Number.isNaN(Date.parse(m.createdAt))?m.createdAt:'',updatedAt:typeof m.updatedAt==='string'&&!Number.isNaN(Date.parse(m.updatedAt))?m.updatedAt:'',finalized:m.finalized===true}];}));}
function recordTextChange(page,field){
 if(!page[field])return;page.textMeta??={};const meta=page.textMeta[field]??={};const now=new Date().toISOString();if(!meta.createdAt)meta.createdAt=now;else if(meta.finalized)meta.updatedAt=now;
}
function cleanStyle(style={}){
 const out={};for(const key of richKeys){const v=String(style[key]||'');
  if((key==='color'||key==='backgroundColor')&&/^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\)|transparent)$/i.test(v))out[key]=v;
  if(key==='fontSize'&&/^\d+(\.\d+)?px$/.test(v))out[key]=Math.max(6,Math.min(96,parseFloat(v)))+'px';
  if(key==='fontWeight'&&/^(bold|normal|[1-9]00)$/.test(v))out[key]=v;
  if(key==='fontStyle'&&/^(italic|normal)$/.test(v))out[key]=v;
  if(key==='textDecoration'&&/^(underline|line-through|none|underline line-through)$/.test(v))out[key]=v;
  if(key==='textAlign'&&/^(left|right|center|justify)$/.test(v))out[key]=v;
 }return out;
}
function cleanRuns(runs,text){
 if(!Array.isArray(runs))return [{text,style:{}}];
 const cleaned=runs.filter(r=>r&&typeof r.text==='string').map(r=>({text:r.text,style:cleanStyle(r.style)}));
 return cleaned.map(r=>r.text).join('')===text?cleaned:[{text,style:{}}];
}
function splitRuns(runs,count){
 const a=[],b=[];for(const run of runs){const cut=Math.max(0,Math.min(count,run.text.length));if(cut)a.push({...run,text:run.text.slice(0,cut)});if(cut<run.text.length)b.push({...run,text:run.text.slice(cut)});count-=cut;}return [a,b];
}
function richHTML(page,field){
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const runs=cleanRuns(page.rich?.[field],page[field]);let lines=[{html:'',align:'left'}];
 for(const run of runs){const bits=run.text.split('\n');bits.forEach((bit,i)=>{if(i)lines.push({html:'',align:run.style.textAlign||'left'});const line=lines[lines.length-1];if(run.style.textAlign)line.align=run.style.textAlign;const css=Object.entries(cleanStyle(run.style)).filter(([k])=>k!=='textAlign').map(([k,v])=>k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+v).join(';')+(run.style.fontSize?';line-height:1.4':'');line.html+='<span style="'+escape(css)+'">'+escape(bit)+'</span>';});}
 return lines.map(l=>'<div style="text-align:'+l.align+';min-height:1em">'+l.html+'</div>').join('');
}
function readRich(el){
 const runs=[];const add=(text,style)=>{if(text)runs.push({text,style:cleanStyle(style)});};
 function visit(node,inherited={}){
  if(node.nodeType===3){add(node.textContent,inherited);return;}if(node.nodeType!==1)return;
  if(['SCRIPT','STYLE','IMG','IFRAME','OBJECT'].includes(node.tagName))return;
  const style={...inherited};for(const key of richKeys)if(node.style[key])style[key]=node.style[key];
  if(['B','STRONG'].includes(node.tagName))style.fontWeight='bold';if(['I','EM'].includes(node.tagName))style.fontStyle='italic';
  if(node.tagName==='U')style.textDecoration='underline';if(['S','STRIKE'].includes(node.tagName))style.textDecoration='line-through';
  if(node.tagName==='BR'){add('\n',style);return;}
  [...node.childNodes].forEach(child=>visit(child,style));
  if(['DIV','P','LI','H1','H2'].includes(node.tagName)&&node!==el&&node.nextSibling)add('\n',style);
 }
 visit(el);return runs;
}
function richOffset(el){const s=window.getSelection();if(!s.rangeCount||!el.contains(s.focusNode))return readRich(el).map(r=>r.text).join('').length;const r=s.getRangeAt(0).cloneRange();r.selectNodeContents(el);r.setEnd(s.focusNode,s.focusOffset);const box=document.createElement('div');box.append(r.cloneContents());return readRich(box).map(t=>t.text).join('').length;}
function writeRich(el,page,field){el.innerHTML=richHTML(page,field);el.contentEditable='true';el._page=page;el._field=field;el.onpaste=event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));};}
let editorRange=null,editorTarget=null,richFormatting=false;
let spreadSelection=[];
function clearSpreadSelection(){spreadSelection.forEach(el=>el.classList.remove('selecionado-dupla'));spreadSelection=[];}
function selectSpread(){
 clearSpreadSelection();
 spreadSelection=[...document.querySelectorAll('#folhaEsquerda [contenteditable="true"],.folha [contenteditable="true"]')].filter(el=>el._page&&!el.closest('article').hidden);
 if(!spreadSelection.length)return;
 const range=document.createRange();range.selectNodeContents(spreadSelection[0]);range.collapse(true);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 spreadSelection.forEach(el=>el.classList.add('selecionado-dupla'));
 document.getElementById('editorHint').textContent='Texto das duas folhas selecionado.';
}
document.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'&&event.target.closest('article [contenteditable="true"]')){event.preventDefault();selectSpread();}
 if(event.key==='Escape'||event.key.startsWith('Arrow'))clearSpreadSelection();
},true);
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.editor-texto'))clearSpreadSelection();},true);
function replaceSpread(text){
 const first=spreadSelection[0];if(!first?.isConnected){clearSpreadSelection();return;}
 const page=first._page,field=first._field;
 for(const el of spreadSelection){el._page[el._field]='';el._page.rich??={};el._page.rich[el._field]=[];}
 clearSpreadSelection();render();
 const target=[...document.querySelectorAll('[contenteditable="true"]')].find(el=>el._page===page&&el._field===field);
 target.textContent=text;placeCaret(target,text.length);flowInput(page,target,{},field);persist();
}
document.addEventListener('copy',event=>{if(!spreadSelection.length||event.target.closest?.('.editor-texto,input,textarea'))return;event.preventDefault();event.clipboardData.setData('text/plain',spreadSelection.map(el=>el._page[el._field]).join('\n\n'));});
document.addEventListener('cut',event=>{if(!spreadSelection.length)return;event.preventDefault();event.clipboardData.setData('text/plain',spreadSelection.map(el=>el._page[el._field]).join('\n\n'));replaceSpread('');});
document.addEventListener('paste',event=>{if(!spreadSelection.length||event.target.closest('.editor-texto'))return;event.preventDefault();event.stopImmediatePropagation();replaceSpread(event.clipboardData.getData('text/plain'));},true);
document.addEventListener('beforeinput',event=>{if(!spreadSelection.length||event.target.closest('.editor-texto'))return;if(event.inputType.startsWith('delete')||event.inputType==='insertText'||event.inputType==='insertParagraph'){event.preventDefault();replaceSpread(event.inputType.startsWith('delete')?'':event.data||'\n');}},true);
document.addEventListener('selectionchange',()=>{const s=window.getSelection();if(!s.rangeCount)return;const n=s.anchorNode?.nodeType===1?s.anchorNode:s.anchorNode?.parentElement;const el=n?.closest('[contenteditable="true"]');if(el?._page&&el.contains(s.focusNode)){editorTarget=el;editorRange=s.getRangeAt(0).cloneRange();}});
function formatText(command,value){
 if(spreadSelection.length){
  const properties={bold:['fontWeight','bold','normal'],italic:['fontStyle','italic','normal'],underline:['textDecoration','underline','none'],strikeThrough:['textDecoration','line-through','none'],foreColor:['color',value],hiliteColor:['backgroundColor',value],size:['fontSize',value+'px'],justifyLeft:['textAlign','left'],justifyCenter:['textAlign','center'],justifyRight:['textAlign','right'],justifyFull:['textAlign','justify']};
  const setting=properties[command];if(!setting)return;const [key,on,off]=setting;
  const selected=spreadSelection.filter(el=>el.isConnected);const remove=off&&selected.every(el=>cleanRuns(el._page.rich?.[el._field],el._page[el._field]).every(run=>run.style[key]===on));
  for(const el of selected){const page=el._page;page.rich??={};page.rich[el._field]=cleanRuns(page.rich[el._field],page[el._field]).map(run=>({...run,style:{...run.style,[key]:remove?off:on}}));recordTextChange(page,el._field);}
  render();persist();selectSpread();return;
 }
 if(!editorTarget?.isConnected||!editorRange){document.getElementById('editorHint').textContent='Selecione um trecho no papel primeiro.';return;}
 const s=window.getSelection();s.removeAllRanges();s.addRange(editorRange);editorTarget.focus({preventScroll:true});
 richFormatting=true;
 document.execCommand('styleWithCSS',false,true);
 if(command==='size'){document.execCommand('fontSize',false,'7');editorTarget.querySelectorAll('font[size="7"],[style*="xxx-large"]').forEach(n=>{n.removeAttribute('size');n.style.fontSize=value+'px';n.style.lineHeight='1.4';});}
 else document.execCommand(command,false,value);
 richFormatting=false;flowInput(editorTarget._page,editorTarget,{},editorTarget._field);
 document.getElementById('editorHint').textContent='Aplicado ao trecho selecionado.';
}
function addTextDetails(el,page,field,wrapper){
 const foot=document.createElement('div');foot.className='registro-texto';foot.contentEditable='false';const created=document.createElement('span'),updated=document.createElement('span');foot.append(created,updated);wrapper.append(foot);
 const display=()=>{const m=page.textMeta?.[field];const fmt=v=>new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});created.textContent=m?.createdAt&&m.finalized?fmt(m.createdAt):'';updated.textContent=m?.updatedAt&&m.finalized?fmt(m.updatedAt):'';created.title='Criação do texto';updated.title='Última edição';};display();
 el.onblur=()=>{const m=page.textMeta?.[field];if(m){m.finalized=true;display();persist();}};
 const resize=document.createElement('button');resize.className='largura-texto';resize.title='Arraste para ajustar a largura';resize.setAttribute('aria-label','Ajustar largura da caixa de texto');wrapper.append(resize);
 let initial=null;resize.onpointerdown=e=>{e.preventDefault();initial={x:e.clientX,width:wrapper.offsetWidth};resize.setPointerCapture(e.pointerId);};
 const setWidth=width=>{const paper=el.closest('article');page.positions??={};page.positions[field]??={x:0,y:0};page.positions[field].width=Math.round(Math.max(70,Math.min(paper.clientWidth-wrapper.offsetLeft-15,width)));wrapper.style.width=page.positions[field].width+'px';};
 resize.onpointermove=e=>{if(initial)setWidth(initial.width+e.clientX-initial.x);};
 resize.onpointerup=()=>{if(initial){initial=null;flowInput(page,el,{},field);persist();}};resize.onpointercancel=()=>{initial=null;persist();};
 resize.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();setWidth(wrapper.offsetWidth+(e.key==='ArrowRight'?5:-5));flowInput(page,el,{},field);persist();};
}
function attachTextBox(el,page,field){
 if(!el.parentElement.classList.contains('caixa-texto')){const wrapper=document.createElement('div');wrapper.className='caixa-texto';el.before(wrapper);wrapper.append(el);}
 const wrapper=el.parentElement;wrapper.querySelectorAll('.puxador-texto,.largura-texto,.registro-texto').forEach(n=>n.remove());addTextDetails(el,page,field,wrapper);
 const position=page.positions?.[field]||{x:0,y:0};wrapper.style.width=position.width?position.width+'px':'';wrapper.style.transform=`translate(${position.x}px,${position.y}px)`;
 const grip=document.createElement('button');grip.className='puxador-texto';grip.title='Arraste esta borda para mover o texto';grip.setAttribute('aria-label','Mover caixa de texto');wrapper.append(grip);
 let drag=null;grip.onpointerdown=e=>{e.preventDefault();drag={x:e.clientX,y:e.clientY,px:page.positions?.[field]?.x||0,py:page.positions?.[field]?.y||0};grip.setPointerCapture(e.pointerId);};
 grip.onpointermove=e=>{if(!drag)return;const paper=el.closest('article');page.positions??={};page.positions[field]={...page.positions[field],x:Math.max(-wrapper.offsetLeft,Math.min(paper.clientWidth-wrapper.offsetLeft-40,drag.px+e.clientX-drag.x)),y:Math.max(-wrapper.offsetTop,Math.min(paper.clientHeight-wrapper.offsetTop-35,drag.py+e.clientY-drag.y))};const p=page.positions[field];wrapper.style.transform=`translate(${p.x}px,${p.y}px)`;};
 grip.onpointerup=()=>{if(drag){drag=null;persist();}};grip.onpointercancel=()=>{drag=null;persist();};
 grip.onkeydown=e=>{const d={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[e.key];if(!d)return;e.preventDefault();page.positions??={};const p=page.positions[field]||{x:0,y:0};page.positions[field]={...p,x:p.x+d[0],y:p.y+d[1]};wrapper.style.transform=`translate(${p.x+d[0]}px,${p.y+d[1]}px)`;persist();};
}
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-format]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>formatText(b.dataset.format);});
 const applyColor=(id,alpha,command)=>{const h=document.getElementById(id).value;const a=Number(document.getElementById(alpha).value)/100;document.getElementById(alpha+'Value').textContent=Math.round(a*100)+'%';formatText(command,'rgba('+parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16)+','+a+')');};
 for(const [id,alpha,cmd] of [['textColor','textAlpha','foreColor'],['markColor','markAlpha','hiliteColor']]){document.getElementById(id).oninput=()=>{lastColorTarget={id,alpha,cmd};applyColor(id,alpha,cmd);};document.getElementById(alpha).oninput=()=>{lastColorTarget={id,alpha,cmd};applyColor(id,alpha,cmd);};const remember=()=>rememberColor(document.getElementById(id).value,Number(document.getElementById(alpha).value),id);document.getElementById(id).onchange=remember;document.getElementById(alpha).onchange=remember;}
 const clock=document.getElementById('horaAtual');const tick=()=>{clock.textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};tick();setInterval(tick,1000);
 document.getElementById('fontSize').onchange=e=>formatText('size',Math.max(6,Math.min(96,+e.target.value||12)));
});
