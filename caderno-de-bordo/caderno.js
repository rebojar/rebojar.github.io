/* Caderno local: sem serviços externos, rastreamento ou dependências. */
'use strict';
const $ = id => document.getElementById(id);
const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random();
const hoje = () => new Date().toLocaleDateString('en-CA');
const pagina = () => ({id:id(),title:'Um novo registro',date:hoje(),text:'',publish:false,photos:[]});
const paginaGuarda = () => ({id:id(),kind:'endpaper',title:'',date:'',text:'',publish:false,photos:[]});
const ehGuarda = page => page?.kind==='endpaper';
const guardaFixa = page => ({...paginaGuarda(),id:String(page?.id||id()).slice(0,100)});
const appConfig=typeof window==='undefined'?{}:(window.CADERNO_CONFIG||{});
const publicDemo=appConfig.mode==='publico';
if(typeof document!=='undefined'&&document.documentElement)document.documentElement.dataset.modo=publicDemo?'publico':'pessoal';
const defaultState={version:1,layoutVersion:2,name:'Caderno de bordo',showToolsInPublication:true,pencilCase:{title:'rebojar',subtitle:'ferramentas do caderno'},pages:[paginaGuarda(),paginaGuarda(),{...pagina(),title:'As coisas que ficam',text:'Um lugar para guardar o que chamou sua atenção.\n\nComece pelas palavras, por uma fotografia ou por um detalhe que você não quer esquecer.',publish:false}]};
let state=appConfig.initialState?JSON.parse(JSON.stringify(appConfig.initialState)):defaultState,current=0,db=null,saveTimer,dirty=false,saveQueue=Promise.resolve();
const atual=()=>state.pages[current];
const totalDeConteudo=()=>state.pages.filter(page=>!ehGuarda(page)).length;
const numeroDeConteudo=index=>state.pages.slice(0,index+1).filter(page=>!ehGuarda(page)).length;
function indicesDaAbertura(index,total=state.pages.length){
 if(index<=0)return total?[0]:[];
 const left=index%2===0?index-1:index,right=index%2===0?index:index+1;
 return [left,right].filter(i=>i>=0&&i<total);
}
function paginasDaAbertura(index=current){return indicesDaAbertura(index).map(i=>state.pages[i]);}
function paginasSelecionadas(pages=state.pages){
 const included=new Set();
 pages.forEach((page,index)=>{if(page?.publish)indicesDaAbertura(index,pages.length).forEach(i=>included.add(i));});
 return pages.filter((page,index)=>included.has(index)&&!ehGuarda(page));
}
let closed=false,turning=false;
const defaultCover={eyebrow:'REBOJAR / CADERNO PESSOAL',subtitle:'Fotografias, palavras e pequenas coisas que merecem ficar.'};
const avisar=message=>$('status').textContent=message;
function cleanPage(p){
 if(!p||typeof p.title!=='string'||typeof p.text!=='string'||!Array.isArray(p.photos)||p.photos.length>30)throw Error('Página inválida na cópia.');
 return {kind:p.kind==='endpaper'?'endpaper':undefined,textMeta:cleanTextMeta(p.textMeta),rich:{title:cleanRuns(p.rich?.title,p.title),text:cleanRuns(p.rich?.text,p.text)},positions:Object.fromEntries(['title','text'].map(k=>[k,{width:Math.max(0,Math.min(2000,Number(p.positions?.[k]?.width)||0)),x:Math.max(-1000,Math.min(1000,Number(p.positions?.[k]?.x)||0)),y:Math.max(-1000,Math.min(1000,Number(p.positions?.[k]?.y)||0))}])),id:String(p.id||id()).slice(0,100),title:p.title.slice(0,100000),date:/^\d{4}-\d{2}-\d{2}$/.test(p.date)?p.date:'',text:p.text.slice(0,100000),publish:p.kind==='endpaper'?false:p.publish===true,photos:p.photos.map(f=>{
  if(!f||typeof f.src!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f.src))throw Error('Fotografia incompatível na cópia.');
  return {id:String(f.id||id()).slice(0,100),src:f.src,caption:String(f.caption||'').slice(0,250),deskX:Math.max(0,Number(f.deskX)||0),deskY:Math.max(0,Number(f.deskY)||0),width:Math.max(100,Math.min(600,Number(f.width)||230)),x:Math.max(0,Math.min(53,Number(f.x)||0)),y:Math.max(0,Math.min(10000,Number(f.y)||0)),angle:Math.max(-180,Math.min(180,Number(f.angle)||0))};
 })};
}
function validate(value){
 if(!value||value.version!==1||typeof value.name!=='string'||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>500)throw Error('Esta cópia não é um caderno compatível.');
 let pages=value.pages.map(cleanPage);
 if(Number(value.layoutVersion)!==2||!ehGuarda(pages[0])||!ehGuarda(pages[1]))pages=[paginaGuarda(),paginaGuarda(),...pages.filter(page=>!ehGuarda(page))];
 pages[0]=guardaFixa(pages[0]);
 const loosePhotos=value.loosePhotos?cleanPage({...pagina(),photos:value.loosePhotos}).photos:[];
 return {version:1,layoutVersion:2,recentColors:cleanRecentColors(value.recentColors),colorHistory:{text:cleanRecentColors(value.colorHistory?.text),mark:cleanRecentColors(value.colorHistory?.mark)},name:value.name.slice(0,100),showToolsInPublication:value.showToolsInPublication!==false,pencilCase:{title:String(value.pencilCase?.title??'rebojar').slice(0,80),subtitle:String(value.pencilCase?.subtitle??'ferramentas do caderno').slice(0,120)},guard:guardaFixa(value.guard),loosePhotos,cover:{eyebrow:String(value.cover?.eyebrow??defaultCover.eyebrow).slice(0,200),subtitle:String(value.cover?.subtitle??defaultCover.subtitle).slice(0,500)},pages};
}
function persist(){
 if(publicDemo){dirty=false;avisar('Demonstração pública · alterações somem ao recarregar · exportação com apoio');return;}
 dirty=true;avisar('Alterações por guardar…');clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{
  const snapshot=JSON.stringify(state);
  saveQueue=saveQueue.then(()=>new Promise(resolve=>{
   if(!db){avisar('Sem salvamento automático · use Guardar cópia');return resolve();}
   try{const tx=db.transaction('caderno','readwrite');tx.objectStore('caderno').put(snapshot,'principal');tx.oncomplete=()=>{if(JSON.stringify(state)===snapshot){dirty=false;avisar('Guardado neste navegador');}resolve();};tx.onerror=()=>{avisar('Não foi possível guardar · exporte uma cópia');resolve();};tx.onabort=tx.onerror;}catch{avisar('Não foi possível guardar · exporte uma cópia');resolve();}
  }));
 },250);
}
function render(){
 renderRecentColors();
 state.cover??={...defaultCover};state.guard??=paginaGuarda();state.loosePhotos??=[];
 state.showToolsInPublication=state.showToolsInPublication!==false;$('mostrarEstojoPublicacao').checked=state.showToolsInPublication;document.documentElement.classList.toggle('publico-sem-estojo',publicDemo&&!state.showToolsInPublication);
 state.pencilCase??={title:'rebojar',subtitle:'ferramentas do caderno'};$('estojoTitulo').textContent=state.pencilCase.title;$('estojoSubtitulo').textContent=state.pencilCase.subtitle;
 $('capaLinha').textContent=state.cover.eyebrow;$('capaSubtitulo').textContent=state.cover.subtitle;
 const p=atual(),right=document.querySelector('.folha'),endpaper=ehGuarda(p);right.classList.toggle('pagina-guarda',endpaper);right.classList.toggle('guarda-fixa',endpaper&&current===0);$('nome').textContent=state.name;$('data').value=p.date;$('publicar').checked=!endpaper&&paginasDaAbertura().some(page=>!ehGuarda(page)&&page.publish);
 $('nomeVista').textContent=state.name;writeRich($('tituloVista'),p,'title');writeRich($('palavras'),p,'text');attachTextBox($('tituloVista'),p,'title');attachTextBox($('palavras'),p,'text');
 $('dataVista').textContent=endpaper?'':p.date?p.date.split('-').reverse().join(' / '):'SEM DATA';$('numero').textContent=endpaper?'':String(numeroDeConteudo(current)).padStart(2,'0');$('contador').textContent=endpaper?'Folha de guarda':`${numeroDeConteudo(current)} de ${totalDeConteudo()}`;
 $('anterior').disabled=closed;$('proxima').disabled=closed;
 $('capa').hidden=!closed;document.querySelector('.folha').hidden=closed;$('folhaEsquerda').hidden=closed;
 document.querySelector('.encadernacao').classList.toggle('fechado',closed);
 for(const name of ['foto','data','publicar','excluir'])$(name).disabled=closed||endpaper;$('fecharCaderno').disabled=closed;
 if(closed)$('contador').textContent='Capa';
 renderPhotos();
 renderLeft();
 renderPhotos({photos:state.loosePhotos},$('fotosLivres'),$('fotosLivres'));
}
function renderLeft(){
 const paper=$('folhaEsquerda'),p=state.pages[current-1]||state.guard;paper.replaceChildren();
 paper.classList.toggle('pagina-guarda',ehGuarda(p));
 paper.classList.toggle('guarda-fixa',p===state.guard);
 const edge=document.createElement('button');edge.className='margem margem-esquerda';edge.setAttribute('aria-label','Voltar ou fechar o caderno');paper.append(edge);bindEdge(edge,-1);
 if(!p||ehGuarda(p)){const inside=document.createElement('div');inside.className='guarda-papel';inside.setAttribute('aria-label','Folha de guarda branca');paper.append(inside);if(p&&p!==state.guard){const mural=document.createElement('div');mural.className='mural';paper.append(mural);renderPhotos(p,mural,paper);}return;}
 const head=document.createElement('div');head.className='cabecalho-folha';head.textContent=p.date.split('-').reverse().join(' / ');paper.append(head);
 for(const [tag,key] of [['h2','title'],['div','text']]){const el=document.createElement(tag);el.className=key==='text'?'texto-esquerdo':'';el.dataset.placeholder=key==='text'?'Escreva nesta página…':'Título';el.contentEditable='plaintext-only';el.setAttribute('role','textbox');el.setAttribute('aria-label',key==='text'?'Texto da página esquerda':'Título da página esquerda');writeRich(el,p,key);el.oninput=e=>flowInput(p,el,e,key);el.oncompositionend=e=>flowInput(p,el,e,key);paper.append(el);attachTextBox(el,p,key);}
 const mural=document.createElement('div');mural.className='mural';paper.append(mural);renderPhotos(p,mural,paper);
 const foot=document.createElement('div');foot.className='rodape-folha';foot.textContent=state.name+' · '+numeroDeConteudo(current-1);paper.append(foot);
}
function transferPhoto(source,target,photo){
 if(source.photos===target.photos)return;
 const index=source.photos.indexOf(photo);if(index<0)throw Error('Fotografia não encontrada na origem');
 source.photos.splice(index,1);target.photos.push(photo);
}
function larguraDaFoto(f){return Math.max(100,Math.min(600,Number(f?.width)||230));}
function enlarge(f){$('ampliacao').querySelector('img').src=f.src;$('ampliacao').querySelector('img').alt=f.caption||'Fotografia ampliada';$('ampliacao').querySelector('figcaption').textContent=f.caption;$('ampliacao').showModal();}
function renderPhotos(page=atual(),mural=$('mural'),paper=document.querySelector('.folha')){
 mural.replaceChildren();
 const sizePaper=()=>{};
 page.photos.forEach(f=>{
  const card=document.createElement('div');card.className='polaroid';card.style.left=f.x+'%';card.style.top=f.y+'px';card.style.width=larguraDaFoto(f)+'px';card.style.setProperty('--giro',f.angle+'deg');if(mural.id==='fotosLivres'){card.style.left=(f.deskX||0)+'px';card.style.top=(f.deskY||0)+'px';}
  const figure=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src=f.src;img.alt=f.caption||'Fotografia do caderno';cap.textContent=f.caption;cap.contentEditable='plaintext-only';cap.setAttribute('aria-label','Legenda da fotografia');cap.dataset.placeholder='Escreva uma legenda';cap.oninput=()=>{f.caption=cap.innerText.slice(0,250);persist();};figure.append(img,cap);card.append(figure);
  card.tabIndex=0;card.setAttribute('aria-label','Fotografia: arraste para mover; setas do teclado movem; Enter amplia');
  const rotate=document.createElement('button');rotate.className='girar-foto';rotate.textContent='↻';rotate.title='Arraste para girar · use ← e → pelo teclado';rotate.setAttribute('aria-label','Girar fotografia');card.append(rotate);
  let rotation=null;
  rotate.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const rect=card.getBoundingClientRect();const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;rotation={cx,cy,start:Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI,angle:f.angle};rotate.setPointerCapture(e.pointerId);};
  rotate.onpointermove=e=>{if(!rotation)return;e.stopPropagation();const a=Math.atan2(e.clientY-rotation.cy,e.clientX-rotation.cx)*180/Math.PI;f.angle=((rotation.angle+a-rotation.start+540)%360)-180;card.style.setProperty('--giro',f.angle+'deg');};
  rotate.onpointerup=rotate.onpointercancel=e=>{e.stopPropagation();if(rotation){rotation=null;persist();}};
  rotate.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();f.angle=Math.max(-180,Math.min(180,f.angle+(e.key==='ArrowRight'?3:-3)));card.style.setProperty('--giro',f.angle+'deg');persist();};
  const remove=document.createElement('button');remove.className='retirar-foto';remove.textContent='×';remove.title='Retirar fotografia';remove.setAttribute('aria-label','Retirar fotografia');remove.onclick=()=>{if(confirm('Retirar esta fotografia da página?')){page.photos.splice(page.photos.indexOf(f),1);renderPhotos(page,mural,paper);persist();}};card.append(remove);mural.append(card);
  card.onkeydown=e=>{if(e.target!==card)return;if(e.key==='Enter'){enlarge(f);return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();f.x=Math.max(0,Math.min(53,f.x+({'ArrowLeft':-2,'ArrowRight':2}[e.key]||0)));f.y=Math.max(0,Math.min(10000,f.y+({'ArrowUp':-10,'ArrowDown':10}[e.key]||0)));card.style.left=f.x+'%';card.style.top=f.y+'px';sizePaper();persist();};
  let drag=null,moved=false;
  card.onpointerdown=e=>{if(e.target.closest('button,[contenteditable]')||e.button!==0)return;e.preventDefault();const rect=card.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:f.x,top:f.y,rect:{left:rect.left+rect.width/2-card.offsetWidth/2,top:rect.top+rect.height/2-card.offsetHeight/2,width:card.offsetWidth}};moved=false;card.setPointerCapture(e.pointerId);};
  card.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(!moved)return;if(card.parentElement!==$('fotosLivres')){$('fotosLivres').append(card);card.setPointerCapture(e.pointerId);}card.style.position='fixed';card.style.width=drag.rect.width+'px';card.style.left=drag.rect.left+dx+'px';card.style.top=drag.rect.top+dy+'px';card.style.zIndex='1000';if(e.clientY<70)window.scrollBy(0,-24);else if(e.clientY>window.innerHeight-70)window.scrollBy(0,24);};
  card.onpointerup=e=>{if(!drag)return;const original=drag;drag=null;if(!moved){enlarge(f);return;}
   let target=null,zone=null;
   if(!closed)for(const [element,owner] of [[document.querySelector('.folha'),atual()],[$('folhaEsquerda'),state.pages[current-1]||state.guard]]){if(owner===state.guard||owner===state.pages[0])continue;const r=element.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){target=owner;zone=element.querySelector('.mural')||$('mural');break;}}
   if(!target){target={photos:state.loosePhotos};zone=$('fotosLivres');}
   if(target.photos!==page.photos&&target.photos.length>=30){avisar('Esta página está cheia; a foto voltou à origem.');render();return;}
   transferPhoto(page,target,f);
   const r=zone.getBoundingClientRect();f.x=Math.max(0,Math.min(53,100*(e.clientX-r.left-(original.x-original.rect.left))/Math.max(1,r.width)));f.y=Math.max(0,Math.min(10000,e.clientY-r.top-(original.y-original.rect.top)));f.width=larguraDaFoto({width:original.rect.width});
   if(zone.id==='fotosLivres'){f.deskX=Math.max(0,e.clientX-(original.x-original.rect.left)+window.scrollX);f.deskY=Math.max(0,e.clientY-(original.y-original.rect.top)+window.scrollY);}
   render();persist();
  };card.onpointercancel=()=>{drag=null;render();};

 });
}
function previewPhoto(photo,mural){
 const card=document.createElement('div');card.className='polaroid';card.style.left=photo.x+'%';card.style.top=photo.y+'px';card.style.width=larguraDaFoto(photo)+'px';card.style.setProperty('--giro',photo.angle+'deg');
 const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=photo.src;img.alt=photo.caption||'Fotografia do caderno';caption.textContent=photo.caption;figure.append(img,caption);card.append(figure);mural.append(card);
}
function previewPage(page,side,index){
 const paper=document.createElement('article');paper.className=(side==='left'?'pagina-esquerda':'folha')+' folha-previa';
 if(!page||ehGuarda(page)){paper.classList.add('pagina-guarda');if(index<=0)paper.classList.add('guarda-fixa');const blank=document.createElement('div');blank.className='guarda-papel';paper.append(blank);if(index>0){const mural=document.createElement('div');mural.className='mural';paper.append(mural);(page?.photos||[]).forEach(photo=>previewPhoto(photo,mural));}return paper;}
 const head=document.createElement('div');head.className='cabecalho-folha';head.textContent=page.date?page.date.split('-').reverse().join(' / '):'';paper.append(head);
 for(const [tag,key] of [['h2','title'],['div','text']]){const wrapper=document.createElement('div'),content=document.createElement(tag),position=page.positions?.[key]||{};wrapper.className='caixa-texto';wrapper.style.width=position.width?position.width+'px':'';wrapper.style.transform=`translate(${position.x||0}px,${position.y||0}px)`;content.className=key==='text'?'texto-previa':'';content.innerHTML=richHTML(page,key);wrapper.append(content);paper.append(wrapper);}
 const mural=document.createElement('div');mural.className='mural';paper.append(mural);page.photos.forEach(photo=>previewPhoto(photo,mural));
 const foot=document.createElement('div');foot.className='rodape-folha';foot.textContent=state.name+(ehGuarda(page)?'':' · '+String(numeroDeConteudo(index)).padStart(2,'0'));paper.append(foot);return paper;
}
function turnTransform(angle,insideBook=false){return (insideBook?'':'perspective(1600px) ')+`rotateY(${angle}deg)`;}
function createTurnVisual(delta,paper){
 if(typeof document.createElement!=='function')return null;
 const book=document.querySelector('.encadernacao');if(!book||typeof book.append!=='function'||!paper?.getBoundingClientRect)return null;
 if(closed){
  const leaf=document.createElement('div'),front=paper.cloneNode(true),back=previewPage(state.guard,'left',-1),under=previewPage(state.pages[0]||paginaGuarda(),'right',0);
  leaf.className='folha-virando capa-virando';front.classList.add('folha-face','folha-frente');back.classList.add('folha-face','folha-verso');under.classList.add('folha-subjacente','guarda-sob-capa');
  front.querySelectorAll('.margem').forEach(node=>node.remove());front.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));front.querySelectorAll('button').forEach(node=>node.remove());
  const place=node=>{node.style.left=paper.offsetLeft+'px';node.style.top=paper.offsetTop+'px';node.style.width=paper.offsetWidth+'px';node.style.height=paper.offsetHeight+'px';};place(leaf);place(under);
  leaf.style.transformOrigin='left center';leaf.append(front,back);book.classList.add('capa-em-curso');book.append(under,leaf);paper.style.visibility='hidden';
  let cleaned=false;return {leaf,setAngle:angle=>{leaf.style.transform=turnTransform(angle,true);},cleanup:()=>{if(cleaned)return;cleaned=true;paper.style.visibility='';book.classList.remove('capa-em-curso');leaf.remove();under.remove();}};
 }
 if(delta<0&&current===0){
  const stationary=document.querySelector('.folha'),leaf=document.createElement('div'),front=paper.cloneNode(true),back=$('capa').cloneNode(true),under=stationary.cloneNode(true);
  leaf.className='folha-virando capa-fechando';front.classList.add('folha-face','folha-frente');back.removeAttribute('hidden');back.classList.add('folha-face','folha-verso','capa-frente-fechando');
  under.classList.add('folha-subjacente','pagina-direita-fechamento');for(const face of [front,back,under]){face.querySelectorAll('.margem').forEach(node=>node.remove());face.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));face.querySelectorAll('button').forEach(node=>node.remove());}
  const place=node=>{node.style.left=paper.offsetLeft+'px';node.style.top=paper.offsetTop+'px';node.style.width=paper.offsetWidth+'px';node.style.height=paper.offsetHeight+'px';};place(leaf);
  under.style.left=stationary.offsetLeft+'px';under.style.top=stationary.offsetTop+'px';under.style.width=stationary.offsetWidth+'px';under.style.height=stationary.offsetHeight+'px';
  leaf.style.transformOrigin='right center';leaf.append(front,back);book.classList.add('capa-em-curso','fechando-capa');book.append(under,leaf);paper.style.visibility='hidden';
  let cleaned=false;return {leaf,setAngle:angle=>{leaf.style.transform=turnTransform(angle,true);},cleanup:()=>{if(cleaned)return;cleaned=true;paper.style.visibility='';book.classList.remove('capa-em-curso','fechando-capa');leaf.remove();under.remove();}};
 }
 const forward=delta>0,backIndex=forward?current+1:current-2,underIndex=forward?current+2:current-3;
 const backPage=state.pages[backIndex]||paginaGuarda(),underPage=underIndex>=0?state.pages[underIndex]:state.guard;
 const leaf=document.createElement('div'),front=paper.cloneNode(true),back=previewPage(backPage,forward?'left':'right',backIndex),under=previewPage(underPage,forward?'right':'left',underIndex);
 leaf.className='folha-virando';front.classList.add('folha-face','folha-frente');back.classList.add('folha-face','folha-verso');under.classList.add('folha-subjacente');
 front.querySelectorAll('.margem').forEach(node=>node.remove());front.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));front.querySelectorAll('button').forEach(node=>node.remove());
 const place=node=>{node.style.left=paper.offsetLeft+'px';node.style.top=paper.offsetTop+'px';node.style.width=paper.offsetWidth+'px';node.style.height=paper.offsetHeight+'px';};place(leaf);place(under);
 leaf.style.transformOrigin=forward?'left center':'right center';leaf.append(front,back);book.classList.add('virada-em-curso');book.append(under,leaf);paper.style.visibility='hidden';
 let cleaned=false;return {leaf,setAngle:angle=>{leaf.style.transform=turnTransform(angle,true);},cleanup:()=>{if(cleaned)return;cleaned=true;paper.style.visibility='';book.classList.remove('virada-em-curso');leaf.remove();under.remove();}};
}
let runningTurn=null;
function turn(delta,options={}){
 if(turning)return;
 tocarSomFolha();
 const openingCover=closed,paper=openingCover?$('capa'):delta>0?document.querySelector('.folha'):$('folhaEsquerda'),book=document.querySelector('.encadernacao'),visual=options.visual||createTurnVisual(delta,paper),animated=visual?.leaf||paper;turning=true;
 if(openingCover)book?.classList.add('abrindo-capa');
 animated.style.transform='';animated.style.opacity='';animated.style.transformOrigin=delta>0?'left center':'right center';animated.style.zIndex='20';
 const cleanup=()=>{visual?.cleanup();book?.classList.remove('abrindo-capa');animated.style.transform='';animated.style.opacity='';animated.style.zIndex='';};
 const finish=()=>{runningTurn=null;try{if(closed){closed=false;current=0;}else if(delta<0&&current===0)closed=true;else if(delta>0&&options.existingOnly){current=Math.min(current+2,state.pages.length-1);}else if(delta>0){if(current+2<500){const target=current+2;while(state.pages.length<=target)state.pages.push({...pagina(),title:''});current=target;persist();}}else current=Math.max(0,current-2);cleanup();render();}finally{cleanup();turning=false;}};
 if(animated.animate){const insideBook=!!visual?.leaf;runningTurn=animated.animate([{transform:turnTransform(options.startAngle||0,insideBook)},{transform:turnTransform(-delta*180,insideBook)}],{duration:options.fast?140:options.startAngle?Math.max(90,360*(1-Math.abs(options.startAngle)/180)):500,easing:'cubic-bezier(.25,.6,.35,1)',fill:'none'});runningTurn.onfinish=finish;runningTurn.oncancel=()=>{runningTurn=null;cleanup();turning=false;};}else finish();
}
function bindEdge(edge,delta){
 let gesture=null,lastTurn=0,holdTimer=null,repeatTimer=null,held=false;
 const invoke=(options={})=>{if(runningTurn){runningTurn.finish();return;}if(Date.now()-lastTurn<450)return;lastTurn=Date.now();turn(delta,options);};
 const resetGestureVisual=value=>{if(value?.visual)value.visual.cleanup();else if(value?.paper){value.paper.style.transform='';value.paper.style.zIndex='';}if(value?.openingCover)document.querySelector('.encadernacao')?.classList.remove('abrindo-capa');};
 const stop=()=>{clearTimeout(holdTimer);clearTimeout(repeatTimer);holdTimer=repeatTimer=null;window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',cancel);window.removeEventListener('pointermove',move);window.removeEventListener('blur',cancel);};
 const advance=()=>{if(!gesture||!held)return;if(!turning){if(delta>0&&!closed&&current>=state.pages.length-1)return;if(delta<0&&(closed||current===0))return;turn(delta,{fast:true,existingOnly:true,visual:gesture.visual});gesture.visual=null;}repeatTimer=setTimeout(advance,165);};
 const release=e=>{if(!gesture)return;const active=gesture,dx=e.clientX-active.x,wasHeld=held,angle=active.angle||0,visual=active.visual;gesture=null;stop();if(wasHeld){if(runningTurn)runningTurn.cancel();else resetGestureVisual(active);held=false;return;}if(Math.abs(dx)<8||-delta*dx>35)invoke({startAngle:angle,visual});else resetGestureVisual(active);};
 const cancel=()=>{const active=gesture;gesture=null;stop();if(held&&runningTurn)runningTurn.cancel();else resetGestureVisual(active);held=false;};
 const move=e=>{if(!gesture||held)return;if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>12){clearTimeout(holdTimer);holdTimer=null;}const progress=Math.max(0,Math.min(1,-delta*(e.clientX-gesture.x)/(gesture.width*2)));gesture.angle=-delta*Math.acos(1-2*progress)*180/Math.PI;if(gesture.visual)gesture.visual.setAngle(gesture.angle);else{gesture.paper.style.transformOrigin=delta>0?'left center':'right center';gesture.paper.style.zIndex='20';gesture.paper.style.transform='perspective(1600px) rotateY('+gesture.angle+'deg)';}};
 edge.onpointerdown=e=>{if(e.button!==0||turning)return;const openingCover=closed,paper=openingCover?$('capa'):delta>0?document.querySelector('.folha'):$('folhaEsquerda');if(openingCover)document.querySelector('.encadernacao')?.classList.add('abrindo-capa');gesture={x:e.clientX,y:e.clientY,paper,width:paper.getBoundingClientRect().width,angle:0,visual:createTurnVisual(delta,paper),openingCover};held=false;edge.setPointerCapture(e.pointerId);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',cancel);window.addEventListener('pointermove',move);window.addEventListener('blur',cancel);const r=edge.getBoundingClientRect();if(e.clientY-r.top<=56||r.bottom-e.clientY<=56)holdTimer=setTimeout(()=>{if(!gesture)return;held=true;advance();},2000);};
 edge.onpointerup=release;edge.onpointercancel=cancel;
 edge.onclick=e=>{if(e.detail===0)invoke();};
 edge.ondblclick=e=>{e.preventDefault();if(runningTurn)runningTurn.finish();else if(Date.now()-lastTurn>=450)invoke();};
 edge.title=delta>0?'Clique para virar; segure uma ponta por 2 segundos para ir à última página':'Clique para voltar; segure uma ponta por 2 segundos para ir à primeira página';
}
function download(name,body,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function exportReader(){
 const pages=paginasSelecionadas();if(!pages.length){alert('Marque pelo menos uma abertura para incluir na exportação de leitura.');return false;}
 const html=pages.map((p,i)=>`<article style="min-height:${Math.max(720,...p.photos.map(f=>f.y+460))}px" ${i?'hidden':''}><small>${escapeHTML(p.date)}</small><h1 style="transform:translate(${p.positions?.title?.x||0}px,${p.positions?.title?.y||0}px)">${richHTML(p,'title')}</h1><div class="texto" style="transform:translate(${p.positions?.text?.x||0}px,${p.positions?.text?.y||0}px)">${richHTML(p,'text')}</div><section style="height:${Math.max(360,...p.photos.map(f=>f.y+330))}px">${p.photos.map(f=>`<button class="foto" style="left:${f.x}%;top:${f.y}px;width:${larguraDaFoto(f)}px;transform:rotate(${f.angle}deg)"><img src="${f.src}" alt="${escapeHTML(f.caption||'Fotografia')}"><span>${escapeHTML(f.caption)}</span></button>`).join('')}</section><footer>${escapeHTML(state.name)} · ${i+1}</footer></article>`).join('');
 const css='*{scrollbar-color:#F2992E transparent}::-webkit-scrollbar{width:5px;height:5px;background:transparent}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:#F2992E;border-radius:999px}article{position:relative;min-height:720px;padding-bottom:360px}article>section{position:absolute!important;inset:0 0 auto;margin:0!important;pointer-events:none}article .foto{pointer-events:auto}article>footer{position:absolute;bottom:0}*{box-sizing:border-box}body{margin:0;padding:28px 15px;background:#11273c;color:#243b44;font-family:Georgia,serif}main{max-width:760px;margin:auto;background:#f4efdf;padding:35px;box-shadow:5px 8px #d5cbb5;border-radius:6px}h1{font-size:36px}.texto{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:18px}section{position:relative;margin-top:28px}.foto{position:absolute;width:47%;border:0;padding:10px;background:#fffdf6;box-shadow:2px 5px 12px #0003;cursor:pointer}.foto img{width:100%;height:170px;object-fit:cover}.foto span{display:block;padding:15px 0;font:italic 14px Georgia;overflow-wrap:anywhere}footer,small{font:12px system-ui}nav{text-align:center;margin:25px;color:#fff}nav button,dialog button{padding:10px 20px;margin:0 15px;cursor:pointer}dialog{max-width:94vw;max-height:94vh;background:#fffdf6;border:0;padding:18px}dialog::backdrop{background:#000d}dialog img{display:block;max-width:82vw;max-height:75vh}dialog p{text-align:center}button:focus-visible{outline:3px solid #f2992e}@media(max-width:500px){main{padding:20px}.foto img{height:120px}}';
 const script=`let n=0;const pages=[...document.querySelectorAll('article')],prev=document.getElementById('prev'),next=document.getElementById('next'),count=document.getElementById('count'),dialog=document.querySelector('dialog');function show(){pages.forEach((p,i)=>p.hidden=i!==n);prev.disabled=n===0;next.disabled=n===pages.length-1;count.textContent=(n+1)+' / '+pages.length;}prev.onclick=()=>{n--;show()};next.onclick=()=>{n++;show()};document.querySelectorAll('.foto').forEach(b=>b.onclick=()=>{dialog.querySelector('img').src=b.querySelector('img').src;dialog.querySelector('img').alt=b.querySelector('img').alt;dialog.querySelector('p').textContent=b.querySelector('span').textContent;dialog.showModal()});document.getElementById('close').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});show();`;
 download('caderno-leitura.html',`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(state.name)}</title><style>${css}</style><main>${html}</main><nav><button id="prev" aria-label="Página anterior">←</button><span id="count"></span><button id="next" aria-label="Próxima página">→</button></nav><dialog><button id="close">Fechar ×</button><img alt=""><p></p></dialog><script>${script}<\/script></html>`,'text/html');
 avisar(`${pages.length} página(s) exportada(s) para leitura`);
 return true;
}
function createTrackpadPager(navigate,isBusy=()=>false){
 let distance=0,lastTime=null,latched=false;
 return event=>{
  if(event.ctrlKey||event.metaKey)return;
  const dx=event.deltaX||(event.shiftKey?event.deltaY:0),dy=event.shiftKey?0:event.deltaY;
  if(!dx||Math.abs(dx)<Math.abs(dy)*.85)return;
  event.preventDefault();
  if(lastTime===null||event.timeStamp-lastTime>240){distance=0;latched=false;}
  lastTime=event.timeStamp;
  if(latched)return;
  if(isBusy()){latched=true;return;}
  const factor=event.deltaMode===1?16:event.deltaMode===2?600:1;
  if(distance&&Math.sign(distance)!==Math.sign(dx))distance=0;
  distance+=dx*factor;
  if(Math.abs(distance)<14)return;
  latched=true;navigate(distance>0?1:-1);
 };
}
function primeiraAberturaComConteudo(){
 const target=state.pages.findIndex(page=>!ehGuarda(page));
 if(target<0)return 0;
 return Math.min(target%2===0?target:target+1,Math.max(0,state.pages.length-1));
}
function paginaInicialPelaURL(){
 const fallback=primeiraAberturaComConteudo();
 if(typeof location==='undefined')return fallback;
 const raw=new URLSearchParams(location.search).get('pagina');
 if(!raw)return fallback;
 const requested=Math.trunc(Number(raw));if(!Number.isFinite(requested)||requested<1)return fallback;
 const contentIndices=state.pages.map((page,index)=>ehGuarda(page)?-1:index).filter(index=>index>=0),target=contentIndices[Math.min(requested,contentIndices.length)-1];
 if(target===undefined)return fallback;return Math.min(target%2===0?target:target+1,state.pages.length-1);
}
const chaveSom='rebojar-caderno-som-v1';
let somAtivo=true,contextoSom=null;
try{const salvo=localStorage.getItem(chaveSom);if(salvo!==null)somAtivo=salvo==='1';}catch{}
function atualizarBotaoSom(){
 const button=$('somEfeitos');if(!button)return;
 button.setAttribute('aria-pressed',String(somAtivo));button.setAttribute('aria-label',somAtivo?'Desativar sons do caderno':'Ativar sons do caderno');button.title=somAtivo?'Sons ligados':'Sons desligados';button.classList.toggle('som-desligado',!somAtivo);
}
function tocarSomFolha(){
 if(!somAtivo||typeof window==='undefined')return;
 const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
 try{
  contextoSom??=new AudioContext();if(contextoSom.state==='suspended')contextoSom.resume();
  const duration=.52,length=Math.floor(contextoSom.sampleRate*duration),buffer=contextoSom.createBuffer(1,length,contextoSom.sampleRate),data=buffer.getChannelData(0);let softened=0;
  for(let i=0;i<length;i++){const t=i/contextoSom.sampleRate,white=Math.random()*2-1;softened=softened*.76+white*.24;const rise=Math.min(1,t/.055),fall=Math.exp(-t*4.1),flutter=.72+.28*Math.sin(t*94);data[i]=softened*rise*fall*flutter*.48;}
  const source=contextoSom.createBufferSource(),band=contextoSom.createBiquadFilter(),air=contextoSom.createBiquadFilter(),gain=contextoSom.createGain();source.buffer=buffer;band.type='bandpass';band.frequency.setValueAtTime(1450,contextoSom.currentTime);band.frequency.exponentialRampToValueAtTime(520,contextoSom.currentTime+duration);band.Q.value=.55;air.type='lowpass';air.frequency.value=4200;gain.gain.setValueAtTime(.0001,contextoSom.currentTime);gain.gain.exponentialRampToValueAtTime(.34,contextoSom.currentTime+.025);gain.gain.exponentialRampToValueAtTime(.0001,contextoSom.currentTime+duration);source.connect(band).connect(air).connect(gain).connect(contextoSom.destination);source.start();source.stop(contextoSom.currentTime+duration);
 }catch{}
}
// Eventos da interface
const handleNotebookWheel=createTrackpadPager(direction=>{
 if(closed&&direction<0)return;
 clearSpreadSelection();turn(direction);
},()=>turning);
window.addEventListener('wheel',event=>{
 if(event.target.closest?.('.editor-texto,dialog'))return;
 const area=document.querySelector('.mesa').getBoundingClientRect();
 if(event.clientX<area.left||event.clientX>area.right||event.clientY<area.top||event.clientY>area.bottom)return;
 handleNotebookWheel(event);
},{passive:false,capture:true});
for(const [input,key] of [['tituloVista','title'],['palavras','text']])$(input).oninput=e=>flowInput(atual(),$(input),e,key);
$('tituloVista').oncompositionend=e=>flowInput(atual(),$('tituloVista'),e,'title');
$('palavras').oncompositionend=e=>flowInput(atual(),$('palavras'),e);
$('nome').oninput=()=>{state.name=$('nome').innerText.slice(0,100);$('nomeVista').textContent=state.name;persist();};$('data').onchange=()=>{if(ehGuarda(atual()))return;atual().date=$('data').value;render();persist();};$('publicar').onchange=()=>{paginasDaAbertura().filter(page=>!ehGuarda(page)).forEach(page=>page.publish=$('publicar').checked);persist();};
$('mostrarEstojoPublicacao').onchange=()=>{state.showToolsInPublication=$('mostrarEstojoPublicacao').checked;persist();};
$('somEfeitos').onclick=()=>{somAtivo=!somAtivo;try{localStorage.setItem(chaveSom,somAtivo?'1':'0');}catch{}atualizarBotaoSom();if(somAtivo)tocarSomFolha();};
$('estojoTitulo').oninput=()=>{state.pencilCase??={};state.pencilCase.title=$('estojoTitulo').innerText.slice(0,80);persist();};
$('estojoSubtitulo').oninput=()=>{state.pencilCase??={};state.pencilCase.subtitle=$('estojoSubtitulo').innerText.slice(0,120);persist();};
for(const field of [$('estojoTitulo'),$('estojoSubtitulo')]){field.onpointerdown=event=>event.stopPropagation();field.ondblclick=event=>event.stopPropagation();field.onkeydown=event=>event.stopPropagation();}
$('fecharCaderno').onclick=()=>{closed=true;render();$('nome').focus();};
for(const [element,key] of [['capaLinha','eyebrow'],['capaSubtitulo','subtitle']])$(element).oninput=()=>{state.cover??={...defaultCover};state.cover[key]=$(element).innerText;persist();};
bindEdge($('margemCapa'),1);bindEdge($('margemDireita'),1);
$('excluir').onclick=()=>{if(ehGuarda(atual()))return;if(!confirm('Excluir esta página e suas fotografias? Guarde uma cópia primeiro se quiser preservá-la.'))return;state.pages.splice(current,1);if(state.pages.filter(page=>!ehGuarda(page)).length===0)state.pages.push(pagina());current=Math.min(current,Math.floor((state.pages.length-1)/2)*2);render();persist();};
$('anterior').onclick=()=>turn(-1);$('proxima').onclick=()=>turn(1);$('fechar').onclick=()=>$('ampliacao').close();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
function recursoDoAplicativo(){
 if(!publicDemo)return false;
 const message='Guardar, abrir cópias e exportar são recursos do aplicativo Caderno de Bordo.';
 avisar('Recurso disponível no aplicativo Caderno de Bordo');alert(message);return true;
}
const alfabetoApoio='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function criarCodigoApoio(){
 const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);let value='';for(const byte of bytes)value+=alfabetoApoio[byte%alfabetoApoio.length];return 'CDB-'+value.slice(0,4)+'-'+value.slice(4,8)+'-'+value.slice(8,12);
}
let codigoApoio='',consultaApoio=null,stripePromise=null,stripeCheckout=null;
function obterCodigoApoio(){
 if(codigoApoio)return codigoApoio;
 try{codigoApoio=sessionStorage.getItem('rebojar-codigo-apoio')||'';}catch{}
 if(!/^CDB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codigoApoio)){codigoApoio=criarCodigoApoio();try{sessionStorage.setItem('rebojar-codigo-apoio',codigoApoio);}catch{}}
 return codigoApoio;
}
function mostrarEstadoApoio(message,kind=''){$('estadoApoio').textContent=message;$('estadoApoio').dataset.estado=kind;}
async function conferirApoio({silencioso=false}={}){
 const endpoint=String(appConfig.paymentEndpoint||'').replace(/\/$/,'');
 if(!endpoint){if(!silencioso)mostrarEstadoApoio('A confirmação automática ainda está sendo preparada. Nenhuma cobrança foi liberada.','erro');return false;}
 if(!paginasSelecionadas().length){if(!silencioso)mostrarEstadoApoio('Marque uma abertura para exportar antes de apoiar.','erro');return false;}
 if(!silencioso)mostrarEstadoApoio('Conferindo o pagamento…','espera');
 try{
  const response=await fetch(endpoint+'/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({claim:obterCodigoApoio()})});
  const result=await response.json().catch(()=>({}));
  if(response.ok&&result.ok){clearTimeout(consultaApoio);consultaApoio=null;if(result.plan==='monthly'&&result.accessToken){try{localStorage.setItem('rebojar-acesso-mensal',result.accessToken);}catch{}}mostrarEstadoApoio(result.plan==='monthly'?'Assinatura confirmada. As exportações estão liberadas neste navegador.':'Pagamento confirmado. Preparando sua exportação…','sucesso');$('pedagioExportacao').close();const exported=exportReader();if(exported){codigoApoio='';try{sessionStorage.removeItem('rebojar-codigo-apoio');}catch{}}return exported;}
  if(response.status===409){mostrarEstadoApoio(result.message||'Esta compra já foi utilizada.','erro');return false;}
  if(!silencioso)mostrarEstadoApoio(result.message||'O pagamento ainda não apareceu. Aguarde alguns segundos e confira novamente.','espera');
 }catch{if(!silencioso)mostrarEstadoApoio('Não foi possível consultar agora. Verifique a conexão e tente novamente.','erro');}
 return false;
}
async function conferirAssinatura(){
 const endpoint=String(appConfig.paymentEndpoint||'').replace(/\/$/,'');let token='';try{token=localStorage.getItem('rebojar-acesso-mensal')||'';}catch{}
 if(!endpoint||!token)return false;
 try{const response=await fetch(endpoint+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken:token})});const result=await response.json().catch(()=>({}));if(response.ok&&result.active)return true;}catch{return false;}
 try{localStorage.removeItem('rebojar-acesso-mensal');}catch{}return false;
}
function carregarStripe(){
 if(window.Stripe)return Promise.resolve(window.Stripe);
 if(stripePromise)return stripePromise;
 stripePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.stripe.com/v3/';script.async=true;script.onload=()=>window.Stripe?resolve(window.Stripe):reject(Error('Stripe indisponível'));script.onerror=()=>reject(Error('Stripe indisponível'));document.head.append(script);});
 return stripePromise;
}
async function limparCheckout(){
 clearTimeout(consultaApoio);consultaApoio=null;
 if(stripeCheckout){try{await stripeCheckout.destroy();}catch{}stripeCheckout=null;}
 $('stripeCheckout').replaceChildren();$('stripeCheckout').hidden=true;$('opcoesPagamento').hidden=false;$('voltarPlanos').hidden=true;
}
async function fecharPagamento(){$('pedagioExportacao').close();}
$('fecharPedagio').onclick=fecharPagamento;
$('pedagioExportacao').addEventListener('close',()=>limparCheckout());
$('voltarPlanos').onclick=()=>{limparCheckout();mostrarEstadoApoio('','');};
async function acompanharApoio(){
 clearTimeout(consultaApoio);let attempts=0;
 const check=async()=>{attempts++;if(await conferirApoio({silencioso:attempts<3}))return;if(attempts>=30){consultaApoio=null;mostrarEstadoApoio('O pagamento foi concluído, mas a confirmação está demorando. Aguarde um instante e tente novamente.','espera');return;}consultaApoio=setTimeout(check,1500);};
 await check();
}
async function abrirCheckout(plan){
 const endpoint=String(appConfig.paymentEndpoint||'').replace(/\/$/,'');
 if(!endpoint){mostrarEstadoApoio('Os pagamentos ainda estão sendo preparados. Nenhuma cobrança foi iniciada.','erro');return;}
 mostrarEstadoApoio('Preparando o pagamento seguro…','espera');$('comprarAvulsa').disabled=true;$('assinarMensal').disabled=true;
 try{
  const [StripeClass,publicResponse,sessionResponse]=await Promise.all([
   carregarStripe(),
   fetch(endpoint+'/public-config'),
   fetch(endpoint+'/create-checkout-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,claim:obterCodigoApoio()})})
  ]);
  const publicConfig=await publicResponse.json().catch(()=>({})),session=await sessionResponse.json().catch(()=>({}));
  if(!publicResponse.ok||!sessionResponse.ok||!publicConfig.publishableKey||!session.clientSecret)throw Error(session.message||publicConfig.message||'Não foi possível iniciar o pagamento.');
  $('opcoesPagamento').hidden=true;$('stripeCheckout').hidden=false;$('voltarPlanos').hidden=false;
  const stripe=StripeClass(publicConfig.publishableKey);
  stripeCheckout=await stripe.initEmbeddedCheckout({clientSecret:session.clientSecret,onComplete:()=>acompanharApoio()});
  stripeCheckout.mount('#stripeCheckout');mostrarEstadoApoio('','');
 }catch(error){mostrarEstadoApoio(error.message||'Não foi possível abrir o pagamento. Tente novamente.','erro');}
 finally{$('comprarAvulsa').disabled=false;$('assinarMensal').disabled=false;}
}
$('backup').onclick=()=>{if(recursoDoAplicativo())return;download('caderno-copia-'+hoje()+'.json',JSON.stringify(state,null,2),'application/json');};
$('restaurar').onclick=()=>{if(recursoDoAplicativo())return;$('arquivoBackup').click();};
$('exportar').onclick=async()=>{if(publicDemo){if(!paginasSelecionadas().length){alert('Marque pelo menos uma abertura para incluir na exportação de leitura.');return;}avisar('Conferindo acesso à exportação…');if(await conferirAssinatura()){exportReader();return;}await limparCheckout();mostrarEstadoApoio(appConfig.paymentEndpoint?'Escolha uma opção para continuar.':'Os pagamentos ainda estão sendo preparados. Nenhuma cobrança foi liberada.',appConfig.paymentEndpoint?'':'erro');$('pedagioExportacao').showModal();return;}exportReader();};
$('comprarAvulsa').onclick=()=>abrirCheckout('single');
$('assinarMensal').onclick=()=>abrirCheckout('monthly');
$('arquivoBackup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>150*1024*1024)throw Error('Esta cópia é grande demais para abrir aqui (limite de 150 MB).');const restored=validate(JSON.parse(await file.text()));if(confirm('Abrir esta cópia substitui o caderno atual neste navegador. Você já guardou uma cópia do atual?')){state=restored;current=primeiraAberturaComConteudo();render();persist();}}catch(error){alert('Não foi possível abrir: '+error.message);}finally{e.target.value='';}};
let photoTarget=null;
$('foto').onclick=()=>{if(ehGuarda(atual()))return;photoTarget=atual();$('arquivoFoto').click();};
async function readPhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use fotografias JPG, PNG ou WebP.');
 if(file.size>30*1024*1024)throw Error('Cada fotografia deve ter até 30 MB.');
 const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1800/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.86);}finally{URL.revokeObjectURL(url);}
}
$('arquivoFoto').onchange=async e=>{const target=photoTarget||atual();$('foto').disabled=true;try{for(const file of e.target.files){if(target.photos.length>=30)throw Error('Limite de 30 fotografias por página. Crie outra página para continuar.');const src=await readPhoto(file);const i=target.photos.length,width=larguraDaFoto({width:$('mural').getBoundingClientRect().width*.47});target.photos.push({id:id(),src,caption:'',x:i%2?50:0,y:Math.floor(i/2)*290,width,angle:i%2?3:-3});persist();}render();}catch(error){render();alert(error.message);}finally{$('foto').disabled=false;e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(!publicDemo&&dirty){e.preventDefault();e.returnValue='';}});
function setupPencilCase(){
 const panel=document.querySelector('.editor-texto'),cover=$('estojoCapa'),pull=$('ziperPuxador'),track=$('ziperTrilho'),hint=cover?.querySelector('p'),hintKey='rebojar-caderno-estojo-ajuda-v1';
 if(!panel||!cover||!pull||!track||typeof pull.setPointerCapture!=='function')return;
 try{if(localStorage.getItem(hintKey)==='1'&&hint)hint.hidden=true;}catch{}
 let opened=false,opening=false,drag=null,suppressClick=false,revealTimer=null,finishTimer=null;
 const setProgress=value=>cover.style.setProperty('--zip-progress',String(Math.max(0,Math.min(1,value))));
 const rememberHint=()=>{try{localStorage.setItem(hintKey,'1');}catch{}};
 const finish=()=>{clearTimeout(revealTimer);clearTimeout(finishTimer);opened=true;opening=false;panel.classList.remove('estojo-aguardando','estojo-abrindo');cover.hidden=true;cover.removeAttribute('aria-busy');};
 const open=skip=>{if(opened)return;rememberHint();if(skip){finish();return;}if(opening)return;opening=true;panel.classList.add('estojo-abrindo');cover.setAttribute('aria-busy','true');requestAnimationFrame(()=>setProgress(1));revealTimer=setTimeout(()=>panel.classList.remove('estojo-aguardando'),560);finishTimer=setTimeout(finish,1360);};
 pull.onpointerdown=e=>{if(opened||opening||e.button!==0)return;e.preventDefault();const rect=track.getBoundingClientRect();drag={left:rect.left,width:Math.max(1,rect.width),moved:false};pull.setPointerCapture(e.pointerId);};
 pull.onpointermove=e=>{if(!drag)return;const progress=(e.clientX-drag.left)/drag.width;drag.moved=drag.moved||Math.abs(progress)>0.04;setProgress(progress);};
 pull.onpointerup=e=>{if(!drag)return;const wasMoved=drag.moved,rect=track.getBoundingClientRect(),progress=(e.clientX-rect.left)/Math.max(1,rect.width);drag=null;suppressClick=wasMoved;if(progress>=.52)open(false);else setProgress(0);};
 pull.onpointercancel=()=>{drag=null;setProgress(0);};
 pull.onclick=()=>{if(suppressClick){suppressClick=false;return;}open(false);};
 cover.ondblclick=e=>{if(e.target.closest?.('[contenteditable]'))return;e.preventDefault();open(true);};
 cover.onkeydown=e=>{if(e.target.closest?.('[contenteditable]'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();open(false);}};
}
async function init(){
 current=primeiraAberturaComConteudo();atualizarBotaoSom();render();document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
 if(publicDemo){
   try{state=validate(appConfig.initialState||defaultState);current=paginaInicialPelaURL();}
  catch(error){console.error(error);state=validate(defaultState);}
  document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);
   for(const name of ['backup','restaurar']){$(name).disabled=true;$(name).setAttribute('aria-disabled','true');$(name).title='Disponível no aplicativo Caderno de Bordo';}
   $('exportar').removeAttribute('aria-disabled');$('exportar').title='Apoie o projeto para fazer uma exportação desta visita';
   render();avisar('Demonstração pública · alterações somem ao recarregar · exportação com apoio');requestAnimationFrame(paginateSavedTitles);return;
 }
 try{db=await new Promise((resolve,reject)=>{const req=indexedDB.open('rebojar-caderno-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('caderno');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Armazenamento ocupado'));});const saved=await new Promise((resolve,reject)=>{const req=db.transaction('caderno').objectStore('caderno').get('principal');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(saved){const parsed=JSON.parse(saved),migrated=Number(parsed.layoutVersion)!==2||parsed.pages?.[0]?.kind!=='endpaper'||parsed.pages?.[1]?.kind!=='endpaper';state=validate(parsed);current=primeiraAberturaComConteudo();render();if(migrated)persist();}avisar('Caderno local · pronto para editar');}catch{db=null;avisar('Use Guardar cópia para preservar suas alterações');}
 finally{document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);render();requestAnimationFrame(paginateSavedTitles);}
}
setupPencilCase();
init();
