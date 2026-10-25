/* Caderno local: sem serviços externos, rastreamento ou dependências. */
'use strict';
const $ = id => document.getElementById(id);
const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random();
const hoje = () => new Date().toLocaleDateString('en-CA');
const rotuloPadrao='REBOJAR / REGISTROS';
const pagina = () => ({id:id(),title:'Um novo registro',date:hoje(),recordLabel:rotuloPadrao,text:'',publish:false,photos:[]});
const paginaGuarda = () => ({id:id(),kind:'endpaper',title:'',date:'',text:'',publish:false,photos:[]});
const ehGuarda = page => page?.kind==='endpaper';
const guardaFixa = page => ({...paginaGuarda(),id:String(page?.id||id()).slice(0,100)});
const appConfig=typeof window==='undefined'?{}:(window.CADERNO_CONFIG||{});
const publicDemo=appConfig.mode==='publico';
/* REBOJAR: INÍCIO — CHAVE E BLOQUEIO DO MODO COMERCIAL EM MANUTENÇÃO
   true  = mostra a proposta, mas bloqueia conta, assinatura, Stripe e exportação paga.
   false = devolve o controle aos fluxos comerciais existentes.
   Antes de mudar para false, valide preços, textos legais, autenticação, checkout e reembolso. */
const MODO_COMERCIAL_EM_MANUTENCAO=true;
const MENSAGEM_COMERCIAL_EM_MANUTENCAO='Conta, assinatura e exportação paga são propostas futuras e ainda não estão disponíveis. Nenhuma cobrança foi iniciada.';

function aplicarModoComercialEmManutencao(){
 if(!publicDemo||!MODO_COMERCIAL_EM_MANUTENCAO)return;
 document.documentElement.classList.add('comercial-em-manutencao');
 document.documentElement.dataset.comercial='manutencao';
 const desativados=['comprarAvulsa','assinarMensal','abrirContaPagamento','gerenciarAssinatura','sairConta','esqueciSenha'];
 for(const nome of desativados){
  const controle=$(nome);
  if(!controle)continue;
  controle.disabled=true;
  controle.setAttribute('aria-disabled','true');
 }
 for(const controle of document.querySelectorAll('#formulariosConta input,#formulariosConta button,#redefinirSenha input,#redefinirSenha button')){
  controle.disabled=true;
  controle.setAttribute('aria-disabled','true');
 }
 const formularios=$('formulariosConta');
 if(formularios){formularios.hidden=true;formularios.inert=true;}
 const redefinir=$('redefinirSenha');
 if(redefinir){redefinir.hidden=true;redefinir.inert=true;}
 if($('gerenciarAssinatura'))$('gerenciarAssinatura').hidden=true;
 if($('sairConta'))$('sairConta').hidden=true;
 if($('stripeCheckout')){$('stripeCheckout').hidden=true;$('stripeCheckout').replaceChildren();}
 if($('opcoesPagamento'))$('opcoesPagamento').hidden=false;
 if($('voltarPlanos'))$('voltarPlanos').hidden=true;
 if($('pedagioTitulo'))$('pedagioTitulo').textContent='Exportação em preparação';
 if($('contaTitulo'))$('contaTitulo').textContent='Conta mensal em preparação';
 if($('estadoContaPagamento'))$('estadoContaPagamento').textContent='Conta e assinatura mensal também estão em preparação.';
 if($('estadoConta'))$('estadoConta').textContent='A área comercial está em modo de manutenção.';
 if($('estadoApoio'))mostrarEstadoApoio(MENSAGEM_COMERCIAL_EM_MANUTENCAO,'espera');
 if($('mensagemConta'))mostrarMensagemConta(MENSAGEM_COMERCIAL_EM_MANUTENCAO,'espera');
 if($('conta')){$('conta').textContent='Conta futura';$('conta').title='Conta mensal em preparação';}
 if($('exportar'))$('exportar').title='Prévia da proposta de exportação';
}

function abrirAvisoComercial(destino='exportacao'){
 aplicarModoComercialEmManutencao();
 const dialogo=destino==='conta'?$('contaUsuario'):$('pedagioExportacao');
 if(dialogo&&!dialogo.open)dialogo.showModal();
}

document.addEventListener('click',event=>{
 if(!publicDemo||!MODO_COMERCIAL_EM_MANUTENCAO||!(event.target instanceof Element))return;
 const acao=event.target.closest('#exportar,#conta,#comprarAvulsa,#assinarMensal,#abrirContaPagamento,#gerenciarAssinatura,#sairConta');
 if(!acao)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 abrirAvisoComercial(acao.id==='conta'||acao.id==='abrirContaPagamento'?'conta':'exportacao');
},true);

document.addEventListener('submit',event=>{
 if(!publicDemo||!MODO_COMERCIAL_EM_MANUTENCAO||!(event.target instanceof Element))return;
 if(!event.target.matches('#entrarConta,#criarConta,#redefinirSenha'))return;
 event.preventDefault();
 event.stopImmediatePropagation();
 abrirAvisoComercial('conta');
},true);
/* REBOJAR: FIM — CHAVE E BLOQUEIO DO MODO COMERCIAL EM MANUTENÇÃO */
if(typeof document!=='undefined'&&document.documentElement)document.documentElement.dataset.modo=publicDemo?'publico':'pessoal';
const defaultState={version:1,layoutVersion:2,name:'Caderno de bordo',showToolsInPublication:true,showChestInPublication:true,showShelfInPublication:true,pencilCase:{title:'rebojar',subtitle:'ferramentas do caderno'},pages:[paginaGuarda(),paginaGuarda(),{...pagina(),title:'As coisas que ficam',text:'Um lugar para guardar o que chamou sua atenção.\n\nComece pelas palavras, por uma fotografia ou por um detalhe que você não quer esquecer.',publish:false}]};
const MARCA_RODAPE='Caderno de bordo ・Rebojar ©';
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
 return {kind:p.kind==='endpaper'?'endpaper':undefined,textMeta:cleanTextMeta(p.textMeta),rich:{title:cleanRuns(p.rich?.title,p.title),text:cleanRuns(p.rich?.text,p.text)},positions:Object.fromEntries(['title','text'].map(k=>[k,{width:Math.max(0,Math.min(2000,Number(p.positions?.[k]?.width)||0)),x:Math.max(-1000,Math.min(1000,Number(p.positions?.[k]?.x)||0)),y:Math.max(-1000,Math.min(1000,Number(p.positions?.[k]?.y)||0))}])),id:String(p.id||id()).slice(0,100),title:p.title.slice(0,100000),date:/^\d{4}-\d{2}-\d{2}$/.test(p.date)?p.date:'',recordLabel:String(p.recordLabel??rotuloPadrao).slice(0,200),text:p.text.slice(0,100000),publish:p.kind==='endpaper'?false:p.publish===true,photos:p.photos.map(f=>{
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
 const publicationView=value.publicationView&&typeof value.publicationView==='object'?{
  pageId:String(value.publicationView.pageId||'').slice(0,100),
  closed:value.publicationView.closed===true,
  soundEnabled:value.publicationView.soundEnabled!==false,
  statusText:String(value.publicationView.statusText||'Caderno local · pronto para editar').slice(0,160)
 }:undefined;
 return {version:1,layoutVersion:2,recentColors:cleanRecentColors(value.recentColors),colorHistory:{text:cleanRecentColors(value.colorHistory?.text),mark:cleanRecentColors(value.colorHistory?.mark)},name:value.name.slice(0,100),showToolsInPublication:value.showToolsInPublication!==false,showChestInPublication:value.showChestInPublication!==false,showShelfInPublication:value.showShelfInPublication!==false,pencilCase:{title:String(value.pencilCase?.title??'rebojar').slice(0,80),subtitle:String(value.pencilCase?.subtitle??'ferramentas do caderno').slice(0,120)},guard:guardaFixa(value.guard),loosePhotos,cover:{eyebrow:String(value.cover?.eyebrow??defaultCover.eyebrow).slice(0,200),subtitle:String(value.cover?.subtitle??defaultCover.subtitle).slice(0,500)},publicationView,pages};
}
function statusDaCopia(){return state.publicationView?.statusText||'Caderno local · pronto para editar';}
function persist(){
 if(publicDemo){dirty=false;avisar(statusDaCopia());return;}
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
 state.showToolsInPublication=state.showToolsInPublication!==false;state.showChestInPublication=state.showChestInPublication!==false;state.showShelfInPublication=state.showShelfInPublication!==false;
 $('mostrarEstojoPublicacao').checked=state.showToolsInPublication;$('mostrarBauPublicacao').checked=state.showChestInPublication;$('publicarEstante').checked=state.showShelfInPublication;
 document.documentElement.classList.toggle('publico-sem-estojo',publicDemo&&!state.showToolsInPublication);document.documentElement.classList.toggle('publico-sem-bau',publicDemo&&!state.showChestInPublication);document.documentElement.classList.toggle('publico-sem-lateral',publicDemo&&!state.showToolsInPublication&&!state.showChestInPublication);$('abrirEstante').hidden=publicDemo&&!state.showShelfInPublication;
 state.pencilCase??={title:'rebojar',subtitle:'ferramentas do caderno'};
 $('capaLinha').textContent=state.cover.eyebrow;$('capaSubtitulo').textContent=state.cover.subtitle;
 const p=atual(),right=document.querySelector('.folha'),endpaper=ehGuarda(p);right.classList.toggle('pagina-guarda',endpaper);right.classList.toggle('guarda-fixa',endpaper&&current===0);$('nome').textContent=state.name;$('data').value=closed?hoje():p.date;$('publicar').checked=!endpaper&&paginasDaAbertura().some(page=>!ehGuarda(page)&&page.publish);
 $('nomeVista').textContent=MARCA_RODAPE;writeRich($('tituloVista'),p,'title');writeRich($('palavras'),p,'text');attachTextBox($('tituloVista'),p,'title');attachTextBox($('palavras'),p,'text');
 $('dataVista').textContent=endpaper?'':p.date?p.date.split('-').reverse().join(' / '):'SEM DATA';$('registroVista').textContent=endpaper?'':p.recordLabel??rotuloPadrao;$('numero').textContent=endpaper?'':String(numeroDeConteudo(current)).padStart(2,'0');$('contador').textContent=endpaper?'Folha de guarda':`${numeroDeConteudo(current)} de ${totalDeConteudo()}`;
 $('anterior').disabled=closed;$('proxima').disabled=closed;
 $('capa').hidden=!closed;document.querySelector('.folha').hidden=closed;$('folhaEsquerda').hidden=closed;
 document.querySelector('.encadernacao').classList.toggle('fechado',closed);
 for(const name of ['foto','data','publicar'])$(name).disabled=closed||endpaper;
 const paginaEsquerda=state.pages[current-1],paginaDireita=state.pages[current];
 $('excluirEsquerda').disabled=closed||!paginaEsquerda||ehGuarda(paginaEsquerda);
 $('excluirDireita').disabled=closed||!paginaDireita||ehGuarda(paginaDireita);
 $('fecharCaderno').disabled=closed;
 if(closed)$('contador').textContent='Capa';
 renderPhotos();
 renderLeft();
 renderPagePeek();
 renderPhotos({photos:state.loosePhotos},$('fotosLivres'),$('fotosLivres'));
}
function renderLeft(){
 const paper=$('folhaEsquerda'),p=state.pages[current-1]||state.guard;paper.replaceChildren();
 paper.classList.toggle('pagina-guarda',ehGuarda(p));
 paper.classList.toggle('guarda-fixa',p===state.guard);
 const edge=document.createElement('button');edge.className='margem margem-esquerda';edge.setAttribute('aria-label','Voltar ou fechar o caderno');paper.append(edge);bindEdge(edge,-1);
 if(!p||ehGuarda(p)){const inside=document.createElement('div');inside.className='guarda-papel';inside.setAttribute('aria-label','Folha de guarda branca');paper.append(inside);if(p&&p!==state.guard){const mural=document.createElement('div');mural.className='mural';paper.append(mural);renderPhotos(p,mural,paper);}return;}
 const head=document.createElement('div'),date=document.createElement('span'),label=document.createElement('span');head.className='cabecalho-folha';date.textContent=p.date?p.date.split('-').reverse().join(' / '):'SEM DATA';label.textContent=p.recordLabel??rotuloPadrao;label.contentEditable='plaintext-only';label.setAttribute('role','textbox');label.setAttribute('aria-label','Identificação desta página');label.oninput=()=>{p.recordLabel=label.innerText.slice(0,200);persist();};head.append(date,label);paper.append(head);
 for(const [tag,key] of [['h2','title'],['div','text']]){const el=document.createElement(tag);el.className=key==='text'?'texto-esquerdo':'';el.dataset.placeholder=key==='text'?'Escreva nesta página…':'Título';el.contentEditable='plaintext-only';el.setAttribute('role','textbox');el.setAttribute('aria-label',key==='text'?'Texto da página esquerda':'Título da página esquerda');writeRich(el,p,key);el.oninput=e=>flowInput(p,el,e,key);el.oncompositionend=e=>flowInput(p,el,e,key);paper.append(el);attachTextBox(el,p,key);}
 const mural=document.createElement('div');mural.className='mural';paper.append(mural);renderPhotos(p,mural,paper);
 const foot=document.createElement('div'),bookName=document.createElement('span'),pageNumber=document.createElement('span');foot.className='rodape-folha';bookName.textContent=MARCA_RODAPE;pageNumber.textContent=String(numeroDeConteudo(current-1)).padStart(2,'0');foot.append(bookName,pageNumber);paper.append(foot);
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
function previewPhoto(photo,mural,mirrored=false){
 const card=document.createElement('div'),width=larguraDaFoto(photo);card.className='polaroid';card.style.left=mirrored?`calc(100% - ${photo.x}% - ${width}px)`:photo.x+'%';card.style.top=photo.y+'px';card.style.width=width+'px';card.style.setProperty('--giro',(mirrored?-photo.angle:photo.angle)+'deg');card.classList.toggle('polaroid-verso',mirrored);
 const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=photo.src;img.alt=photo.caption||'Fotografia do caderno';caption.textContent=photo.caption;figure.append(img,caption);card.append(figure);mural.append(card);
}
function previewPage(page,side,index,mirrorPhotos=false){
 const paper=document.createElement('article');paper.className=(side==='left'?'pagina-esquerda':'folha')+' folha-previa';
 if(!page||ehGuarda(page)){paper.classList.add('pagina-guarda');if(index<=0)paper.classList.add('guarda-fixa');const blank=document.createElement('div');blank.className='guarda-papel';paper.append(blank);if(index>0){const mural=document.createElement('div');mural.className='mural';paper.append(mural);(page?.photos||[]).forEach(photo=>previewPhoto(photo,mural,mirrorPhotos));}return paper;}
 const head=document.createElement('div'),date=document.createElement('span'),label=document.createElement('span');head.className='cabecalho-folha';date.textContent=page.date?page.date.split('-').reverse().join(' / '):'';label.textContent=page.recordLabel??rotuloPadrao;head.append(date,label);paper.append(head);
 for(const [tag,key] of [['h2','title'],['div','text']]){const wrapper=document.createElement('div'),content=document.createElement(tag),position=page.positions?.[key]||{},registry=document.createElement('div'),created=document.createElement('span'),updated=document.createElement('span'),meta=page.textMeta?.[key],format=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'';wrapper.className='caixa-texto';wrapper.style.width=position.width?position.width+'px':'';wrapper.style.transform=`translate(${position.x||0}px,${position.y||0}px)`;content.className=key==='text'?'texto-previa':'';content.innerHTML=richHTML(page,key);registry.className='registro-texto';created.textContent=meta?.finalized?format(meta.createdAt):'';updated.textContent=meta?.finalized?format(meta.updatedAt):'';registry.append(created,updated);wrapper.append(content,registry);paper.append(wrapper);}
 const mural=document.createElement('div');mural.className='mural';paper.append(mural);page.photos.forEach(photo=>previewPhoto(photo,mural,mirrorPhotos));
 const foot=document.createElement('div'),bookName=document.createElement('span'),pageNumber=document.createElement('span');foot.className='rodape-folha';bookName.textContent=MARCA_RODAPE;pageNumber.textContent=String(numeroDeConteudo(index)).padStart(2,'0');foot.append(bookName,pageNumber);paper.append(foot);return paper;
}
function renderPagePeek(){
 const book=document.querySelector('.encadernacao');book?.querySelectorAll('.folha-espreita').forEach(node=>node.remove());
 if(closed||!book)return;
 const papers={left:document.querySelector('.encadernacao>.pagina-esquerda:not(.folha-subjacente)'),right:document.querySelector('.encadernacao>.folha:not(.folha-subjacente)')};
 for(const [side,entries] of Object.entries({left:[[current-3,'fundo'],[current-2,'verso']],right:[[current+2,'fundo'],[current+1,'verso']]})){
  const paper=papers[side];if(!paper)continue;
  for(const [index,kind] of entries){
   const page=index>=0?state.pages[index]:null;if(!page)continue;
   const peek=previewPage(page,side,index,kind==='verso');peek.classList.add('folha-subjacente','folha-espreita','folha-espreita-'+side,'folha-espreita-'+kind);peek.setAttribute('aria-hidden','true');
   peek.style.left=(paper.offsetLeft+(side==='right'?-1:0))+'px';peek.style.top=paper.offsetTop+'px';peek.style.width=(paper.offsetWidth+(side==='right'?1:0))+'px';peek.style.height=paper.offsetHeight+'px';book.append(peek);
  }
 }
}
function turnTransform(angle,insideBook=false){return (insideBook?'':'perspective(4800px) ')+`rotateY(${angle}deg)`;}
function travarViewportDaVirada(){
 const root=document.documentElement;root?.classList.add('folha-em-curso');
 return ()=>root?.classList.remove('folha-em-curso');
}
function createTurnVisual(delta,paper){
 if(typeof document.createElement!=='function')return null;
 document.activeElement?.blur?.();
 const book=document.querySelector('.encadernacao');if(!book||typeof book.append!=='function'||!paper?.getBoundingClientRect)return null;
 if(closed||(delta<0&&current===0))book.querySelectorAll('.folha-espreita').forEach(node=>node.remove());
 if(closed){
  const leaf=document.createElement('div'),front=paper.cloneNode(true),back=previewPage(state.guard,'left',-1),under=previewPage(state.pages[0]||paginaGuarda(),'right',0);
  leaf.className='folha-virando capa-virando';front.classList.add('folha-face','folha-frente');back.classList.add('folha-face','folha-verso');under.classList.add('folha-subjacente','guarda-sob-capa');
  front.querySelectorAll('.margem').forEach(node=>node.remove());front.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));front.querySelectorAll('button').forEach(node=>node.remove());
  const place=node=>{node.style.left=paper.offsetLeft+'px';node.style.top=paper.offsetTop+'px';node.style.width=paper.offsetWidth+'px';node.style.height=paper.offsetHeight+'px';};place(leaf);place(under);
  const spineGap=Math.max(4,Math.min(10,Math.round(paper.offsetWidth*.012)));under.style.left=(paper.offsetLeft+spineGap)+'px';under.style.width=Math.max(1,paper.offsetWidth-spineGap)+'px';under.style.setProperty('--spine-gap',spineGap+'px');
  const destravarViewport=()=>{};leaf.style.transformOrigin='left center';leaf.append(front,back);book.classList.add('capa-em-curso');book.append(under,leaf);paper.style.visibility='hidden';
  let cleaned=false;return {leaf,setAngle:angle=>{leaf.style.transform=turnTransform(angle,true);},cleanup:()=>{if(cleaned)return;cleaned=true;paper.style.visibility='';book.classList.remove('capa-em-curso');leaf.remove();under.remove();destravarViewport();renderPagePeek();}};
 }
 if(delta<0&&current===0){
  const leaf=document.createElement('div'),front=previewPage(state.guard,'left',-1),back=$('capa').cloneNode(true);
  leaf.className='folha-virando capa-fechando';front.classList.add('folha-face','folha-frente','capa-guarda-fechando');back.removeAttribute('hidden');back.classList.add('folha-face','folha-verso','capa-frente-fechando');
  for(const face of [front,back]){face.querySelectorAll('.margem').forEach(node=>node.remove());face.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));face.querySelectorAll('button').forEach(node=>node.remove());}
  const place=node=>{node.style.left=paper.offsetLeft+'px';node.style.top=paper.offsetTop+'px';node.style.width=paper.offsetWidth+'px';node.style.height=paper.offsetHeight+'px';};place(leaf);
  const destravarViewport=()=>{};leaf.style.transformOrigin='right center';leaf.append(front,back);book.classList.add('capa-em-curso','fechando-capa');book.append(leaf);paper.style.visibility='hidden';
  let cleaned=false;return {leaf,setAngle:angle=>{leaf.style.transform=turnTransform(angle,true);},cleanup:()=>{if(cleaned)return;cleaned=true;paper.style.visibility='';book.classList.remove('capa-em-curso','fechando-capa');leaf.remove();destravarViewport();renderPagePeek();}};
 }
 const forward=delta>0,frontIndex=current-1,backIndex=forward?current+1:current-2,underIndex=forward?current+2:current-3;
 const frontPage=frontIndex>=0?state.pages[frontIndex]:state.guard,backPage=state.pages[backIndex]||paginaGuarda(),underPage=underIndex>=0?state.pages[underIndex]:state.guard;
 const leaf=document.createElement('div'),front=paper.cloneNode(true),back=previewPage(backPage,forward?'left':'right',backIndex),under=previewPage(underPage,forward?'right':'left',underIndex),backPhotos=previewPage(backPage,forward?'left':'right',backIndex,true),frontPhotos=null;
 leaf.className='folha-virando';front.classList.add('folha-face','folha-frente');back.classList.add('folha-face','folha-verso');under.classList.add('folha-subjacente');
 if(backPhotos){backPhotos.classList.add('folha-fotos-verso');backPhotos.setAttribute('aria-hidden','true');}
 if(frontPhotos){frontPhotos.classList.add('folha-fotos-frente');frontPhotos.setAttribute('aria-hidden','true');}
 front.querySelectorAll('.margem').forEach(node=>node.remove());front.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));front.querySelectorAll('button').forEach(node=>node.remove());
 const place=node=>{node.style.left=paper.offsetLeft+'px';node.style.top=paper.offsetTop+'px';node.style.width=paper.offsetWidth+'px';node.style.height=paper.offsetHeight+'px';};place(leaf);place(under);
 if(forward){leaf.style.left=(paper.offsetLeft+1)+'px';under.style.left=(paper.offsetLeft-2)+'px';under.style.width=(paper.offsetWidth+2)+'px';}
 if(!forward){leaf.classList.add('folha-retornando');leaf.style.width=(paper.offsetWidth+1)+'px';}
 const destravarViewport=travarViewportDaVirada();leaf.style.transformOrigin=forward?'left center':'right center';if(backPhotos)leaf.append(backPhotos);if(frontPhotos)leaf.append(frontPhotos);leaf.append(front,back);book.classList.add('virada-em-curso',forward?'virada-avanco':'virada-retorno');book.append(under,leaf);paper.style.visibility='hidden';
 let cleaned=false;return {leaf,setAngle:angle=>{leaf.style.transform=turnTransform(angle,true);},cleanup:()=>{if(cleaned)return;cleaned=true;paper.style.visibility='';book.classList.remove('virada-em-curso','virada-avanco','virada-retorno');leaf.remove();under.remove();destravarViewport();renderPagePeek();}};
}
let runningTurn=null;
function turn(delta,options={}){
 if(turning)return;
 const openingCover=closed,book=document.querySelector('.encadernacao');
 tocarSomFolha();
 const paper=openingCover?$('capa'):delta>0?document.querySelector('.folha'):$('folhaEsquerda'),visual=options.visual||createTurnVisual(delta,paper),animated=visual?.leaf||paper;turning=true;
 if(openingCover)book?.classList.add('abrindo-capa');
 animated.style.transform='';animated.style.opacity='';animated.style.transformOrigin=delta>0?'left center':'right center';animated.style.zIndex='20';
 const cleanup=()=>{visual?.cleanup();book?.classList.remove('abrindo-capa');animated.style.transform='';animated.style.opacity='';animated.style.zIndex='';};
 const finish=()=>{runningTurn=null;try{if(closed){closed=false;current=0;}else if(delta<0&&current===0)closed=true;else if(delta>0&&options.existingOnly){current=Math.min(current+2,state.pages.length-1);}else if(delta>0){if(current+2<500){const target=current+2;while(state.pages.length<=target)state.pages.push({...pagina(),title:''});current=target;persist();}}else current=Math.max(0,current-2);cleanup();render();}finally{cleanup();turning=false;}};
 if(animated.animate){const insideBook=!!visual?.leaf,targetAngle=openingCover?-180:-delta*180;runningTurn=animated.animate([{transform:turnTransform(options.startAngle||0,insideBook)},{transform:turnTransform(targetAngle,insideBook)}],{duration:options.fast?140:options.startAngle?Math.max(90,360*(1-Math.abs(options.startAngle)/180)):500,easing:'cubic-bezier(.25,.6,.35,1)',fill:'none'});runningTurn.onfinish=finish;runningTurn.oncancel=()=>{runningTurn=null;cleanup();turning=false;};}else finish();
}
function bindEdge(edge,delta){
 let gesture=null,lastTurn=0,holdTimer=null,repeatTimer=null,held=false;
 const invoke=(options={})=>{if(runningTurn){runningTurn.finish();return;}if(Date.now()-lastTurn<450)return;lastTurn=Date.now();turn(delta,options);};
 const resetGestureVisual=value=>{if(value?.visual)value.visual.cleanup();else if(value?.paper){value.paper.style.transform='';value.paper.style.zIndex='';}if(value?.openingCover)document.querySelector('.encadernacao')?.classList.remove('abrindo-capa');};
 const stop=()=>{clearTimeout(holdTimer);clearTimeout(repeatTimer);holdTimer=repeatTimer=null;window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',cancel);window.removeEventListener('pointermove',move);window.removeEventListener('blur',cancel);};
 const advance=()=>{if(!gesture||!held)return;if(!turning){if(delta>0&&!closed&&current>=state.pages.length-1)return;if(delta<0&&(closed||current===0))return;turn(delta,{fast:true,existingOnly:true,visual:gesture.visual});gesture.visual=null;}repeatTimer=setTimeout(advance,165);};
 const release=e=>{if(!gesture)return;const active=gesture,dx=e.clientX-active.x,wasHeld=held,angle=active.angle||0,visual=active.visual;gesture=null;stop();if(wasHeld){if(runningTurn)runningTurn.cancel();else resetGestureVisual(active);held=false;return;}if(Math.abs(dx)<8||-delta*dx>35)invoke({startAngle:angle,visual});else resetGestureVisual(active);};
 const cancel=()=>{const active=gesture;gesture=null;stop();if(held&&runningTurn)runningTurn.cancel();else resetGestureVisual(active);held=false;};
 const move=e=>{if(!gesture||held)return;if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>12){clearTimeout(holdTimer);holdTimer=null;}const progress=Math.max(0,Math.min(1,-delta*(e.clientX-gesture.x)/(gesture.width*2))),turnDirection=gesture.openingCover?-1:-delta;gesture.angle=turnDirection*Math.acos(1-2*progress)*180/Math.PI;if(gesture.openingCover&&!gesture.visual&&Math.abs(e.clientX-gesture.x)>8){document.querySelector('.encadernacao')?.classList.add('abrindo-capa');gesture.visual=createTurnVisual(delta,gesture.paper);}if(gesture.visual)gesture.visual.setAngle(gesture.angle);else{gesture.paper.style.transformOrigin=delta>0?'left center':'right center';gesture.paper.style.zIndex='20';gesture.paper.style.transform='perspective(4800px) rotateY('+gesture.angle+'deg)';}};
 edge.onpointerdown=e=>{if(e.button!==0||turning)return;const openingCover=closed,paper=openingCover?$('capa'):delta>0?document.querySelector('.folha'):$('folhaEsquerda');gesture={x:e.clientX,y:e.clientY,paper,width:paper.getBoundingClientRect().width,angle:0,visual:openingCover?null:createTurnVisual(delta,paper),openingCover};held=false;edge.setPointerCapture(e.pointerId);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',cancel);window.addEventListener('pointermove',move);window.addEventListener('blur',cancel);const r=edge.getBoundingClientRect();if(e.clientY-r.top<=56||r.bottom-e.clientY<=56)holdTimer=setTimeout(()=>{if(!gesture)return;held=true;advance();},2000);};
 edge.onpointerup=release;edge.onpointercancel=cancel;
 edge.onclick=e=>{if(e.detail===0)invoke();};
 edge.ondblclick=e=>{e.preventDefault();if(runningTurn)runningTurn.finish();else if(Date.now()-lastTurn>=450)invoke();};
 edge.title=delta>0?'Clique para virar; segure uma ponta por 2 segundos para ir à última página':'Clique para voltar; segure uma ponta por 2 segundos para ir à primeira página';
}
function bindNavigationHold(button,delta){
 let holdTimer=null,repeatTimer=null,holding=false,suppressClick=false;
 const stop=()=>{clearTimeout(holdTimer);clearTimeout(repeatTimer);holdTimer=repeatTimer=null;holding=false;window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',release);};
 const advance=()=>{if(!holding)return;if(delta>0&&current>=state.pages.length-1)return;if(delta<0&&current===0)return;if(!turning)turn(delta,{fast:true,existingOnly:true});repeatTimer=setTimeout(advance,165);};
 const release=()=>stop();
 button.onpointerdown=event=>{if(event.button!==0||turning)return;holding=true;suppressClick=false;button.setPointerCapture?.(event.pointerId);holdTimer=setTimeout(()=>{if(!holding)return;suppressClick=true;advance();},2000);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',release);};
 button.onpointerup=release;button.onpointercancel=release;
 button.onclick=event=>{if(suppressClick){suppressClick=false;event.preventDefault();return;}turn(delta);};
}
function download(name,body,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function exportReader(){
 const pages=paginasSelecionadas();if(!pages.length){alert('Marque pelo menos uma abertura para incluir na exportação de leitura.');return false;}
 const html=pages.map((p,i)=>`<article style="min-height:${Math.max(720,...p.photos.map(f=>f.y+460))}px" ${i?'hidden':''}><small>${escapeHTML(p.date)}</small><h1 style="transform:translate(${p.positions?.title?.x||0}px,${p.positions?.title?.y||0}px)">${richHTML(p,'title')}</h1><div class="texto" style="transform:translate(${p.positions?.text?.x||0}px,${p.positions?.text?.y||0}px)">${richHTML(p,'text')}</div><section style="height:${Math.max(360,...p.photos.map(f=>f.y+330))}px">${p.photos.map(f=>`<button class="foto" style="left:${f.x}%;top:${f.y}px;width:${larguraDaFoto(f)}px;transform:rotate(${f.angle}deg)"><img src="${f.src}" alt="${escapeHTML(f.caption||'Fotografia')}"><span>${escapeHTML(f.caption)}</span></button>`).join('')}</section><footer>${escapeHTML(MARCA_RODAPE)} · ${i+1}</footer></article>`).join('');
 const css='*{scrollbar-color:#F2992E transparent}::-webkit-scrollbar{width:5px;height:5px;background:transparent}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:#F2992E;border-radius:999px}article{position:relative;min-height:720px;padding-bottom:360px}article>section{position:absolute!important;inset:0 0 auto;margin:0!important;pointer-events:none}article .foto{pointer-events:auto}article>footer{position:absolute;bottom:0}*{box-sizing:border-box}body{margin:0;padding:28px 15px;background:#11273c;color:#243b44;font-family:Georgia,serif}main{max-width:760px;margin:auto;background:#f4efdf;padding:35px;box-shadow:5px 8px #d5cbb5;border-radius:6px}h1{font-size:36px}.texto{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:18px}section{position:relative;margin-top:28px}.foto{position:absolute;width:47%;border:0;padding:10px;background:#fffdf6;box-shadow:2px 5px 12px #0003;cursor:pointer}.foto img{width:100%;height:170px;object-fit:cover}.foto span{display:block;padding:15px 0;font:italic 14px Georgia;overflow-wrap:anywhere}footer,small{font:12px system-ui}nav{text-align:center;margin:25px;color:#fff}nav button,dialog button{padding:10px 20px;margin:0 15px;cursor:pointer}dialog{max-width:94vw;max-height:94vh;background:#fffdf6;border:0;padding:18px}dialog::backdrop{background:#000d}dialog img{display:block;max-width:82vw;max-height:75vh}dialog p{text-align:center}button:focus-visible{outline:3px solid #f2992e}@media(max-width:500px){main{padding:20px}.foto img{height:120px}}';
 const script=`let n=0;const pages=[...document.querySelectorAll('article')],prev=document.getElementById('prev'),next=document.getElementById('next'),count=document.getElementById('count'),dialog=document.querySelector('dialog');function show(){pages.forEach((p,i)=>p.hidden=i!==n);prev.disabled=n===0;next.disabled=n===pages.length-1;count.textContent=(n+1)+' / '+pages.length;}prev.onclick=()=>{n--;show()};next.onclick=()=>{n++;show()};document.querySelectorAll('.foto').forEach(b=>b.onclick=()=>{dialog.querySelector('img').src=b.querySelector('img').src;dialog.querySelector('img').alt=b.querySelector('img').alt;dialog.querySelector('p').textContent=b.querySelector('span').textContent;dialog.showModal()});document.getElementById('close').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});show();`;
 download('caderno-leitura.html',`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(state.name)}</title><style>${css}</style><main>${html}</main><nav><button id="prev" aria-label="Página anterior">←</button><span id="count"></span><button id="next" aria-label="Próxima página">→</button></nav><dialog><button id="close">Fechar ×</button><img alt=""><p></p></dialog><script>${script}<\/script></html>`,'text/html');
 avisar(`${pages.length} página(s) exportada(s) para leitura`);
 return true;
}
function createTrackpadPager(navigate,isBusy=()=>false,verticalDirection=()=>0){
 let distance=0,lastTime=null,latched=false,axis=null;
 return event=>{
  if(event.ctrlKey||event.metaKey)return;
  const dx=event.deltaX||(event.shiftKey?event.deltaY:0),dy=event.shiftKey?0:event.deltaY;
  const horizontal=Boolean(dx)&&Math.abs(dx)>=Math.abs(dy)*.85;
  const vertical=dy<0&&Math.abs(dy)>=Math.abs(dx)*.85;
  const nextAxis=horizontal?'horizontal':vertical?'vertical':null;
  if(!nextAxis)return;
  const verticalPageDirection=nextAxis==='vertical'?verticalDirection(event):0;
  if(nextAxis==='vertical'&&!verticalPageDirection)return;
  event.preventDefault();
  if(lastTime===null||event.timeStamp-lastTime>240||axis!==nextAxis){distance=0;latched=false;}
  axis=nextAxis;
  lastTime=event.timeStamp;
  if(latched)return;
  if(isBusy()){latched=true;return;}
  const factor=event.deltaMode===1?16:event.deltaMode===2?600:1;
  const delta=nextAxis==='horizontal'?dx:Math.abs(dy)*verticalPageDirection;
  if(distance&&Math.sign(distance)!==Math.sign(delta))distance=0;
  distance+=delta*factor;
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
 const savedId=String(state.publicationView?.pageId||''),savedIndex=savedId?state.pages.findIndex(page=>page?.id===savedId):-1;
 const fallback=savedIndex>=0?Math.min(savedIndex%2===0?savedIndex:savedIndex+1,state.pages.length-1):primeiraAberturaComConteudo();
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
 button.setAttribute('aria-checked',String(somAtivo));button.setAttribute('aria-label',somAtivo?'Desativar sons do caderno':'Ativar sons do caderno');button.title=somAtivo?'Sons ligados':'Sons desligados';button.classList.toggle('som-desligado',!somAtivo);
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
let ultimoSomZiper=0,ultimaPosicaoSomZiper=-1;
function tocarSomZiper(progress){
 if(!somAtivo||typeof window==='undefined')return;
 const now=typeof performance==='undefined'?Date.now():performance.now(),position=Math.max(0,Math.min(1,progress));
 if(now-ultimoSomZiper<24||Math.abs(position-ultimaPosicaoSomZiper)<.012)return;
 const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
 try{
  contextoSom??=new AudioContext();if(contextoSom.state==='suspended')contextoSom.resume();ultimoSomZiper=now;ultimaPosicaoSomZiper=position;
  const duration=.032,length=Math.max(1,Math.floor(contextoSom.sampleRate*duration)),buffer=contextoSom.createBuffer(1,length,contextoSom.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++){const t=i/length;data[i]=(Math.random()*2-1)*Math.exp(-t*7)*(.7+.3*Math.sin(i*.92));}
  const source=contextoSom.createBufferSource(),band=contextoSom.createBiquadFilter(),gain=contextoSom.createGain();source.buffer=buffer;band.type='bandpass';band.frequency.value=2100+position*1100;band.Q.value=1.35;gain.gain.value=.085;source.connect(band).connect(gain).connect(contextoSom.destination);source.start();source.stop(contextoSom.currentTime+duration);
 }catch{}
}
if(typeof window!=='undefined')window.RebojarSom={...(window.RebojarSom||{}),ziper:tocarSomZiper};
// Eventos da interface
const quadroBau=document.querySelector('.seletor-bau-caderno iframe');
if(quadroBau){
 const origemLocal=location.protocol==='file:'||['localhost','127.0.0.1','::1'].includes(location.hostname);
 quadroBau.src=origemLocal?(quadroBau.dataset.localSrc||'../widget-bau/index.html?embed=1'):'https://rebojar.github.io/widget-bau/?embed=1';
 const sincronizarSomBau=()=>quadroBau.contentWindow?.postMessage({tipo:'rebojar:som',ativo:somAtivo},origemLocal?'*':'https://rebojar.github.io');
 quadroBau.addEventListener('load',sincronizarSomBau);
 window.addEventListener('rebojar-caderno-som-alterado',sincronizarSomBau);
 const suporteBau=quadroBau.closest('.seletor-bau-caderno'),consultaCursorPreciso=matchMedia('(hover: hover) and (pointer: fine)');
 let bauAproximado=false,retanguloOrigemBau,quadroBauAnimacao=0;
 const limitar=(valor,minimo,maximo)=>Math.min(maximo,Math.max(minimo,valor));
 const pontoDentro=(x,y,retangulo,margem=0)=>retangulo&&x>=retangulo.left-margem&&x<=retangulo.right+margem&&y>=retangulo.top-margem&&y<=retangulo.bottom+margem;
 const manterBauAproximado=event=>{
  if(!bauAproximado)return;
  const atual=quadroBau.getBoundingClientRect();
  if(pontoDentro(event.clientX,event.clientY,atual,4)||pontoDentro(event.clientX,event.clientY,retanguloOrigemBau,4))return;
  const ponte={left:Math.min(atual.right,retanguloOrigemBau.left),right:Math.max(atual.right,retanguloOrigemBau.left),top:Math.max(atual.top,retanguloOrigemBau.top)-12,bottom:Math.min(atual.bottom,retanguloOrigemBau.bottom)+12};
  if(ponte.top<=ponte.bottom&&pontoDentro(event.clientX,event.clientY,ponte))return;
  bauAproximado=false;suporteBau.classList.remove('bau-aproximado');atualizarPosicaoBau();
 };
 const atualizarPosicaoBau=()=>{
  quadroBauAnimacao=0;
  if(!consultaCursorPreciso.matches){bauAproximado=false;retanguloOrigemBau=undefined;suporteBau.classList.remove('bau-flutuante','bau-posicionado','bau-aproximado');quadroBau.style.removeProperty('transform');return;}
  suporteBau.classList.add('bau-flutuante');
  const retangulo=suporteBau.getBoundingClientRect(),larguraNatural=770,alturaNatural=520;
  let escala=.235,x=retangulo.left+(retangulo.width-larguraNatural*escala)/2,y=retangulo.top-50;
  if(bauAproximado){
   escala=Math.min(1.35,(innerWidth-16)/larguraNatural,(innerHeight-16)/alturaNatural);
   const largura=larguraNatural*escala,altura=alturaNatural*escala;
   x=(innerWidth-largura)/2;
   y=(innerHeight-altura)/2;
   x=limitar(x,8,Math.max(8,innerWidth-largura-8));y=limitar(y,8,Math.max(8,innerHeight-altura-8));
  }
  quadroBau.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${escala.toFixed(4)})`;
  if(!suporteBau.classList.contains('bau-posicionado'))requestAnimationFrame(()=>suporteBau.classList.add('bau-posicionado'));
 };
 const agendarPosicaoBau=()=>{if(!quadroBauAnimacao)quadroBauAnimacao=requestAnimationFrame(atualizarPosicaoBau);};
 quadroBau.addEventListener('pointerenter',()=>{if(!consultaCursorPreciso.matches||bauAproximado)return;retanguloOrigemBau=quadroBau.getBoundingClientRect();bauAproximado=true;suporteBau.classList.add('bau-aproximado');atualizarPosicaoBau();});
 quadroBau.addEventListener('pointerleave',manterBauAproximado);
 document.addEventListener('pointermove',manterBauAproximado,{passive:true});
 consultaCursorPreciso.addEventListener('change',atualizarPosicaoBau);window.addEventListener('resize',agendarPosicaoBau);window.addEventListener('scroll',agendarPosicaoBau,{passive:true,capture:true});
 requestAnimationFrame(atualizarPosicaoBau);
}
setupParedeEstante();
const estanteDialog=$('estanteDialog'),quadrosEstante=[...document.querySelectorAll('#estanteDialog iframe,#paredeEstante iframe')];
if(estanteDialog&&quadrosEstante.length){
 const origemLocal=location.protocol==='file:'||['localhost','127.0.0.1','::1'].includes(location.hostname);
 const sincronizarSomEstante=()=>quadrosEstante.forEach(quadro=>quadro.contentWindow?.postMessage({tipo:'rebojar:som',ativo:somAtivo},origemLocal?'*':'https://rebojar.github.io'));
 quadrosEstante.forEach(quadro=>{
  quadro.src=origemLocal?(quadro.dataset.localSrc||'../widget-estante/index.html?embed=1'):'https://rebojar.github.io/widget-estante/?embed=1';
  quadro.addEventListener('load',sincronizarSomEstante);
 });
 window.addEventListener('rebojar-caderno-som-alterado',sincronizarSomEstante);
 $('abrirEstante').onclick=()=>{sincronizarSomEstante();estanteDialog.showModal();};
 $('fecharEstante').onclick=()=>estanteDialog.close();
}
const handleNotebookWheel=createTrackpadPager(direction=>{
 if(closed&&direction<0)return;
 clearSpreadSelection();turn(direction);
},()=>turning,event=>{
 const papel=event.target.closest?.('.pagina-esquerda,.folha');
 if(!papel)return 0;
 return papel.classList.contains('pagina-esquerda')?-1:1;
});
window.addEventListener('wheel',event=>{
 if(event.target.closest?.('.editor-texto,dialog'))return;
 const area=document.querySelector('.mesa').getBoundingClientRect();
 if(event.clientX<area.left||event.clientX>area.right||event.clientY<area.top||event.clientY>area.bottom)return;
 handleNotebookWheel(event);
},{passive:false,capture:true});
for(const [input,key] of [['tituloVista','title'],['palavras','text']])$(input).oninput=e=>flowInput(atual(),$(input),e,key);
$('tituloVista').oncompositionend=e=>flowInput(atual(),$('tituloVista'),e,'title');
$('palavras').oncompositionend=e=>flowInput(atual(),$('palavras'),e);
$('registroVista').oninput=()=>{if(ehGuarda(atual()))return;atual().recordLabel=$('registroVista').innerText.slice(0,200);persist();};
$('nome').oninput=()=>{state.name=$('nome').innerText.slice(0,100);persist();};$('data').onchange=()=>{if(ehGuarda(atual()))return;atual().date=$('data').value;render();persist();};$('publicar').onchange=()=>{paginasDaAbertura().filter(page=>!ehGuarda(page)).forEach(page=>page.publish=$('publicar').checked);persist();};
$('mostrarEstojoPublicacao').onchange=()=>{state.showToolsInPublication=$('mostrarEstojoPublicacao').checked;persist();};
$('mostrarBauPublicacao').onchange=()=>{state.showChestInPublication=$('mostrarBauPublicacao').checked;persist();};
$('publicarEstante').onchange=()=>{state.showShelfInPublication=$('publicarEstante').checked;persist();};
$('somEfeitos').onclick=()=>{somAtivo=!somAtivo;try{localStorage.setItem(chaveSom,somAtivo?'1':'0');}catch{}atualizarBotaoSom();dispatchEvent(new CustomEvent('rebojar-caderno-som-alterado',{detail:{ativo:somAtivo}}));};
window.addEventListener('message',evento=>{if(evento.data?.tipo!=='rebojar:caderno-som')return;somAtivo=Boolean(evento.data.ativo);try{localStorage.setItem(chaveSom,somAtivo?'1':'0');}catch{}atualizarBotaoSom();dispatchEvent(new CustomEvent('rebojar-caderno-som-alterado',{detail:{ativo:somAtivo}}));});
$('fecharCaderno').onclick=()=>{closed=true;render();$('nome').focus();};
for(const [element,key] of [['capaLinha','eyebrow'],['capaSubtitulo','subtitle']])$(element).oninput=()=>{state.cover??={...defaultCover};state.cover[key]=$(element).innerText;persist();};
bindEdge($('margemCapa'),1);bindEdge($('margemDireita'),1);
function excluirPaginaDaAbertura(lado){
 const index=lado==='esquerda'?current-1:current,page=state.pages[index];
 if(!page||ehGuarda(page))return;
 if(!confirm(`Excluir a página ${lado} e suas fotografias? Guarde uma cópia primeiro se quiser preservá-la.`))return;
 state.pages.splice(index,1);
 if(state.pages.filter(item=>!ehGuarda(item)).length===0)state.pages.push(pagina());
 current=Math.min(current,Math.floor((state.pages.length-1)/2)*2);
 render();persist();
}
$('excluirEsquerda').onclick=()=>excluirPaginaDaAbertura('esquerda');
$('excluirDireita').onclick=()=>excluirPaginaDaAbertura('direita');
bindNavigationHold($('anterior'),-1);bindNavigationHold($('proxima'),1);$('fechar').onclick=()=>$('ampliacao').close();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
function recursoDoAplicativo(){
 if(!publicDemo)return false;
 const message='Guardar e abrir cópias são recursos do aplicativo Caderno de Bordo.';
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
 let contaUsuario=null,identidadeEmRecuperacao=false,ponteContaDisponivel=false,janelaConta=null,estadoPonteConta='',sessaoConta=null;
 const chaveSessaoConta='rebojar-conta-sessao-v1',chaveEstadoConta='rebojar-conta-estado-v1';
const identidade={
 disponivel:typeof identityGetUser==='function'&&typeof identityOnAuthChange==='function'&&typeof identityHandleAuthCallback==='function',
 getUser:typeof identityGetUser==='function'?identityGetUser:async()=>null,
 onAuthChange:typeof identityOnAuthChange==='function'?identityOnAuthChange:()=>{},
 handleAuthCallback:typeof identityHandleAuthCallback==='function'?identityHandleAuthCallback:async()=>null,
 login:typeof identityLogin==='function'?identityLogin:async()=>{throw Error('A conta está disponível somente na versão conectada do Caderno.');},
 signup:typeof identitySignup==='function'?identitySignup:async()=>{throw Error('A conta está disponível somente na versão conectada do Caderno.');},
 requestPasswordRecovery:typeof identityRequestPasswordRecovery==='function'?identityRequestPasswordRecovery:async()=>{throw Error('A conta está disponível somente na versão conectada do Caderno.');},
 updateUser:typeof identityUpdateUser==='function'?identityUpdateUser:async()=>{throw Error('A conta está disponível somente na versão conectada do Caderno.');},
 logout:typeof identityLogout==='function'?identityLogout:async()=>{}
};
 function endpointPagamento(){return String(appConfig.paymentEndpoint||'').replace(/\/$/,'');}
 function origemPagamento(){try{return new URL(endpointPagamento()).origin;}catch{return '';}}
 function sessaoContaValida(value){return Boolean(value&&/^[A-Za-z0-9_-]{32,160}$/.test(value.accessToken||'')&&Date.parse(value.expiresAt||'')>Date.now()+30000);}
 function carregarSessaoConta(){try{const value=JSON.parse(sessionStorage.getItem(chaveSessaoConta)||'null');sessaoConta=sessaoContaValida(value)?value:null;}catch{sessaoConta=null;}return sessaoConta;}
 function guardarSessaoConta(value){sessaoConta=sessaoContaValida(value)?value:null;try{if(sessaoConta)sessionStorage.setItem(chaveSessaoConta,JSON.stringify(sessaoConta));else sessionStorage.removeItem(chaveSessaoConta);}catch{}return sessaoConta;}
 function limparSessaoConta(){guardarSessaoConta(null);contaUsuario=null;}
 function cabecalhosPagamento(headers={}){const result={...headers};if(sessaoContaValida(sessaoConta))result.authorization='Bearer '+sessaoConta.accessToken;return result;}
 function fetchPagamento(path,options={}){
  /* REBOJAR: INÍCIO — BARREIRA DE REDE COMERCIAL */
  if(publicDemo&&MODO_COMERCIAL_EM_MANUTENCAO)return Promise.reject(Error(MENSAGEM_COMERCIAL_EM_MANUTENCAO));
  /* REBOJAR: FIM — BARREIRA DE REDE COMERCIAL */
  const endpoint=endpointPagamento();return fetch(endpoint+path,{...options,credentials:'same-origin',headers:cabecalhosPagamento(options.headers)});
 }
 function criarEstadoConta(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');}
function mensagemDeConta(error){return String(error?.message||'Não foi possível concluir esta ação.').replace(/^AuthError:\s*/,'');}
function mostrarMensagemConta(message,kind=''){$('mensagemConta').textContent=message;$('mensagemConta').dataset.estado=kind;}
function atualizarInterfaceConta(){
 const connected=Boolean(contaUsuario?.id);
 $('conta').textContent=connected?'Conta':'Entrar';
 $('conta').title=connected?('Conta conectada: '+(contaUsuario.email||'')):'Entrar ou criar conta';
 $('estadoConta').textContent=connected?('Conectada como '+(contaUsuario.email||'conta do caderno')+'.'):'A conta é usada somente para a assinatura mensal e sua recuperação.';
  $('formulariosConta').hidden=connected||identidadeEmRecuperacao||ponteContaDisponivel;
 $('gerenciarAssinatura').hidden=!connected||identidadeEmRecuperacao;
 $('sairConta').hidden=!connected||identidadeEmRecuperacao;
 $('redefinirSenha').hidden=!identidadeEmRecuperacao;
 $('estadoContaPagamento').textContent=connected?'A assinatura mensal será associada a '+(contaUsuario.email||'esta conta')+'. A compra avulsa continua sem conta.':'A exportação avulsa não exige conta. Entre somente para assinar ou recuperar uma assinatura.';
 $('abrirContaPagamento').textContent=connected?'Ver conta':'Entrar ou criar conta';
}
 async function trocarCodigoConta(code,state){
  let expected=estadoPonteConta;try{expected=expected||localStorage.getItem(chaveEstadoConta)||'';}catch{}
  if(!ponteContaDisponivel||state!==expected||!/^[A-Za-z0-9_-]{32,160}$/.test(code||''))throw Error('A conexão da conta não pôde ser confirmada. Abra a conta novamente.');
  const response=await fetch(endpointPagamento()+'/bridge/exchange',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({code,state})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.accessToken)throw Error(result.message||'Não foi possível conectar a conta.');
  guardarSessaoConta({accessToken:result.accessToken,expiresAt:result.expiresAt,email:result.user?.email||''});
  contaUsuario={id:'conta-remota',email:result.user?.email||''};estadoPonteConta='';
  try{localStorage.removeItem(chaveEstadoConta);}catch{}
  atualizarInterfaceConta();mostrarMensagemConta('Conta conectada.','sucesso');mostrarEstadoApoio('Conta conectada. Agora você pode assinar ou usar sua assinatura mensal.','sucesso');
  return contaUsuario;
 }
 function limparRetornoConta(){
  const url=new URL(location.href);if(!url.searchParams.has('conta_codigo')&&!url.searchParams.has('conta_estado'))return;
  url.searchParams.delete('conta_codigo');url.searchParams.delete('conta_estado');history.replaceState(null,'',url.href);
 }
 async function receberRetornoConta(){
  const params=new URLSearchParams(location.search),code=params.get('conta_codigo')||'',state=params.get('conta_estado')||'';
  if(!code&&!state)return false;
  try{await trocarCodigoConta(code,state);return true;}finally{limparRetornoConta();}
 }
 function abrirJanelaConta(message='',action='conectar'){
  const endpoint=endpointPagamento();if(!endpoint||!ponteContaDisponivel)return;
  estadoPonteConta=criarEstadoConta();try{localStorage.setItem(chaveEstadoConta,estadoPonteConta);}catch{}
  const returnUrl=new URL(location.href);returnUrl.searchParams.delete('conta_codigo');returnUrl.searchParams.delete('conta_estado');
  const url=new URL(endpoint+'/conta/');url.searchParams.set('origem',location.origin);url.searchParams.set('estado',estadoPonteConta);url.searchParams.set('retorno',returnUrl.href);url.searchParams.set('acao',action);
  if(message){mostrarMensagemConta(message,'espera');mostrarEstadoApoio(message,'espera');}
  janelaConta=window.open(url.href,'rebojar-conta','popup=yes,width=500,height=760,resizable=yes,scrollbars=yes');
  if(!janelaConta)location.assign(url.href);
 }
function abrirConta(message=''){
  if(ponteContaDisponivel&&!contaUsuario){abrirJanelaConta(message);return;}
  if(!identidade.disponivel&&!contaUsuario)return;
 if(message)mostrarMensagemConta(message,'espera');
 atualizarInterfaceConta();
 if(!$('contaUsuario').open)$('contaUsuario').showModal();
}
async function carregarConta(){
  if(ponteContaDisponivel){
   if(!sessaoContaValida(carregarSessaoConta())){limparSessaoConta();atualizarInterfaceConta();return null;}
   try{
    const response=await fetchPagamento('/bridge/account',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),result=await response.json().catch(()=>({}));
    if(!response.ok||!result.user)throw Error(result.message||'Sessão expirada.');
    contaUsuario={id:'conta-remota',email:result.user.email||sessaoConta.email||''};
   }catch{limparSessaoConta();}
   atualizarInterfaceConta();return contaUsuario;
  }
  if(!identidade.disponivel){contaUsuario=null;return null;}
 try{contaUsuario=await identidade.getUser();}
 catch{contaUsuario=null;}
 atualizarInterfaceConta();
 return contaUsuario;
}
async function iniciarIdentidade(){
  /* REBOJAR: INÍCIO — IDENTIDADE DESLIGADA DURANTE A MANUTENÇÃO COMERCIAL */
  if(publicDemo&&MODO_COMERCIAL_EM_MANUTENCAO){
   contaUsuario=null;ponteContaDisponivel=false;aplicarModoComercialEmManutencao();return;
  }
  /* REBOJAR: FIM — IDENTIDADE DESLIGADA DURANTE A MANUTENÇÃO COMERCIAL */
  if(!identidade.disponivel&&publicDemo&&endpointPagamento()&&origemPagamento()!==location.origin){
   ponteContaDisponivel=appConfig.accountBridge===true&&location.origin==='https://rebojar.github.io';
   if(ponteContaDisponivel){
    $('conta').hidden=false;$('abrirContaPagamento').hidden=false;$('assinarMensal').hidden=false;
    try{await receberRetornoConta();}catch(error){mostrarEstadoApoio(mensagemDeConta(error),'erro');}
    await carregarConta();return;
   }
  }
 if(!identidade.disponivel){
  $('conta').hidden=true;$('abrirContaPagamento').hidden=true;$('assinarMensal').hidden=true;
  $('estadoContaPagamento').textContent='A exportação avulsa continua disponível sem conta.';
  return;
 }
 identidade.onAuthChange(()=>carregarConta());
 try{
  const callback=await identidade.handleAuthCallback();
  if(callback?.type==='recovery'){identidadeEmRecuperacao=true;abrirConta('Defina uma nova senha para concluir a recuperação.');}
  else if(callback?.type==='confirmation'){mostrarMensagemConta('E-mail confirmado. Sua conta já está conectada.','sucesso');}
 }catch(error){console.error('Falha ao concluir o acesso da conta.',error);mostrarMensagemConta(mensagemDeConta(error),'erro');}
 await carregarConta();
 if(identidadeEmRecuperacao)abrirConta();
}
 window.addEventListener('message',async event=>{
  if(!ponteContaDisponivel||event.origin!==origemPagamento())return;
  if(janelaConta&&event.source!==janelaConta)return;
  if(event.data?.tipo==='rebojar:conta-desconectada'){limparSessaoConta();atualizarInterfaceConta();mostrarMensagemConta('Você saiu da conta.','sucesso');return;}
  if(event.data?.tipo!=='rebojar:conta-conectada')return;
  try{await trocarCodigoConta(String(event.data.codigo||''),String(event.data.estado||''));}
  catch(error){mostrarEstadoApoio(mensagemDeConta(error),'erro');}
 });
$('conta').onclick=()=>abrirConta();
$('fecharConta').onclick=()=>$('contaUsuario').close();
$('contaUsuario').addEventListener('click',event=>{if(event.target===$('contaUsuario'))$('contaUsuario').close();});
$('entrarConta').addEventListener('submit',async event=>{
 event.preventDefault();mostrarMensagemConta('Entrando…','espera');
 try{contaUsuario=await identidade.login($('emailConta').value.trim(),$('senhaConta').value);atualizarInterfaceConta();mostrarMensagemConta('Conta conectada.','sucesso');$('entrarConta').reset();setTimeout(()=>$('contaUsuario').close(),450);}
 catch(error){mostrarMensagemConta(mensagemDeConta(error),'erro');}
});
$('criarConta').addEventListener('submit',async event=>{
 event.preventDefault();mostrarMensagemConta('Criando sua conta…','espera');
 try{await identidade.signup($('novoEmailConta').value.trim(),$('novaSenhaConta').value,{});$('criarConta').reset();mostrarMensagemConta('Conta criada. Abra o e-mail de confirmação enviado pelo Netlify.','sucesso');}
 catch(error){mostrarMensagemConta(mensagemDeConta(error),'erro');}
});
$('esqueciSenha').onclick=async()=>{
 const email=$('emailConta').value.trim();
 if(!email){mostrarMensagemConta('Digite seu e-mail no campo de entrada.','erro');$('emailConta').focus();return;}
 mostrarMensagemConta('Enviando o link de recuperação…','espera');
 try{await identidade.requestPasswordRecovery(email);mostrarMensagemConta('Confira seu e-mail para escolher uma nova senha.','sucesso');}
 catch(error){mostrarMensagemConta(mensagemDeConta(error),'erro');}
};
$('redefinirSenha').addEventListener('submit',async event=>{
 event.preventDefault();mostrarMensagemConta('Salvando a nova senha…','espera');
 try{contaUsuario=await identidade.updateUser({password:$('senhaRecuperada').value});identidadeEmRecuperacao=false;$('redefinirSenha').reset();atualizarInterfaceConta();mostrarMensagemConta('Senha alterada. Sua conta está conectada.','sucesso');}
 catch(error){mostrarMensagemConta(mensagemDeConta(error),'erro');}
});
$('gerenciarAssinatura').onclick=async()=>{
  const endpoint=endpointPagamento();
 if(!endpoint){mostrarMensagemConta('O gerenciamento da assinatura ainda não está disponível.','erro');return;}
 mostrarMensagemConta('Abrindo o gerenciamento seguro da Stripe…','espera');
 try{
   const response=await fetchPagamento('/manage-subscription',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const result=await response.json().catch(()=>({}));
   if(response.status===401){if(ponteContaDisponivel)limparSessaoConta();else contaUsuario=null;atualizarInterfaceConta();throw Error(result.message||'Entre novamente para gerenciar a assinatura.');}
  if(!response.ok||!result.url)throw Error(result.message||'Não foi possível abrir o gerenciamento da assinatura.');
  window.location.assign(result.url);
 }catch(error){mostrarMensagemConta(mensagemDeConta(error),'erro');}
};
$('sairConta').onclick=async()=>{
 mostrarMensagemConta('Saindo…','espera');
  try{if(ponteContaDisponivel){const revogar=fetchPagamento('/bridge/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}',keepalive:true}).catch(()=>null);limparSessaoConta();atualizarInterfaceConta();abrirJanelaConta('Saindo da conta…','sair');await revogar;}else await identidade.logout();limparSessaoConta();atualizarInterfaceConta();mostrarMensagemConta('Você saiu da conta.','sucesso');}
 catch(error){mostrarMensagemConta(mensagemDeConta(error),'erro');}
};
$('abrirContaPagamento').onclick=()=>abrirConta();
async function conferirApoio({silencioso=false}={}){
 const endpoint=endpointPagamento();
 if(!endpoint){if(!silencioso)mostrarEstadoApoio('A confirmação automática ainda está sendo preparada. Nenhuma cobrança foi liberada.','erro');return false;}
 if(!paginasSelecionadas().length){if(!silencioso)mostrarEstadoApoio('Marque uma abertura para exportar antes de apoiar.','erro');return false;}
 if(!silencioso)mostrarEstadoApoio('Conferindo o pagamento…','espera');
 try{
  const response=await fetchPagamento('/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({claim:obterCodigoApoio()})});
  const result=await response.json().catch(()=>({}));
  if(response.ok&&result.ok){clearTimeout(consultaApoio);consultaApoio=null;mostrarEstadoApoio(result.plan==='monthly'?'Assinatura confirmada nesta conta. As exportações estão liberadas.':'Pagamento confirmado. Preparando sua exportação…','sucesso');$('pedagioExportacao').close();const exported=exportReader();if(exported){codigoApoio='';try{sessionStorage.removeItem('rebojar-codigo-apoio');}catch{}}return exported;}
  if(response.status===401){if(ponteContaDisponivel)limparSessaoConta();else contaUsuario=null;atualizarInterfaceConta();abrirConta(result.message||'Entre novamente para confirmar a assinatura.');return false;}
  if(response.status===409){mostrarEstadoApoio(result.message||'Esta compra já foi utilizada.','erro');return false;}
  if(!silencioso)mostrarEstadoApoio(result.message||'O pagamento ainda não apareceu. Aguarde alguns segundos e confira novamente.','espera');
 }catch{if(!silencioso)mostrarEstadoApoio('Não foi possível consultar agora. Verifique a conexão e tente novamente.','erro');}
 return false;
}
async function conferirAssinatura(){
 const endpoint=endpointPagamento();
 if(!endpoint||!contaUsuario)return false;
 try{
  const response=await fetchPagamento('/status',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const result=await response.json().catch(()=>({}));
  if(response.status===401){if(ponteContaDisponivel)limparSessaoConta();else contaUsuario=null;atualizarInterfaceConta();return false;}
  return Boolean(response.ok&&result.active);
 }catch{return false;}
}
function carregarStripe(){
 /* REBOJAR: INÍCIO — STRIPE DESLIGADA DURANTE A MANUTENÇÃO COMERCIAL */
 if(publicDemo&&MODO_COMERCIAL_EM_MANUTENCAO)return Promise.reject(Error(MENSAGEM_COMERCIAL_EM_MANUTENCAO));
 /* REBOJAR: FIM — STRIPE DESLIGADA DURANTE A MANUTENÇÃO COMERCIAL */
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
 /* REBOJAR: INÍCIO — CHECKOUT DESLIGADO DURANTE A MANUTENÇÃO COMERCIAL */
 if(publicDemo&&MODO_COMERCIAL_EM_MANUTENCAO){aplicarModoComercialEmManutencao();mostrarEstadoApoio(MENSAGEM_COMERCIAL_EM_MANUTENCAO,'espera');return;}
 /* REBOJAR: FIM — CHECKOUT DESLIGADO DURANTE A MANUTENÇÃO COMERCIAL */
 const endpoint=endpointPagamento();
 if(plan==='monthly'&&!contaUsuario&&ponteContaDisponivel){abrirConta('Entre ou crie uma conta antes de iniciar a assinatura.');return;}
 if(plan==='monthly'&&!contaUsuario&&!(await carregarConta())){abrirConta('Entre ou crie uma conta antes de iniciar a assinatura.');return;}
 if(!endpoint){mostrarEstadoApoio('Os pagamentos ainda estão sendo preparados. Nenhuma cobrança foi iniciada.','erro');return;}
 mostrarEstadoApoio('Preparando o pagamento seguro…','espera');$('comprarAvulsa').disabled=true;$('assinarMensal').disabled=true;
 try{
  const [StripeClass,publicResponse,sessionResponse]=await Promise.all([
   carregarStripe(),
   fetchPagamento('/public-config'),
   fetchPagamento('/create-checkout-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,claim:obterCodigoApoio()})})
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
if(!publicDemo){
 $('backup').onclick=()=>{const snapshot=JSON.parse(JSON.stringify(state));snapshot.publicationView={pageId:String(atual()?.id||''),closed,soundEnabled:somAtivo,statusText:$('status').textContent||'Caderno local · pronto para editar'};download('caderno-copia-'+hoje()+'.json',JSON.stringify(snapshot,null,2),'application/json');};
 $('restaurar').onclick=()=>$('arquivoBackup').click();
 $('arquivoBackup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>150*1024*1024)throw Error('Esta cópia é grande demais para abrir aqui (limite de 150 MB).');const restored=validate(JSON.parse(await file.text()));if(confirm('Abrir esta cópia substitui o caderno atual neste navegador. Você já guardou uma cópia do atual?')){state=restored;const savedId=String(state.publicationView?.pageId||''),savedIndex=savedId?state.pages.findIndex(page=>page?.id===savedId):-1;current=savedIndex>=0?Math.min(savedIndex%2===0?savedIndex:savedIndex+1,state.pages.length-1):primeiraAberturaComConteudo();closed=state.publicationView?.closed===true;if(typeof state.publicationView?.soundEnabled==='boolean')somAtivo=state.publicationView.soundEnabled;atualizarBotaoSom();render();persist();}}catch(error){alert('Não foi possível abrir: '+error.message);}finally{e.target.value='';}};
 let photoTarget=null;
 $('foto').onclick=()=>{if(ehGuarda(atual()))return;photoTarget=atual();$('arquivoFoto').click();};
 async function readPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use fotografias JPG, PNG ou WebP.');
  if(file.size>30*1024*1024)throw Error('Cada fotografia deve ter até 30 MB.');
  const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1800/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.86);}finally{URL.revokeObjectURL(url);}
 }
 $('arquivoFoto').onchange=async e=>{const target=photoTarget||atual();$('foto').disabled=true;try{for(const file of e.target.files){if(target.photos.length>=30)throw Error('Limite de 30 fotografias por página. Crie outra página para continuar.');const src=await readPhoto(file);const i=target.photos.length,width=larguraDaFoto({width:$('mural').getBoundingClientRect().width*.47});target.photos.push({id:id(),src,caption:'',x:i%2?50:0,y:Math.floor(i/2)*290,width,angle:i%2?3:-3});persist();}render();}catch(error){render();alert(error.message);}finally{$('foto').disabled=false;e.target.value='';}};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
$('exportar').onclick=async()=>{if(publicDemo&&MODO_COMERCIAL_EM_MANUTENCAO){abrirAvisoComercial('exportacao');return;}if(publicDemo){if(!paginasSelecionadas().length){alert('Marque pelo menos uma abertura para incluir na exportação de leitura.');return;}avisar('Conferindo acesso à exportação…');if(contaUsuario&&await conferirAssinatura()){exportReader();return;}await limparCheckout();mostrarEstadoApoio(appConfig.paymentEndpoint?'Escolha uma opção para continuar. A exportação avulsa não exige conta.':'Os pagamentos ainda estão sendo preparados. Nenhuma cobrança foi liberada.',appConfig.paymentEndpoint?'':'erro');$('pedagioExportacao').showModal();return;}exportReader();};
$('comprarAvulsa').onclick=()=>abrirCheckout('single');
$('assinarMensal').onclick=()=>abrirCheckout('monthly');
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
 pull.onpointermove=e=>{if(!drag)return;const progress=(e.clientX-drag.left)/drag.width;drag.moved=drag.moved||Math.abs(progress)>0.04;if(drag.moved)tocarSomZiper(progress);setProgress(progress);};
 pull.onpointerup=e=>{if(!drag)return;const wasMoved=drag.moved,rect=track.getBoundingClientRect(),progress=(e.clientX-rect.left)/Math.max(1,rect.width);drag=null;suppressClick=wasMoved;if(progress>=.52)open(false);else setProgress(0);};
 pull.onpointercancel=()=>{drag=null;setProgress(0);};
 pull.onclick=()=>{if(suppressClick){suppressClick=false;return;}open(false);};
 cover.ondblclick=e=>{if(e.target.closest?.('[contenteditable]'))return;e.preventDefault();open(true);};
 cover.onkeydown=e=>{if(e.target.closest?.('[contenteditable]'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();open(false);}};
}
function setupWidgetEstojo(){
 const quadro=document.querySelector('.widget-estojo-caderno iframe');if(!quadro)return;
 const origemLocal=location.protocol==='file:'||['localhost','127.0.0.1','::1'].includes(location.hostname);
 quadro.src=origemLocal?(quadro.dataset.localSrc||'../widget-estojo/index.html?embed=1'):'https://rebojar.github.io/widget-estojo/?embed=1';
 const origemEsperada=origemLocal?'null':new URL(quadro.src,location.href).origin;
 const sincronizarSom=()=>quadro.contentWindow?.postMessage({tipo:'rebojar:som',ativo:somAtivo},origemLocal?'*':'https://rebojar.github.io');
 quadro.addEventListener('load',sincronizarSom);window.addEventListener('rebojar-caderno-som-alterado',sincronizarSom);
 const estado={corTexto:'#243b44',tamanho:12,opacidadeTexto:100,corGrifo:'#e8d73a',opacidadeGrifo:100,formatos:new Set(['justifyLeft'])};
 const rgba=(hex,alpha)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${Math.max(0,Math.min(100,alpha))/100})`;
 const sincronizarPonte=detail=>{
  $('textColor').value=detail.corTexto;$('fontSize').value=String(detail.tamanho);$('textAlpha').value=String(detail.opacidadeTexto);$('textAlphaValue').textContent=`${detail.opacidadeTexto}%`;
  $('markColor').value=detail.corGrifo;$('markAlpha').value=String(detail.opacidadeGrifo);$('markAlphaValue').textContent=`${detail.opacidadeGrifo}%`;
 };
 window.addEventListener('message',event=>{
  if(event.source!==quadro.contentWindow||event.origin!==origemEsperada||event.data?.tipo!=='rebojar-estojo:ferramentas')return;
  const detail=event.data.detalhe||{},formatos=new Set(Array.isArray(detail.formatos)?detail.formatos:[]);sincronizarPonte(detail);
  if(detail.corTexto!==estado.corTexto||detail.opacidadeTexto!==estado.opacidadeTexto)formatText('foreColor',rgba(detail.corTexto,detail.opacidadeTexto));
  if(detail.tamanho!==estado.tamanho)formatText('size',Math.max(6,Math.min(96,Number(detail.tamanho)||12)));
  if(detail.corGrifo!==estado.corGrifo||detail.opacidadeGrifo!==estado.opacidadeGrifo)formatText('hiliteColor',rgba(detail.corGrifo,detail.opacidadeGrifo));
  for(const comando of ['bold','italic','underline','strikeThrough'])if(formatos.has(comando)!==estado.formatos.has(comando))formatText(comando);
  const alinhamentos=['justifyLeft','justifyCenter','justifyRight','justifyFull'],anterior=alinhamentos.find(comando=>estado.formatos.has(comando)),novo=alinhamentos.find(comando=>formatos.has(comando));
  if(novo&&novo!==anterior)formatText(novo);
  estado.corTexto=detail.corTexto;estado.tamanho=detail.tamanho;estado.opacidadeTexto=detail.opacidadeTexto;estado.corGrifo=detail.corGrifo;estado.opacidadeGrifo=detail.opacidadeGrifo;estado.formatos=formatos;
 });
}
function setupParedeEstante(){
 const header=document.querySelector('.barra'),principal=document.querySelector('main'),fotos=$('fotosLivres');
 if(!header||!principal||document.querySelector('#cadernoPlano')||!matchMedia('(min-width:700px)').matches)return;
 const plano=document.createElement('div');plano.id='cadernoPlano';plano.className='caderno-plano';
 header.before(plano);plano.append(principal);if(fotos)plano.append(fotos);
 const parede=document.createElement('section');parede.id='paredeEstante';parede.className='parede-estante';parede.setAttribute('aria-label','Estante na parede acima do caderno');
 parede.innerHTML='<div class="parede-estante-moldura"><iframe data-local-src="../widget-estante/index.html?embed=1&v=20261013-17" title="Estante Rebojar na parede" loading="eager"></iframe></div>';
 plano.before(parede);parede.append(header);
 const retorno=document.createElement('button');retorno.className='parede-retorno-faixa';retorno.type='button';retorno.setAttribute('aria-label','Voltar à mesa do caderno');retorno.title='Clique duas vezes para voltar à mesa';document.body.append(retorno);
 const puxador=document.createElement('button');puxador.id='paredePuxador';puxador.className='parede-puxador';puxador.type='button';puxador.setAttribute('aria-expanded','false');puxador.setAttribute('aria-controls','paredeEstante');puxador.setAttribute('aria-label','Puxar o caderno para baixo e olhar a estante na parede');puxador.title='Puxe para baixo para olhar a estante';header.append(puxador);
 const moldura=parede.querySelector('.parede-estante-moldura'),quadro=parede.querySelector('iframe');
 let progresso=0,arraste=null,ignorarClique=false,temporizadorAnimacao=null;
 const distancia=()=>Math.max(220,Math.min(innerHeight*.46,430));
 const medir=()=>{const altura=Math.max(1,header.getBoundingClientRect().height);parede.style.setProperty('--camera-header-altura',`${altura.toFixed(1)}px`);plano.style.setProperty('--camera-header-altura',`${altura.toFixed(1)}px`);retorno.style.height=`${altura.toFixed(1)}px`;return altura;};
 const aplicar=(valor,animar=false)=>{
  progresso=Math.max(0,Math.min(1,valor));
  clearTimeout(temporizadorAnimacao);plano.classList.toggle('camera-animando',animar);parede.classList.toggle('camera-animando',animar);
  const paredeVisivel=progresso>0.015,aberta=progresso>.86;
  const alturaHeader=medir(),curso=Math.max(1,innerHeight-alturaHeader*2);
  plano.style.setProperty('--camera-caderno-y',`${(progresso*curso).toFixed(1)}px`);
  plano.style.setProperty('--camera-caderno-z',`${(Math.pow(progresso,.86)*340).toFixed(1)}px`);
  plano.style.setProperty('--camera-caderno-rotacao',`${(progresso*76).toFixed(2)}deg`);
  plano.style.setProperty('--camera-caderno-brilho',(1-progresso*.2).toFixed(3));
  parede.style.setProperty('--camera-parede-y',`${(-curso*(1-progresso)).toFixed(1)}px`);
  document.body.classList.toggle('camera-em-movimento',paredeVisivel||animar);document.body.classList.toggle('parede-aberta',aberta);
  moldura.inert=!aberta;quadro.tabIndex=aberta?0:-1;retorno.tabIndex=aberta?0:-1;puxador.setAttribute('aria-expanded',String(aberta));
  puxador.setAttribute('aria-label',aberta?'Voltar à mesa do caderno':'Olhar para cima e ver a estante na parede');
  if(animar)temporizadorAnimacao=setTimeout(()=>{plano.classList.remove('camera-animando');parede.classList.remove('camera-animando');if(progresso===0)document.body.classList.remove('camera-em-movimento');},800);
 };
 const encaixar=abrir=>aplicar(abrir?1:0,true);
 const controleNoHeader=alvo=>alvo instanceof Element&&Boolean(alvo.closest('a,button,input,label,select,textarea'));
 const comecar=e=>{if(e.button!==0||controleNoHeader(e.target))return;e.preventDefault();plano.classList.remove('camera-animando');parede.classList.remove('camera-animando');arraste={id:e.pointerId,y:e.clientY,inicio:progresso,mexeu:false};header.setPointerCapture(e.pointerId);document.body.classList.add('parede-arrastando');};
 header.addEventListener('pointerdown',comecar);
 header.addEventListener('pointermove',e=>{if(!arraste||arraste.id!==e.pointerId)return;const delta=e.clientY-arraste.y;arraste.mexeu=arraste.mexeu||Math.abs(delta)>4;if(arraste.mexeu){e.preventDefault();aplicar(arraste.inicio+delta/distancia());}});
 const terminar=e=>{if(!arraste||arraste.id!==e.pointerId)return;const mexeu=arraste.mexeu;arraste=null;document.body.classList.remove('parede-arrastando');ignorarClique=mexeu;if(mexeu)encaixar(progresso>.32);};
 header.addEventListener('pointerup',terminar);header.addEventListener('pointercancel',e=>{terminar(e);encaixar(false);});
 header.addEventListener('click',e=>{if(controleNoHeader(e.target))return;if(ignorarClique){ignorarClique=false;return;}encaixar(progresso<.5);});
 puxador.addEventListener('click',()=>{if(ignorarClique){ignorarClique=false;return;}encaixar(progresso<.5);});
 retorno.addEventListener('dblclick',event=>{event.preventDefault();encaixar(false);});
 retorno.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();encaixar(false);}});
 addEventListener('resize',()=>aplicar(progresso));
 addEventListener('keydown',e=>{if(e.key==='Escape'&&progresso>0)encaixar(false);});
 requestAnimationFrame(()=>aplicar(0));
}
function setupAutoHideHeader(){
 const header=document.querySelector('.barra');if(!header)return;
 const sound=$('somEfeitos'),studio=document.querySelector('.estudio-som-link');
 if(sound&&studio&&!document.querySelector('.controles-som-fixos')){const fixed=document.createElement('div');fixed.className='controles-som-fixos';fixed.setAttribute('aria-label','Controles de som');document.body.append(fixed);fixed.append(sound,studio);}
 let hideTimer=null,headerHeight=header.getBoundingClientRect().height;
 const cancelHide=()=>{clearTimeout(hideTimer);hideTimer=null;};
 const show=()=>{cancelHide();header.classList.remove('barra-oculta');headerHeight=header.getBoundingClientRect().height||headerHeight;};
 const scheduleHide=()=>{cancelHide();hideTimer=setTimeout(()=>{if(!header.matches(':hover')&&!header.contains(document.activeElement))header.classList.add('barra-oculta');},2000);};
 header.addEventListener('pointerenter',show);
 header.addEventListener('pointerleave',scheduleHide);
 header.addEventListener('focusin',show);
 header.addEventListener('focusout',scheduleHide);
 window.addEventListener('pointermove',event=>{if(event.clientY<=Math.max(12,headerHeight)){show();return;}if(!header.classList.contains('barra-oculta')&&!header.matches(':hover'))scheduleHide();},{passive:true});
 window.addEventListener('blur',scheduleHide);
 scheduleHide();
}
async function init(){
 current=primeiraAberturaComConteudo();atualizarBotaoSom();render();document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
 if(publicDemo){
   try{state=validate(appConfig.initialState||defaultState);current=paginaInicialPelaURL();closed=state.publicationView?.closed===true;if(typeof state.publicationView?.soundEnabled==='boolean')somAtivo=state.publicationView.soundEnabled;atualizarBotaoSom();}
  catch(error){console.error(error);state=validate(defaultState);}
  document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);
   for(const name of ['backup','restaurar']){$(name).setAttribute('aria-disabled','true');$(name).title='Disponível no aplicativo Caderno de Bordo';$(name).onclick=recursoDoAplicativo;}
   $('exportar').removeAttribute('aria-disabled');$('exportar').title='Apoie o projeto para fazer uma exportação desta visita';
   render();await iniciarIdentidade();aplicarModoComercialEmManutencao();avisar(statusDaCopia());requestAnimationFrame(paginateSavedTitles);return;
 }
 try{db=await new Promise((resolve,reject)=>{const req=indexedDB.open('rebojar-caderno-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('caderno');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Armazenamento ocupado'));});const saved=await new Promise((resolve,reject)=>{const req=db.transaction('caderno').objectStore('caderno').get('principal');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(saved){const parsed=JSON.parse(saved),migrated=Number(parsed.layoutVersion)!==2||parsed.pages?.[0]?.kind!=='endpaper'||parsed.pages?.[1]?.kind!=='endpaper';state=validate(parsed);current=primeiraAberturaComConteudo();render();if(migrated)persist();}avisar('Caderno local · pronto para editar');}catch{db=null;avisar('Use Guardar cópia para preservar suas alterações');}
 finally{document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);render();requestAnimationFrame(paginateSavedTitles);}
}
setupPencilCase();
setupWidgetEstojo();
setupAutoHideHeader();
init();
