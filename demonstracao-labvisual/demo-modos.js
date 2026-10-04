(() => {
 'use strict';
 const $=id=>document.getElementById(id),app=window.LabVisualPublicDemo,R=window.LabDemoResources;
 const dataset=window.LAB_DEMO,ext=window.LAB_EXTENSIONS,backgrounds=window.LAB_BACKGROUND_VARIANTS;
 const originalImages=dataset.images.map(item=>({...item}));
 const defaults={version:1,pooling:'mean',normalization:'l2',metric:'cosine'};
 const format=(v,digits=8)=>v.toLocaleString('pt-BR',{maximumFractionDigits:digits});
 const json=(id,value)=>window.LabVisualRenderJson(id,value),views=['single','batch','neighbors','video'];
 const notes=new Map(),noteKeys=new Map();
 function bindNotes(id,key){const previous=noteKeys.get(id);if(previous===key)return;if(previous!==undefined)notes.set(id+previous,$(id).value);$(id).value=notes.get(id+key)||'';noteKeys.set(id,key);}
 function showView(name,{focus=false}={}) {
  views.forEach(candidate=>{const on=candidate===name;$(candidate+'View').hidden=!on;$(candidate+'Tab').setAttribute('aria-selected',String(on));$(candidate+'Tab').tabIndex=on?0:-1;});
  if(focus)$(name+'Tab').focus();if(name==='neighbors')renderNeighbors();
 }
 views.forEach((name,index)=>{
  $(name+'Tab').addEventListener('click',()=>showView(name));
  $(name+'Tab').addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||event.ctrlKey||event.altKey||event.metaKey)return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;showView(views[next],{focus:true});
  });
 });
 function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
 function button(text,callback,className='button secondary compact'){const e=node('button',text,className);e.type='button';e.addEventListener('click',callback);return e;}
 function image(item){const e=node('img');e.src=item.prepared;e.alt='';e.loading='lazy';return e;}
 function openImage(item){showView('single');app.openImage(item);}
 function setupPicker(){
  for(const item of dataset.images){
   const e=node('button',undefined,'entry-option');e.type='submit';e.value='example:'+item.id;e.dataset.entryId=e.value;
   const pic=image(item),copy=node('span',undefined,'entry-option-copy');pic.src=item.file;
   copy.append(node('strong',item.label),node('span',`${item.tokens_before} patches · ${item.tokens_after} tokens depois do merger`),node('small','Execução registrada'));e.append(pic,copy);$('entryOptions').append(e);
  }
 }
 function recipeControl(prefix,onChange){
  const container=$(prefix+'RecipeControls'),controls=node('div',undefined,'controls');
  const titles={pooling:'Como resumir os tokens',normalization:'Como normalizar',metric:'Como comparar'};
  for(const field of ['pooling','normalization','metric']){
   const label=node('label'),select=node('select');select.id=prefix+field;label.append(node('span',titles[field]));
   for(const [value,title]of Object.entries(R.labels[field]))select.append(new Option(title,value));
   select.value=defaults[field];select.addEventListener('change',()=>{explain();onChange?.();});label.append(select);controls.append(label);
  }
  const description=node('p',undefined,'small');description.id=prefix+'RecipeHelp';container.append(controls,description);
  const value=()=>({version:1,...Object.fromEntries(['pooling','normalization','metric'].map(f=>[f,$(prefix+f).value]))});
  function explain(){
   const r=value(),pooling={mean:'Média por coordenada de todos os tokens.',max:'Maior valor por coordenada entre os tokens; não é o maior valor absoluto.',median:'Valor central por coordenada; para uma quantidade par, média dos dois centrais.'},normalization={l2:'Divide pela raiz da soma dos quadrados.',l1:'Divide pela soma dos valores absolutos.',linf:'Divide pela maior magnitude.',none:'Mantém o agregado sem normalizar.'},metric={cosine:'Cosseno compara direções; maior fica mais perto.',euclidean:'Distância euclidiana: menor fica mais perto.',dot:'Produto escalar considera direção e comprimento; maior fica primeiro.'};
   description.textContent=[pooling[r.pooling],normalization[r.normalization],metric[r.metric]].join(' ');
  }
  explain();return{value,set(r){for(const f of ['pooling','normalization','metric'])$(prefix+f).value=r[f];explain();},disable(on){controls.querySelectorAll('select').forEach(e=>e.disabled=on);}};
 }
 function collection(color){return originalImages.map(item=>item.id==='branco_transparente'?{...item,...backgrounds.transparent_entries[item.id].variants[color],_selectedBackground:color,_hasTransparentPixels:true}:({...item}));}
 const sets=[{id:'base',label:'Coleção pública · fundo azul · média/L2',images:collection('#2eaee8'),recipe:{...defaults}}];
 let activeSet=sets[0],anchor=0,history=[],neighborResult=null,lastBatch=null,building=false,stop=false,batchChecked=false;
 const batchRecipe=recipeControl('batch',()=>{if(!building)$('batchState').textContent='Receita alterada. Reúna um novo lote para aplicar estas escolhas.';});
 const neighborRecipe=recipeControl('neighbor',()=>renderNeighbors());
 function setOptions(){$('neighborDataset').replaceChildren(...sets.map(set=>new Option(set.label,set.id)));$('neighborDataset').value=activeSet.id;}
 function selectSet(set){activeSet=set;anchor=0;history=[];neighborRecipe.set(set.recipe);setOptions();renderNeighbors();}
 function gallery(container,items,select,selectedId=null){
  container.replaceChildren(...items.map(({item,index})=>{const b=button('',()=>select(index),'batch-card');b.append(image(item),node('strong',`${String(index+1).padStart(2,'0')} · ${item.label}`),node('small',`${item.tokens_before} → ${item.tokens_after} tokens`));if(item.id===selectedId)b.setAttribute('aria-current','true');return b;}));
 }
 function batchInputs(){
  const images=collection($('batchBackground').value);$('batchConditions').textContent=`${images.length} imagens · cores originais · até 65.536 pixels · CPU FP32 · pesos congelados.`;$('batchSummary').textContent=images.length+' entradas registradas';
  gallery($('batchGallery'),images.map((item,index)=>({item,index})),index=>openImage(images[index]));
  json('batchInputRecord',{images:images.map(i=>({id:i.id,file:i.file,preparation:i.preparation,provenance:i.provenance})),count:images.length});return images;
 }
 function batchRecord(){if(!lastBatch)return null;return{schema:1,math_core:window.LabVisualMath.version,mode:'lote de demonstração',status:lastBatch.status,recipe:lastBatch.recipe,count:lastBatch.images.length,requested:12,notes:$('batchNotes').value,images:lastBatch.images.map((i,index)=>({index,id:i.id,file:i.file,preparation:i.preparation,provenance:i.provenance})),matrices:{before:[lastBatch.images.length,1152],after:[lastBatch.images.length,4096]},source:'Agregados registrados, normalizados no navegador. O encoder não foi executado nesta página.'};}
 async function buildBatch(){
  if(!batchChecked||building)return;building=true;stop=false;batchRecipe.disable(true);$('batchBackground').disabled=true;$('batchCheck').disabled=true;$('batchStart').disabled=true;$('batchStop').hidden=false;$('batchStop').disabled=false;$('batchDownloads').hidden=true;
  const images=collection($('batchBackground').value),recipe=batchRecipe.value(),done=[],before=[],after=[];$('batchProgress').value=0;$('batchAppliedRecipe').textContent=R.describe(recipe);
  try{
   for(const item of images){const vectors=R.vectors([item],recipe);before.push(vectors.before[0]);after.push(vectors.after[0]);done.push(item);$('batchProgress').value=done.length;$('batchState').textContent=`${done.length}/${images.length} representações reunidas no navegador · ${item.label}.`;await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));if(stop)break;}
   lastBatch={id:'lote-'+Date.now(),label:`Lote ${sets.length} · ${done.length} imagens · ${R.describe(recipe)}`,images:done,recipe,vectors:{before,after},status:done.length===images.length?'concluído':'interrompido'};
   sets.push(lastBatch);if(sets.length>9){const removable=sets.findIndex((set,i)=>i>0&&set!==activeSet&&set!==lastBatch);if(removable>0)sets.splice(removable,1);}setOptions();
   $('batchState').textContent=`${lastBatch.status==='concluído'?'Concluído':'Interrompido'}: ${done.length} de ${images.length} imagens. Nenhuma inferência nova; somente leitura dos agregados registrados.`;json('batchRecord',batchRecord());$('batchDownloads').hidden=false;
  }catch(error){$('batchState').textContent='Não foi possível reunir o lote: '+error.message;}
  finally{building=false;batchRecipe.disable(false);$('batchBackground').disabled=false;$('batchCheck').disabled=false;$('batchStart').disabled=false;$('batchStop').hidden=true;}
 }
 for(const c of backgrounds.palette)$('batchBackground').append(new Option(c.label,c.hex||c.value||c.color));
 if(![...$('batchBackground').options].some(o=>o.value==='#2eaee8'))$('batchBackground').replaceChildren(...Object.keys(backgrounds.transparent_entries.branco_transparente.variants).map(c=>new Option(c.toUpperCase(),c)));
 $('batchBackground').value='#2eaee8';$('batchBackground').addEventListener('change',()=>{batchChecked=false;$('batchStart').disabled=true;$('batchCheckStatus').textContent='O fundo mudou; confira a coleção novamente.';batchInputs();});
 $('batchCheck').addEventListener('click',()=>{batchChecked=true;const images=batchInputs();$('batchCheckStatus').textContent=`${images.length} imagens conferidas · ${images.filter(i=>i._hasTransparentPixels).length} com transparência · todas com representações disponíveis.`;$('batchStart').disabled=false;});
 $('batchStart').addEventListener('click',buildBatch);$('batchStop').addEventListener('click',()=>{stop=true;$('batchStop').disabled=true;});
 $('batchNpz').addEventListener('click',()=>{if(lastBatch)R.download('lote_embeddings.npz',R.npz({antes_merger:lastBatch.vectors.before,depois_merger:lastBatch.vectors.after}));});
 $('batchJson').addEventListener('click',()=>R.json('lote_registro.json',batchRecord()));
 $('batchNeighbors').addEventListener('click',()=>{if(lastBatch){selectSet(lastBatch);showView('neighbors');$('neighborsView').scrollIntoView({behavior:'smooth'});}});
 $('batchCheckCode').textContent='# No laboratório local: a conferência precede o encoder.\nfrom pathlib import Path\nfiles = [p for p in Path(pasta).iterdir()\n         if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}]\n# A demo usa uma coleção pública registrada, sem acesso a pastas.';
 $('batchCode').textContent='# Trecho explicativo: para cada imagem, após a inferência\nimport numpy as np\nfrom analysis import analyze\nleitura = analyze(tokens_antes, tokens_depois, receita)\n# Empilhar um vetor por imagem em cada estágio.\nantes = np.stack(vetores_antes)\ndepois = np.stack(vetores_depois)\nnp.savez_compressed("embeddings.npz", antes_merger=antes, depois_merger=depois)';
 function chooseAnchor(index,push=true){if(index!==anchor&&push)history.push(anchor);anchor=index;renderNeighbors();}
 function cards(target,rows,common,metric){
  target.replaceChildren(...rows.map(row=>{const item=activeSet.images[row.index],b=button('',()=>chooseAnchor(row.index),'neighbor-card-public'),copy=node('span');copy.append(node('strong',item.label),node('small',R.labels.metric[metric]+' '+format(row.score)));if(common.has(row.index))copy.append(node('span','Nos dois grupos','common-badge'));b.append(image(item),copy);return b;}));
 }
 function stats(id,values){const target=$(id);target.replaceChildren();if(!values){target.append(node('p','Não há outra imagem neste conjunto.'));return;}for(const [field,label]of [['min','Mínimo'],['median','Mediana'],['max','Máximo']])target.append(node('p',label+': '+format(values[field])));target.append(node('p',`Entre ${values.count} outras imagens.`,'small'));}
 function neighborRecord(){return{schema:1,math_core:window.LabVisualMath.version,source:'Comparação de agregados públicos; sem inferência no navegador',dataset:activeSet.id,dataset_recipe:activeSet.recipe,comparison_recipe:neighborRecipe.value(),anchor:{index:anchor,id:activeSet.images[anchor].id},images:activeSet.images.map(i=>({id:i.id,background:i._selectedBackground||i.background,provenance:i.provenance})),results:neighborResult,notes:$('neighborNotes').value};}
 function renderNeighborGallery(){
  const query=$('neighborSearch').value.trim().toLocaleLowerCase('pt-BR'),items=activeSet.images.map((item,index)=>({item,index})).filter(({item,index})=>`${index+1} ${String(index+1).padStart(2,'0')} ${item.label} ${item.id}`.toLocaleLowerCase('pt-BR').includes(query));
  gallery($('neighborGallery'),items,index=>{chooseAnchor(index);$('neighbor-title').scrollIntoView({behavior:'smooth',block:'center'});},activeSet.images[anchor].id);$('neighborGalleryCount').textContent=`${items.length} de ${activeSet.images.length} referências. A busca não altera o conjunto comparado.`;
 }
 function renderNeighbors(){
  const recipe=neighborRecipe.value(),item=activeSet.images[anchor];if(!item)return;
  bindNotes('neighborNotes',activeSet.id+':'+anchor+':'+JSON.stringify(recipe));
  const before=R.ranking(activeSet.images,anchor,'before',recipe),after=R.ranking(activeSet.images,anchor,'after',recipe),common=new Set(before.neighbors.filter(r=>after.neighbors.some(a=>a.index===r.index)).map(r=>r.index));neighborResult={before,after,common:[...common]};
  $('neighborsRecipeBadge').textContent=R.describe(recipe);$('neighborsDatasetNote').textContent=`${activeSet.images.length} imagens neste conjunto. Receita de origem: ${R.describe(activeSet.recipe)}. A leitura interativa abaixo não altera esse registro.`;
  $('neighbor-title').textContent=item.label;$('neighborAnchorImage').src=item.prepared;$('neighborAnchorImage').alt=item.label+' — entrada preparada';$('neighborOverlap').textContent=`${common.size} imagens em comum entre os dois grupos`;$('neighborBack').disabled=!history.length;
  cards($('neighborsBefore'),before.neighbors,common,recipe.metric);cards($('neighborsAfter'),after.neighbors,common,recipe.metric);stats('beforeStats',before.statistics);stats('afterStats',after.statistics);
  $('neighborsMetricNote').textContent=recipe.metric==='euclidean'?'Menor distância indica maior proximidade nesta receita.':'Valores maiores ficam primeiro nesta receita. Os números não são porcentagens de semelhança, confiança ou compreensão.';
  const vectors=R.vectors(activeSet.images,recipe).after,v=vectors[anchor],coordinate=3994,peak=v.reduce((best,value,index)=>Math.abs(value)>Math.abs(v[best])?index:best,0),shares=R.statistics(vectors.map(row=>R.squaredShare(row,coordinate)));
  $('neighborPeak').textContent=`Nesta referência: coordenada 3995 = ${format(v[coordinate])}; parcela na soma dos quadrados = ${format(100*R.squaredShare(v,coordinate),2)}%. A maior magnitude está na coordenada ${peak+1}.`;
  $('datasetPeak').textContent=`No conjunto, a parcela da coordenada 3995 vai de ${format(shares.min*100,2)}% a ${format(shares.max*100,2)}%; mediana ${format(shares.median*100,2)}%.`;
  $('biasReading').textContent=`O tensor ${ext.bias.tensor} contém +${format(ext.bias.value)} no índice 3994, a coordenada 3995 na tela. É o maior viés em magnitude nesse tensor; a mediana das magnitudes é ${format(ext.bias.median_absolute_bias)}.`;
  json('neighborsRecord',neighborRecord());json('biasRecord',ext.bias);renderNeighborGallery();
 }
 $('neighborDataset').addEventListener('change',()=>selectSet(sets.find(s=>s.id===$('neighborDataset').value)));
 $('neighborBack').addEventListener('click',()=>{if(history.length)chooseAnchor(history.pop(),false);});$('neighborSource').addEventListener('click',()=>{$('neighborGalleryPanel').scrollIntoView({behavior:'smooth'});$('neighborSearch').focus({preventScroll:true});});
 $('openNeighborEntry').addEventListener('click',()=>openImage(activeSet.images[anchor]));$('neighborSearch').addEventListener('input',renderNeighborGallery);$('neighborExport').addEventListener('click',()=>R.json('comparacao_vizinhos.json',neighborRecord()));
 $('neighborsCode').textContent='# Trecho equivalente no laboratório\nfrom analysis import ranking\nresultado = ranking(vetores_do_mesmo_estagio, indice_referencia,\n                    metric=receita["metric"], k=5)\n# A referência é excluída; estatísticas usam todas as demais imagens.\n# A demo aplica a mesma matemática em JavaScript.';
 $('biasCode').textContent='# Leitura de um tensor de pesos, sem inferir significado visual\nfrom safetensors import safe_open\nwith safe_open(arquivo_de_pesos, framework="pt", device="cpu") as f:\n    bias = f.get_tensor("model.visual.merger.linear_fc2.bias")\n    valor = bias[3994].float().item()  # 0.8984375\n# Coordenadas na interface começam em 1; índices do código começam em 0.';
 let sequence=null,videoReading=null;
 const videoRecipe=recipeControl('video',()=>renderVideoAnalysis());
 window.LabVisualCharts.mount($('videoCharts'),'video_');
 // O controle do primeiro gráfico acompanha o título da seção de vídeo.
 $('videoChartsHeading').append($('video_barAuto'));
 $('videoCharts').querySelector('.chart-toolbar-execution').remove();
 const videoCharts=window.LabVisualCharts.create('video_');
 function frame(index){
  const i=Math.min(sequence.prepared_frames.length-1,Math.max(0,Number(index)));$('sequenceFrame').value=i;$('sequenceFocus').src=sequence.prepared_frames[i];$('sequenceFocus').alt=`Quadro preparado em ${format(sequence.preparation.timestamps[i])} s`;$('sequenceFrameReading').textContent=`Quadro ${i+1}/${sequence.prepared_frames.length} · ${format(sequence.preparation.timestamps[i])} s · par temporal ${Math.floor(i/2)+1}.`;document.querySelectorAll('#sequenceFrames button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));
 }
 function videoRecord(){return{schema:1,math_core:window.LabVisualMath.version,id:sequence.id,format:sequence.format,preparation:sequence.preparation,execution:sequence.execution,provenance:sequence.provenance,reading:{recipe:videoRecipe.value(),stage:$('videoStage').value,pair:Number($('videoScope').value),divisor:videoReading?.divisor,comparisons:videoReading?.comparisons},notes:$('videoNotes').value};}
 function renderVideoAnalysis(){
  if(!sequence)return;const recipe=videoRecipe.value(),stage=$('videoStage').value,scope=Number($('videoScope').value);videoReading=R.sequence(sequence,recipe,stage,scope);videoCharts.setVector(videoReading.vector);
  const stageLabel=stage==='before'?'antes':'depois',scopeLabel=scope<0?'tokens de toda a sequência amostrada':`tokens do par temporal ${scope+1}`;
  $('videoRecipeReading').textContent=`${R.describe(recipe)} · divisor ${format(videoReading.divisor)} · ${videoReading.vector.length.toLocaleString('pt-BR')} coordenadas.`;
  $('videoVectorCaption').textContent=`${R.labels.pooling[recipe.pooling]} dos ${scopeLabel}, ${stageLabel} do merger. Selecionar um quadro na prévia não muda este vetor.`;
  $('videoTemporalComparison').textContent=videoReading.comparisons.length?`${R.labels.metric[recipe.metric]} entre pares consecutivos: `+videoReading.comparisons.map((v,i)=>`par ${i+1} → ${i+2}: ${format(v)}`).join(' · '):'Este recorte tem um único par temporal; não há outro par para comparar.';
  $('videoTokens').href=sequence.tokens_file;json('sequenceRecord',videoRecord());
 }
 function renderSequence(){
  sequence=ext.video_cases.find(s=>s.format===$('sequenceFormat').value&&s.scenario===$('sequenceScenario').value);if(!sequence)return;
  bindNotes('videoNotes',sequence.id);
  const p=sequence.preparation,media=node(sequence.format==='GIF'?'img':'video');media.src=sequence.file;if(sequence.format==='GIF')media.alt='Animação geométrica original';else{media.controls=true;media.preload='metadata';media.setAttribute('aria-label','Vídeo geométrico original');}
  $('sequenceOriginal').replaceChildren(media);$('sequenceMeta').textContent=`Duração total: ${format(sequence.duration)} s · recorte ${format(p.start)}–${format(p.end)} s · ${p.sampled_frames} quadros · ${p.temporal_pairs} pares · fundo branco.`;
  $('sequenceShapes').textContent=`${p.prepared_wh.join(' × ')} pixels por quadro · grade ${p.grid_thw.join(' × ')} · ${sequence.execution.antes_shape.join(' × ')} antes / ${sequence.execution.depois_shape.join(' × ')} depois. ${p.repeated_samples} seleções repetidas.`;
  $('sequenceFrame').max=sequence.prepared_frames.length-1;$('sequenceFrames').replaceChildren(...sequence.prepared_frames.map((src,i)=>{const b=button('',()=>frame(i),'sequence-frame-button'),im=node('img');im.src=src;im.alt='';b.append(im,node('span',format(p.timestamps[i])+' s'));return b;}));
  $('videoScope').replaceChildren(new Option('Sequência inteira amostrada','-1'),...sequence.pairs.after.map((_,i)=>new Option(`Par ${i+1} · ${format(p.timestamps[i*2])} e ${format(p.timestamps[i*2+1])} s`,String(i))));frame(0);updateGrid();json('sequencePreparationRecord',p);renderVideoAnalysis();
 }
 function updateGrid(){if(!sequence)return;const grid=$('sequencePatchGrid'),groups=$('sequenceShowGroups').checked;grid.hidden=!$('sequenceShowPatches').checked&&!groups;grid.style.setProperty('--patch-columns',sequence.preparation.grid_thw[2]/(groups?2:1));grid.style.setProperty('--patch-rows',sequence.preparation.grid_thw[1]/(groups?2:1));grid.classList.toggle('group-grid',groups);}
 for(const id of ['sequenceFormat','sequenceScenario'])$(id).addEventListener('change',renderSequence);
 for(const id of ['videoStage','videoScope'])$(id).addEventListener('change',renderVideoAnalysis);
 for(const id of ['sequenceShowPatches','sequenceShowGroups'])$(id).addEventListener('change',updateGrid);
 $('sequenceFrame').addEventListener('input',()=>frame($('sequenceFrame').value));$('videoJson').addEventListener('click',()=>R.json('sequencia_registro.json',videoRecord()));
 $('videoNpz').addEventListener('click',()=>{const recipe=videoRecipe.value(),b=R.sequence(sequence,recipe,'before'),a=R.sequence(sequence,recipe,'after');R.download('sequencia_vetores_e_pares.npz',R.npz({antes_merger:b.vector,depois_merger:a.vector,pares_antes:b.pairs,pares_depois:a.pairs}));});
 $('sequencePrepareCode').textContent='# Trecho explicativo: amostragem antes da inferência\nimport numpy as np\n# O último instante selecionado é anterior ao fim do recorte.\ntempos = np.linspace(inicio, fim, numero_de_quadros, endpoint=False)\n# A bancada escolhe o quadro ativo em cada instante e prepara os pixels.\n# Aqui os parâmetros e pixels são lidos da execução registrada.';
 $('sequencePairsCode').textContent='# Usando a grade produzida pelo processador (T, H, W)\npares_antes = tokens_antes.reshape(T, H * W, 1152)\npares_depois = tokens_depois.reshape(T, H * W // 4, 4096)\n# T é a quantidade de pares temporais. O merger reúne 2 × 2 posições.';
 $('videoAnalysisCode').textContent='# Trecho equivalente da leitura de tokens salvos\nfrom analysis import represent\nbruto, vetor, divisor = represent(tokens_do_escopo, receita)\n# Repetir por par temporal para investigar mudanças na sequência.\n# Usar a mesma receita e o mesmo estágio ao comparar pares.';
 setupPicker();batchInputs();setOptions();renderNeighbors();renderSequence();
 window.addEventListener('labvisual:entrychange',event=>document.querySelectorAll('[data-entry-id]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.entryId===event.detail.entryId))));
})();
