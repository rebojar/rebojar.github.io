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
 const batchPreparationIds=['batchLimit','batchVariant','batchBackground'];
 function batchPreparation(){const limit=Number($('batchLimit').value);return{resolution_profile:limit?'orcamento':'checkpoint',max_pixels:limit?limit*limit:null,variant:$('batchVariant').value,background:$('batchBackground').value};}
 function matchingBatchImages(){
  const conditions=batchPreparation();
  if(!backgrounds.transparent_entries.branco_transparente.variants[conditions.background])return null;
  const images=collection(conditions.background);
  return images.every(item=>item.preparation.perfil_resolucao===conditions.resolution_profile&&item.preparation.max_pixels===conditions.max_pixels&&item.preparation.variante===conditions.variant)?images:null;
 }
 const sets=[{id:'base',label:'Coleção pública · fundo azul · média/L2',images:collection('#2eaee8'),recipe:{...defaults}}];
 let activeSet=sets[0],anchor=0,history=[],neighborResult=null,lastBatch=null,building=false,stop=false,batchChecked=false;
 const batchRecipe=recipeControl('batch',()=>{if(!building)$('batchState').textContent='Receita alterada. Reúna um novo lote para aplicar estas escolhas.';});
 const neighborRecipe=recipeControl('neighbor',()=>renderNeighbors());
 function setOptions(){$('neighborDataset').replaceChildren(...sets.map(set=>new Option(set.label,set.id)));$('neighborDataset').value=activeSet.id;}
 function selectSet(set){activeSet=set;anchor=0;history=[];neighborRecipe.set(set.recipe);setOptions();renderNeighbors();}
 function gallery(container,items,select,selectedId=null,prepared=true){
  container.replaceChildren(...items.map(({item,index})=>{const b=button('',()=>select(index),'batch-card'),pic=image(item);if(!prepared){pic.src=item.file;b.disabled=true;}b.append(pic,node('strong',`${String(index+1).padStart(2,'0')} · ${item.label}`),node('small',prepared?`${item.tokens_before} → ${item.tokens_after} tokens`:'Entrada original · sem execução nestas condições'));if(item.id===selectedId)b.setAttribute('aria-current','true');return b;}));
 }
 function batchInputs(){
  const images=matchingBatchImages();$('batchConditions').textContent=`${originalImages.length} imagens públicas · 1 com transparência · CPU FP32 · pesos congelados.`;
  $('batchPreparationStatus').textContent=images?'Condições disponíveis: 65.536 pixels, cores originais e fundo selecionado. As oito cores sugeridas no seletor têm execuções registradas.':'Esta combinação ainda não tem execuções registradas para o lote. A demo reúne resultados em cores originais, com 65.536 pixels e os oito fundos sugeridos no seletor.';
  $('batchUseRecorded').hidden=!!images;$('batchSummary').textContent=images?images.length+' entradas registradas':'Sem execução nestas condições';
  if(images)gallery($('batchGallery'),images.map((item,index)=>({item,index})),index=>openImage(images[index]));
  else gallery($('batchGallery'),originalImages.map((item,index)=>({item,index})),()=>{},null,false);
  json('batchInputRecord',{conditions:batchPreparation(),matching_execution:!!images,images:(images||originalImages).map(i=>({id:i.id,file:i.file,...(images?{preparation:i.preparation,provenance:i.provenance}:{})})),count:originalImages.length});return images;
 }
 function batchRecord(){if(!lastBatch)return null;return{schema:1,math_core:window.LabVisualMath.version,mode:'lote de demonstração',status:lastBatch.status,conditions:lastBatch.conditions,recipe:lastBatch.recipe,count:lastBatch.images.length,requested:12,processed:lastBatch.rows.length,results:lastBatch.rows,notes:$('batchNotes').value,images:lastBatch.images.map((i,index)=>({index,id:i.id,file:i.file,preparation:i.preparation,provenance:i.provenance})),matrices:{before:[lastBatch.images.length,1152],after:[lastBatch.images.length,4096]},source:'Agregados registrados, normalizados no navegador. O encoder não foi executado nesta página.'};}
 function invalidateBatchPreparation(){
  if(building)return;batchChecked=false;lastBatch=null;$('batchStart').disabled=true;$('batchDownloads').hidden=true;$('batchRecord').replaceChildren();$('batchAppliedRecipe').hidden=true;
  $('batchProgress').value=0;$('batchCounts').textContent='0 de 12 concluídas · 0 válidas · 0 com erro';$('batchCurrent').textContent='O andamento aparece ao reunir as representações.';
  const row=node('tr'),cell=node('td','Nenhuma imagem concluída nestas condições.');cell.colSpan=4;row.append(cell);$('batchRows').replaceChildren(row);
  const images=batchInputs(),message=images?'As condições mudaram; confira a coleção novamente.':'Escolha condições com execuções registradas para reunir o lote.';
  $('batchCheckStatus').textContent=message;$('batchState').textContent=message;
 }
 function appendBatchRow(item,error){
  const row=node('tr',undefined,error?'batch-row-error':undefined);
  for(const text of [item.file.split('/').pop(),error?'Erro: '+error:'Concluída',error?'—':format(item.tokens_before),error?'—':format(item.tokens_after)])row.append(node('td',text));
  $('batchRows').append(row);
 }
 async function buildBatch(){
  const images=matchingBatchImages();if(!batchChecked||building||!images)return;building=true;stop=false;batchRecipe.disable(true);batchPreparationIds.forEach(id=>$(id).disabled=true);$('batchCheck').disabled=true;$('batchStart').disabled=true;$('batchStop').hidden=false;$('batchStop').disabled=false;$('batchDownloads').hidden=true;
  const conditions=batchPreparation(),recipe=batchRecipe.value(),done=[],before=[],after=[],rows=[];let errors=0;
  lastBatch=null;$('batchProgress').value=0;$('batchProgress').max=images.length;$('batchRows').replaceChildren();$('batchRecord').replaceChildren();
  $('batchAppliedRecipe').hidden=false;$('batchAppliedRecipe').textContent='Receita deste lote: '+R.describe(recipe);
  $('batchCounts').textContent=`0 de ${images.length} concluídas · 0 válidas · 0 com erro`;
  $('batchState').textContent='Reunindo as representações registradas';$('batchResults').scrollIntoView({behavior:'smooth',block:'start'});
  try{
   for(const [index,item]of images.entries()){
    $('batchCurrent').textContent=`${item.file.split('/').pop()} · leitura do registro ${index+1}/${images.length}`;
    // Breve pausa da apresentação guiada, para permitir acompanhar e interromper a leitura.
    await new Promise(resolve=>setTimeout(resolve,180));
    let error=null;
    try{const vectors=R.vectors([item],recipe);before.push(vectors.before[0]);after.push(vectors.after[0]);done.push(item);}catch(e){error=e.message||String(e);errors++;}
    rows.push({index,id:item.id,file:item.file,status:error?'erro':'concluída',...(error?{error}:{tokens_before:item.tokens_before,tokens_after:item.tokens_after})});appendBatchRow(item,error);
    $('batchProgress').value=rows.length;$('batchCounts').textContent=`${rows.length} de ${images.length} concluídas · ${done.length} válidas · ${errors} com erro`;
    if(stop)break;
   }
   const status=rows.length<images.length?'interrompido':errors?'concluído com erros':'concluído';
   lastBatch={id:'lote-'+Date.now(),label:`Lote ${sets.length} · ${done.length} imagens · ${R.describe(recipe)}`,images:done,conditions,recipe,vectors:{before,after},rows,status};
   if(done.length){sets.push(lastBatch);if(sets.length>9){const removable=sets.findIndex((set,i)=>i>0&&set!==activeSet&&set!==lastBatch);if(removable>0)sets.splice(removable,1);}setOptions();}
   $('batchState').textContent=`${status[0].toUpperCase()+status.slice(1)}: ${rows.length} de ${images.length} imagens conferidas.`;
   $('batchCurrent').textContent='Leitura dos registros encerrada. O encoder não foi executado.';
   json('batchRecord',batchRecord());$('batchDownloads').hidden=false;$('batchNpz').disabled=!done.length;$('batchNeighbors').disabled=!done.length;
  }catch(error){$('batchState').textContent='Não foi possível reunir o lote: '+error.message;}
  finally{building=false;batchRecipe.disable(false);batchPreparationIds.forEach(id=>$(id).disabled=false);$('batchCheck').disabled=false;$('batchStart').disabled=!batchChecked||!matchingBatchImages();$('batchStop').hidden=true;}
 }
 for(const c of backgrounds.palette)$('batchBackgroundColors').append(new Option(c.label,c.hex||c.value||c.color));
 for(const id of batchPreparationIds)$(id).addEventListener('input',invalidateBatchPreparation);
 $('batchUseRecorded').addEventListener('click',()=>{$('batchLimit').value='256';$('batchVariant').value='original';if(!backgrounds.transparent_entries.branco_transparente.variants[$('batchBackground').value])$('batchBackground').value='#2eaee8';invalidateBatchPreparation();});
 $('batchCheck').addEventListener('click',()=>{const images=batchInputs();batchChecked=!!images;$('batchCheckStatus').textContent=images?`${images.length} imagens conferidas · ${images.filter(i=>i._hasTransparentPixels).length} com transparência · todas com representações disponíveis.`:'A coleção tem 12 imagens, mas faltam execuções para as condições escolhidas no passo 2.';$('batchStart').disabled=!batchChecked;});
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
  $('neighbor-title').textContent=item.label;$('neighborFileName').textContent=`Imagem ${anchor+1} · ${item.file.split('/').pop()}`;$('neighborAnchorImage').src=item.prepared;$('neighborAnchorImage').alt=item.label+' — entrada preparada';$('neighborOverlap').textContent=`${common.size} em comum entre os dois grupos`;$('neighborBack').disabled=!history.length;
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
 function sequenceCases(){return ext.video_cases.filter(s=>s.format===$('sequenceFormat').value);}
 function sequenceParameters(){return{start:$('sequenceStart').valueAsNumber,end:$('sequenceEnd').valueAsNumber,sampled_frames:Number($('sequenceSampleCount').value),pixel_budget_per_frame:Number($('sequencePixelBudget').value),background:$('sequenceBackground').value.toLowerCase()};}
 function matchingSequence(){
  const values=sequenceParameters();
  return sequenceCases().find(s=>Object.entries(values).every(([key,value])=>s.preparation[key]===value));
 }
 function sequenceTimeError(){
  const {start,end}=sequenceParameters(),duration=sequenceCases()[0].duration;
  if(!Number.isFinite(start)||!Number.isFinite(end))return 'Preencha o início e o fim em segundos.';
  if(start<0)return 'O início deve ser zero ou maior.';
  if(end<=start)return 'O fim deve ser maior que o início.';
  if(end>duration)return `O arquivo dura ${format(duration)} s. O fim informado ultrapassa essa duração.`;
  return '';
 }
 function invalidateSequence(){
  sequence=null;videoReading=null;
  for(const id of ['sequenceApplied','sequencePreparedPanel','sequenceAnalysisPanel','sequenceChartPanel'])$(id).hidden=true;
  $('sequenceOriginal').replaceChildren();$('sequencePreparationRecord').textContent='Prepare a sequência para abrir os parâmetros registrados.';
  const duration=sequenceCases()[0].duration;
  $('sequenceStart').max=duration;$('sequenceEnd').max=duration;$('sequenceEndHelp').textContent=`O arquivo termina em ${format(duration)} s. Fim máximo para este trecho: ${format(duration)} s.`;
  const error=sequenceTimeError();$('sequencePrepare').disabled=!!error;
  $('sequencePrepareStatus').textContent=error||'Parâmetros definidos. Prepare a sequência para conferir se há uma execução registrada correspondente.';
  $('sequenceScenario').value=matchingSequence()?.scenario||'';
 }
 function useSequencePreset(){
  const selected=sequenceCases().find(s=>s.scenario===$('sequenceScenario').value);if(!selected)return;
  const p=selected.preparation;
  for(const [id,value]of Object.entries({sequenceStart:p.start,sequenceEnd:p.end,sequenceSampleCount:p.sampled_frames,sequencePixelBudget:p.pixel_budget_per_frame,sequenceBackground:p.background}))$(id).value=value;
  invalidateSequence();
 }
 function prepareSequence(){
  const error=sequenceTimeError();if(error){$('sequencePrepareStatus').textContent=error;return;}
  const registered=matchingSequence();
  if(!registered){invalidateSequence();$('sequencePrepareStatus').textContent='Esta combinação ainda não tem execução registrada na demo. Escolha uma das amostragens disponíveis abaixo ou use a bancada local para executar esses parâmetros.';return;}
  renderSequence(registered);
  for(const id of ['sequenceApplied','sequencePreparedPanel','sequenceAnalysisPanel','sequenceChartPanel'])$(id).hidden=false;
  $('sequencePrepareStatus').textContent='Sequência preparada: exibindo os quadros e resultados da execução registrada, sem nova inferência.';
 }
 function renderSequence(next){
  sequence=next;if(!sequence)return;
  bindNotes('videoNotes',sequence.id);
  const p=sequence.preparation,media=node(sequence.format==='GIF'?'img':'video');media.src=sequence.file;if(sequence.format==='GIF')media.alt='Animação geométrica original';else{media.controls=true;media.preload='metadata';media.setAttribute('aria-label','Vídeo geométrico original');}
  $('sequenceOriginal').replaceChildren(media);$('sequenceMeta').textContent=`Duração total: ${format(sequence.duration)} s · recorte ${format(p.start)}–${format(p.end)} s · ${p.sampled_frames} quadros · ${p.temporal_pairs} ${p.temporal_pairs===1?'par':'pares'} · fundo branco.`;
  $('sequenceShapes').textContent=`${p.prepared_wh.join(' × ')} pixels por quadro · grade ${p.grid_thw.join(' × ')} · ${sequence.execution.antes_shape.join(' × ')} antes / ${sequence.execution.depois_shape.join(' × ')} depois. ${p.repeated_samples} seleções repetidas.`;
  $('sequenceFrame').max=sequence.prepared_frames.length-1;$('sequenceFrames').replaceChildren(...sequence.prepared_frames.map((src,i)=>{const b=button('',()=>frame(i),'sequence-frame-button'),im=node('img');im.src=src;im.alt='';b.append(im,node('span',format(p.timestamps[i])+' s'));return b;}));
  $('videoScope').replaceChildren(new Option('Sequência inteira amostrada','-1'),...sequence.pairs.after.map((_,i)=>new Option(`Par ${i+1} · ${format(p.timestamps[i*2])} e ${format(p.timestamps[i*2+1])} s`,String(i))));frame(0);updateGrid();json('sequencePreparationRecord',p);renderVideoAnalysis();
 }
 function updateGrid(){if(!sequence)return;const grid=$('sequencePatchGrid'),groups=$('sequenceShowGroups').checked;grid.hidden=!$('sequenceShowPatches').checked&&!groups;grid.style.setProperty('--patch-columns',sequence.preparation.grid_thw[2]/(groups?2:1));grid.style.setProperty('--patch-rows',sequence.preparation.grid_thw[1]/(groups?2:1));grid.classList.toggle('group-grid',groups);}
 for(const id of ['sequenceFormat','sequenceStart','sequenceEnd','sequenceSampleCount','sequencePixelBudget','sequenceBackground'])$(id).addEventListener('input',invalidateSequence);
 $('sequenceUseEnd').addEventListener('click',()=>{$('sequenceEnd').value=sequenceCases()[0].duration;invalidateSequence();});
 $('sequenceScenario').addEventListener('change',useSequencePreset);$('sequencePrepare').addEventListener('click',prepareSequence);
 for(const id of ['videoStage','videoScope'])$(id).addEventListener('change',renderVideoAnalysis);
 for(const id of ['sequenceShowPatches','sequenceShowGroups'])$(id).addEventListener('change',updateGrid);
 $('sequenceFrame').addEventListener('input',()=>frame($('sequenceFrame').value));$('videoJson').addEventListener('click',()=>R.json('sequencia_registro.json',videoRecord()));
 $('videoNpz').addEventListener('click',()=>{const recipe=videoRecipe.value(),b=R.sequence(sequence,recipe,'before'),a=R.sequence(sequence,recipe,'after');R.download('sequencia_vetores_e_pares.npz',R.npz({antes_merger:b.vector,depois_merger:a.vector,pares_antes:b.pairs,pares_depois:a.pairs}));});
 $('sequencePrepareCode').textContent='# Trecho explicativo: amostragem antes da inferência\nimport numpy as np\n# O último instante selecionado é anterior ao fim do recorte.\ntempos = np.linspace(inicio, fim, numero_de_quadros, endpoint=False)\n# A bancada escolhe o quadro ativo em cada instante e prepara os pixels.\n# Aqui os parâmetros e pixels são lidos da execução registrada.';
 $('sequencePairsCode').textContent='# Usando a grade produzida pelo processador (T, H, W)\npares_antes = tokens_antes.reshape(T, H * W, 1152)\npares_depois = tokens_depois.reshape(T, H * W // 4, 4096)\n# T é a quantidade de pares temporais. O merger reúne 2 × 2 posições.';
 $('videoAnalysisCode').textContent='# Trecho equivalente da leitura de tokens salvos\nfrom analysis import represent\nbruto, vetor, divisor = represent(tokens_do_escopo, receita)\n# Repetir por par temporal para investigar mudanças na sequência.\n# Usar a mesma receita e o mesmo estágio ao comparar pares.';
 setupPicker();batchInputs();setOptions();renderNeighbors();invalidateSequence();
 window.addEventListener('labvisual:entrychange',event=>document.querySelectorAll('[data-entry-id]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.entryId===event.detail.entryId))));
})();
