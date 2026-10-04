(() => {
  'use strict';
  const publicSet = window.LAB_DEMO && Array.isArray(window.LAB_DEMO.images) ? window.LAB_DEMO : null;
  const backgroundSet = window.LAB_BACKGROUND_VARIANTS || null;
  const extensions = window.LAB_EXTENSIONS;
  const entries = {
    synthetic: { ...window.LAB_DEMO_DATA, kind: 'synthetic', entryId: 'synthetic' }
  };

  function applyBackgroundVariant(item, value) {
    const entry = backgroundSet?.transparent_entries?.[item.id];
    const variant = entry?.variants?.[value];
    if (!variant) return false;
    item.prepared = variant.prepared;
    item.before = variant.before;
    item.after = variant.after;
    item.vectors = variant.vectors;
    item.preparation = variant.preparation;
    item.execution = variant.execution;
    item.provenance = variant.provenance;
    item.analysis = variant.analysis;
    item.tokens_before = variant.execution.antes_shape[0];
    item.tokens_after = variant.execution.depois_shape[0];
    item.background = variant.background;
    item._selectedBackground = variant.background;
    item._hasTransparentPixels = true;
    item._backgroundPreparation = variant.preparation;
    item._backgroundExecution = variant.execution;
    return true;
  }

  function entryFromItem(item) {
    const inferenceSeconds = item.execution?.tempo_inferencia_s ?? null;
    return {
      kind: 'example',
      entryId: `example:${item.id}`,
      image: item,
      stages: {
        before: { tokens: item.tokens_before, dimensions: item.before.length },
        after: { tokens: item.tokens_after, dimensions: item.after.length }
      },
      vectors: item.vectors,
      record: {
        source: `Ensaio público · ${item.label}`,
        input: {
          id: item.id,
          label: item.label,
          sha256: item.sha256,
          background: item.background,
          transparency: item._hasTransparentPixels ? 'preservada no arquivo original e composta antes do encoder' : 'entrada opaca'
        },
        preparation: item.preparation,
        execution: {
          inference_seconds: inferenceSeconds,
          status: 'registrada',
          weights: 'congelados',
          training: false,
          details: item.execution
        },
        recorded_analysis: item.analysis,
        provenance: item.provenance,
        model: publicSet.model,
        profile: publicSet.profile,
        engine_sha256: publicSet.engine_sha256,
        analysis_sha256: publicSet.analysis_sha256
      }
    };
  }

  if (publicSet) {
    for (const item of publicSet.images) {
      const backgroundEntry = backgroundSet?.transparent_entries?.[item.id];
      item._hasTransparentPixels = Boolean(backgroundEntry);
      if (backgroundEntry) applyBackgroundVariant(item, backgroundEntry.default_background);
      entries[`example:${item.id}`] = entryFromItem(item);
    }
  }
  let data = entries.synthetic;
  let selectedEntryId = 'synthetic';
  const $ = id => document.getElementById(id);
  const jsonTokenPattern = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:))|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g;
  const escapeCode = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function renderJsonCode(target, value) {
    const element = typeof target === 'string' ? $(target) : target;
    const json = JSON.stringify(value, null, 2) || '';
    const escaped = escapeCode(json);
    element.innerHTML = escaped.replace(jsonTokenPattern, (token, key, string, number, boolean, nullValue) => {
      const type = key ? 'key' : string ? 'string' : number ? 'number' : boolean ? 'boolean' : nullValue ? 'null' : '';
      return `<span class="json-${type}">${token}</span>`;
    });
  }
  window.LabVisualRenderJson = renderJsonCode;
  const svgNS = 'http://www.w3.org/2000/svg';
  const labels = {
    stage: { before: 'antes do merger', after: 'depois do merger' },
    pooling: { mean: 'Média', max: 'Máximo', median: 'Mediana' },
    normalization: { l2: 'L2', l1: 'L1', linf: 'L∞', none: 'Sem normalização' },
    metric: { cosine: 'Cosseno', euclidean: 'Distância euclidiana', dot: 'Produto escalar' }
  };
  const workflowExplanations = {
    pooling: {
      mean: 'Para cada coordenada, calcula a média dos valores de todos os tokens.',
      max: 'Para cada coordenada, escolhe o maior valor entre todos os tokens. Não é o maior valor absoluto nem a maior barra do vetor médio.',
      median: 'Para cada coordenada, escolhe o valor central entre os tokens; se a quantidade for par, usa a média dos dois centrais.'
    },
    normalization: {
      l2: 'Divide todas as coordenadas pela raiz da soma dos quadrados. O comprimento L2 passa a ser 1.',
      l1: 'Divide todas as coordenadas pela soma dos valores absolutos. Essa soma passa a ser 1.',
      linf: 'Divide todas as coordenadas pelo maior valor absoluto. A maior magnitude passa a ser 1.',
      none: 'Mantém os valores da agregação, inclusive o comprimento do vetor.'
    },
    metric: {
      cosine: 'Compara direções. Valores maiores indicam maior proximidade; o resultado não é uma porcentagem de semelhança.',
      euclidean: 'Mede a distância entre os vetores. Valores menores indicam maior proximidade; a normalização escolhida pode mudar o resultado.',
      dot: 'Soma os produtos das coordenadas correspondentes. Valores maiores ficam primeiro e o resultado depende também dos comprimentos.'
    }
  };
  let current = [];
  const charts = window.LabVisualCharts.create();
  const applyAutomaticLineView = () => charts.automaticLine();
  const minimumBarWindow = 12;
  const minimumLineWindow = 64;
  let barZoom = 1;
  let barWindowInitialized = false;
  let lineZoom = 1;
  let linePinnedIndex = null;
  let entryPickerPurpose = 'single';
  let workflowStage = 'empty';
  let analysisMetric = 'cosine';
  let replayTimer;
  const imageNotes = new Map();
  let imageNotesKey = null;

  function node(name, attributes = {}) {
    const element = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function number(value, digits = 5) {
    const absolute = Math.abs(value);
    if (absolute && (absolute < 0.0001 || absolute >= 10000)) return value.toExponential(3).replace('.', ',');
    return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
  }

  function showPointerGuide(event, message) {
    const guide = $('pointerGuide');
    guide.textContent = message;
    guide.hidden = false;
    const guideWidth = guide.offsetWidth;
    const guideHeight = guide.offsetHeight;
    const left = Math.min(event.clientX + 10, window.innerWidth - guideWidth - 24);
    const top = Math.min(event.clientY + 10, window.innerHeight - guideHeight - 24);
    guide.style.left = `${Math.max(8, left)}px`;
    guide.style.top = `${Math.max(8, top)}px`;
  }

  function hidePointerGuide() {
    $('pointerGuide').hidden = true;
  }

  function syncZoomEditor(input, detail, zoom, atMaximum) {
    if (document.activeElement !== input) {
      input.value = zoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    detail.textContent = atMaximum ? 'detalhe máximo · eixos vinculados' : 'eixos horizontal e vertical vinculados';
  }

  function drawPattern() {
    // Miniatura do seletor. A entrada preparada usa o PNG real exportado da bancada.
    const entryCanvas = $('entryPattern');
    const source = new Image();
    source.onload = () => entryCanvas.getContext('2d').drawImage(source, 0, 0, entryCanvas.width, entryCanvas.height);
    source.src = window.LAB_SYNTHETIC_WHITE.source;
  }

  function drawEntryVisuals() {
    const synthetic = data.kind === 'synthetic';
    const originalCanvas = $('pattern');
    const preparedCanvas = $('patchPattern');
    const originalImage = $('selectedImage');
    const preparedImage = $('preparedImage');
    const grid = document.querySelector('.patch-grid-overlay');
    originalCanvas.hidden = true;
    preparedCanvas.hidden = true;
    originalImage.hidden = false;
    preparedImage.hidden = false;

    if (synthetic) {
      drawPattern();
      const [, rows, columns] = data.record.preparation.grid_thw;
      const count = rows * columns;
      originalImage.src = window.LAB_SYNTHETIC_WHITE.source;
      originalImage.alt = 'Padrão geométrico — arquivo original do ensaio';
      preparedImage.src = data.pattern?.prepared || window.LAB_SYNTHETIC_WHITE.prepared;
      preparedImage.alt = 'Padrão geométrico — pixels reconstruídos da entrada real do encoder';
      $('inputSelectorLabel').textContent = 'Entrada sintética';
      $('execucao-title').textContent = 'Um padrão geométrico controlado';
      $('inputDimensions').textContent = '320 × 240 px';
      $('inputDescription').textContent = 'O padrão foi criado dentro da própria bancada. Nenhuma fotografia ou arquivo pessoal participa desta demonstração.';
      $('preparationSummary').textContent = `${columns * 16} × ${rows * 16} pixels preparados e organizados em ${count} patches de entrada.`;
      $('beforeSummary').textContent = `${count} tokens, cada um com 1.152 coordenadas.`;
      $('afterSummary').textContent = `${count / 4} tokens, cada um com 4.096 coordenadas.`;
      $('patch-title').textContent = `Grade de entrada em ${count} patches`;
      $('patchDescription').textContent = `Os ${columns * 16} × ${rows * 16} pixels preparados formam uma grade de ${columns} × ${rows} células de 16 × 16 pixels.`;
      $('patchCaption').textContent = 'Imagem preparada real exportada pela bancada. A grade é uma sobreposição didática e não entra no encoder.';
      grid.style.setProperty('--patch-columns', columns);
      grid.style.setProperty('--patch-rows', rows);
      updateBackgroundPicker();
      if (workflowStage !== 'empty') renderWorkflowVisuals();
      return;
    }

    const item = data.image;
    const [, rows, columns] = item.preparation.grid_thw;
    originalImage.src = item.file;
    originalImage.alt = `${item.label} — arquivo original do ensaio`;
    preparedImage.src = item.prepared;
    preparedImage.alt = `${item.label} — entrada preparada para o encoder`;
    originalImage.onload = () => $('inputDimensions').textContent = `${originalImage.naturalWidth} × ${originalImage.naturalHeight} px`;
    $('inputSelectorLabel').textContent = 'Entrada da base';
    $('execucao-title').textContent = item.label;
    $('inputDimensions').textContent = 'Imagem do ensaio';
    $('inputDescription').textContent = item._hasTransparentPixels
      ? `Esta entrada transparente possui ${backgroundSet.palette.length} execuções públicas pré-calculadas. Ao trocar o fundo, a imagem preparada e os gráficos passam para o registro correspondente; o modelo não é executado no navegador.`
      : 'Esta entrada faz parte da base pública pré-calculada da demonstração. Ela é totalmente opaca: trocar uma cor de composição não alteraria seus pixels nem seu vetor.';
    $('preparationSummary').textContent = `${columns * 16} × ${rows * 16} pixels preparados e organizados em ${item.tokens_before.toLocaleString('pt-BR')} patches de entrada.`;
    $('beforeSummary').textContent = `${item.tokens_before.toLocaleString('pt-BR')} tokens, cada um com ${item.before.length.toLocaleString('pt-BR')} coordenadas.`;
    $('afterSummary').textContent = `${item.tokens_after.toLocaleString('pt-BR')} tokens, cada um com ${item.after.length.toLocaleString('pt-BR')} coordenadas.`;
    $('patch-title').textContent = `Grade de entrada em ${item.tokens_before.toLocaleString('pt-BR')} patches`;
    $('patchDescription').textContent = `A entrada preparada forma uma grade de ${columns} × ${rows} células. Cada célula corresponde a um patch de 16 × 16 pixels antes da representação em tokens.`;
    $('patchCaption').textContent = 'A grade é uma sobreposição didática sobre a entrada preparada; ela não entra no encoder.';
    grid.style.setProperty('--patch-columns', columns);
    grid.style.setProperty('--patch-rows', rows);
    updateBackgroundPicker();
    if (workflowStage !== 'empty') renderWorkflowVisuals();
  }

  function workflowFileName() {
    if (data.kind === 'synthetic') return 'Padrão geométrico controlado';
    return data.image.file.split('/').pop() || data.image.label;
  }

  function renderWorkflowVisuals() {
    const selected = workflowStage !== 'empty';
    const prepared = workflowStage === 'prepared' || workflowStage === 'executed';
    const synthetic = data.kind === 'synthetic';
    const originalPlaceholder = $('workflowOriginalPlaceholder');
    const preparedPlaceholder = $('workflowPreparedPlaceholder');
    const originalCanvas = $('workflowOriginalPattern');
    const preparedCanvas = $('workflowPreparedPattern');
    const originalImage = $('workflowOriginalImage');
    const preparedImage = $('workflowPreparedImage');
    const originalFrame = $('workflowOriginalFrame');
    const preparedFrame = $('workflowPreparedFrame');
    const previewCard = document.querySelector('.workflow-preview-card');
    const grid = $('workflowPatchGrid');
    const mergeGrid = $('workflowMergeGrid');
    const opacityToggle = $('workflowOpacityMask');
    const patchToggle = $('workflowShowPatches');
    const groupToggle = $('workflowShowGroups');
    const showPatches = $('workflowShowPatches').checked;
    const showGroups = $('workflowShowGroups').checked;
    const hasTransparency = !synthetic && Boolean(data.image?._hasTransparentPixels);

    originalFrame.classList.toggle('is-clean', selected && !hasTransparency);
    preparedFrame.classList.toggle('is-clean', selected);
    previewCard.classList.toggle('is-prepared', prepared);

    originalPlaceholder.hidden = selected;
    originalCanvas.hidden = true;
    originalImage.hidden = !selected;
    preparedPlaceholder.hidden = prepared;
    preparedCanvas.hidden = true;
    preparedImage.hidden = !prepared;
    opacityToggle.disabled = !prepared || !hasTransparency;
    patchToggle.disabled = !prepared;
    groupToggle.disabled = !prepared;
    if (!hasTransparency) opacityToggle.checked = false;
    grid.hidden = !prepared || !showPatches;
    mergeGrid.hidden = !prepared || !showGroups;
    renderPreparationInsight();

    if (!selected) return;
    if (synthetic) {
      const [, rows, columns] = data.record.preparation.grid_thw;
      originalImage.src = window.LAB_SYNTHETIC_WHITE.source;
      originalImage.alt = 'Padrão geométrico — arquivo original';
      originalImage.style.backgroundColor = '#ffffff';
      preparedImage.src = data.pattern?.prepared || window.LAB_SYNTHETIC_WHITE.prepared;
      preparedImage.alt = 'Padrão geométrico — entrada preparada real';
      grid.style.setProperty('--patch-columns', columns);
      grid.style.setProperty('--patch-rows', rows);
      mergeGrid.style.setProperty('--patch-columns', columns);
      mergeGrid.style.setProperty('--patch-rows', rows);
    } else {
      const item = data.image;
      const [, rows, columns] = item.preparation.grid_thw;
      originalImage.src = opacityToggle.checked ? 'assets/analise/mascara_opacidade.png' : item.file;
      originalImage.alt = opacityToggle.checked ? 'Máscara de opacidade: branco opaco, preto transparente, cinza parcial' : `${item.label} — arquivo original da demonstração`;
      originalImage.style.backgroundColor = opacityToggle.checked ? 'transparent' : item._hasTransparentPixels ? item._selectedBackground : '#ffffff';
      preparedImage.src = item.prepared;
      preparedImage.alt = `${item.label} — entrada preparada para o encoder`;
      grid.style.setProperty('--patch-columns', columns);
      grid.style.setProperty('--patch-rows', rows);
      mergeGrid.style.setProperty('--patch-columns', columns);
      mergeGrid.style.setProperty('--patch-rows', rows);
    }
  }

  function workflowRecipe() {
    return {
      pooling: $('pooling').value,
      normalization: $('normalization').value,
      metric: $('metric').value
    };
  }

  function recordedPreparation() {
    return data.kind === 'synthetic' ? data.record?.preparation : data.image?.preparation;
  }

  function renderPreparationInsight() {
    const prepared = workflowStage === 'prepared' || workflowStage === 'executed';
    const section = $('preparationInsight');
    section.hidden = false;
    if (!prepared) {
      $('preparationPatchCount').textContent = '—';
      $('preparationPatchValues').textContent = '—';
      $('preparationGrid').textContent = '—';
      $('preparationInterval').textContent = '—';
      $('preparationRecord').textContent = 'Prepare uma imagem para exibir os parâmetros registrados desta etapa.';
      return;
    }

    const preparation = recordedPreparation() || {};
    const shape = Array.isArray(preparation.pixel_values_shape) ? preparation.pixel_values_shape : [];
    const grid = Array.isArray(preparation.grid_thw) ? preparation.grid_thw : [];
    const interval = Array.isArray(preparation.intervalo) ? preparation.intervalo : [];
    $('preparationPatchCount').textContent = Number.isFinite(Number(shape[0]))
      ? Number(shape[0]).toLocaleString('pt-BR')
      : '—';
    $('preparationPatchValues').textContent = Number.isFinite(Number(shape[1]))
      ? Number(shape[1]).toLocaleString('pt-BR')
      : '—';
    $('preparationGrid').textContent = grid.length ? grid.join(' × ') : '—';
    $('preparationInterval').textContent = interval.length >= 2
      ? `${number(Number(interval[0]), 4)} a ${number(Number(interval[1]), 4)}`
      : '—';
    renderJsonCode('preparationRecord', preparation);
  }

  function preparationSelectionMatchesRecord() {
    const preparation = recordedPreparation();
    if (!preparation) return false;
    return Number($('workflowPixelBudget').value) === Number(preparation.perfil_resolucao === 'checkpoint' ? 0 : preparation.max_pixels)
      && $('workflowImageVariant').value === (preparation.variante || 'original');
  }

  function syncPreparationControls() {
    const preparation = recordedPreparation();
    if (!preparation) return;
    const budget = String(preparation.perfil_resolucao === 'checkpoint' ? 0 : preparation.max_pixels ?? 65536);
    if ([...$('workflowPixelBudget').options].some(option => option.value === budget)) $('workflowPixelBudget').value = budget;
    $('workflowImageVariant').value = preparation.variante || 'original';
  }

  function refreshPreparationAvailability() {
    const selected = workflowStage !== 'empty';
    const matches = preparationSelectionMatchesRecord();
    $('workflowPrepare').disabled = !selected || !matches;
    if (!selected) return;
    if (!matches) {
      $('workflowPrepareStatus').textContent = 'Esta combinação ainda não possui uma execução pública pré-calculada. Para esta imagem, use 65.536 pixels e cores originais. O padrão geométrico de teste oferece registros de todas as opções acima.';
    } else if (workflowStage === 'selected') {
      $('workflowPrepareStatus').textContent = 'Imagem escolhida. Agora você pode revelar a preparação registrada.';
    }
  }

  function handlePreparationSettingChange() {
    if (data.kind === 'synthetic') {
      const selected = extensions.pattern_cases[$('workflowPixelBudget').value + ':' + $('workflowImageVariant').value];
      if (selected) {
        data = {...entries.synthetic, pattern:selected, vectors:selected.vectors,
          stages:{before:{tokens:selected.execution.antes_shape[0],dimensions:1152},after:{tokens:selected.execution.depois_shape[0],dimensions:4096}},
          record:{...entries.synthetic.record,preparation:selected.preparation,provenance:selected.provenance,
             execution:{...entries.synthetic.record.execution,inference_seconds:selected.execution.tempo_inferencia_s,details:selected.execution}}};
        entries.synthetic=data;
        drawEntryVisuals();renderRecord();update();
        setWorkflowStage(workflowStage === 'empty' ? 'empty' : 'selected');
        return;
      }
    }
    if (workflowStage === 'prepared' || workflowStage === 'executed') setWorkflowStage('selected');
    else refreshPreparationAvailability();
  }

  function refreshWorkflowRecipe() {
    const prepared = workflowStage === 'prepared' || workflowStage === 'executed';
    const pooling = $('pooling');
    const available = data.vectors.after;
    for (const option of pooling.options) option.disabled = !available[option.value];
    if (!available[pooling.value]) pooling.value = 'mean';
    for (const id of ['pooling', 'normalization', 'metric']) $(id).disabled = !prepared;
    document.querySelector('.workflow-analysis-card').classList.toggle('is-locked', !prepared);
    if (!prepared) {
      $('recipeReading').textContent = 'Prepare uma imagem para revelar a leitura dos tokens registrados.';
      for (const id of ['tokenCount', 'dimensionCount', 'divisor', 'peak']) $(id).textContent = '—';
    }
  }

  function setWorkflowStage(stage) {
    workflowStage = stage;
    const selected = stage !== 'empty';
    const prepared = stage === 'prepared' || stage === 'executed';
    const executed = stage === 'executed';
    $('singleResults').hidden = !executed;
    document.querySelector('.workflow').classList.toggle('has-results', executed);
    $('workflowPrepare').disabled = !selected;
    $('workflowExecute').disabled = !prepared;
    $('workflowFileName').textContent = selected ? workflowFileName() : 'Nenhuma imagem escolhida';
    $('workflowChooseStatus').textContent = selected
      ? `${data.kind === 'synthetic' ? 'Entrada sintética' : data.image.label} selecionada.`
      : 'Nenhuma imagem escolhida.';
    $('workflowOriginalCaption').textContent = selected
      ? 'Visualização da entrada selecionada. Ainda não há preparação aplicada nesta etapa.'
      : 'A entrada escolhida aparecerá aqui.';
    $('workflowPreparedCaption').textContent = prepared
      ? 'Entrada preparada com a divisão em patches destacada pela grade vermelha. A grade é uma sobreposição didática; não entra na rede.'
      : 'A preparação ainda não foi revelada.';
    $('workflowPrepareStatus').textContent = prepared
      ? 'Preparação registrada carregada. A grade mostra os patches enviados ao encoder.'
      : selected ? 'Imagem escolhida. Agora você pode revelar a preparação registrada.' : 'Escolha uma imagem para habilitar a preparação.';
    $('workflowExecuteStatus').textContent = executed
      ? 'Execução registrada carregada. Os gráficos e a leitura interativa estão disponíveis abaixo.'
      : prepared ? 'Pronta para revelar a passagem registrada pelo encoder.' : 'Prepare uma imagem para habilitar a execução registrada.';
    $('workflowPrepare').textContent = prepared ? 'Rever preparação' : 'Preparar imagem';
    $('workflowExecute').textContent = executed ? 'Reaplicar leitura' : 'Explorar resultado';
    $('workflowAnalysisStatus').textContent = executed
      ? 'Esta receita está aplicada aos resultados exibidos abaixo.'
      : prepared ? 'Escolha a receita de leitura e depois revele a execução registrada.' : 'Prepare uma imagem para liberar estas escolhas.';
    refreshWorkflowRecipe();
    renderWorkflowVisuals();
    updateBackgroundPicker();
    refreshPreparationAvailability();
  }

  function prepareWorkflowEntry() {
    if (workflowStage === 'empty' || !preparationSelectionMatchesRecord()) return;
    setWorkflowStage('prepared'); update();
  }

  function executeWorkflowEntry() {
    if (!['prepared','executed'].includes(workflowStage) || !preparationSelectionMatchesRecord()) return;
    update();renderRecord();setWorkflowStage('executed');
    $('explorar').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function setupBackgroundPicker() {
    const choices = $('backgroundChoices');
    if (!backgroundSet?.palette?.length) {
      $('backgroundPicker').hidden = true;
      return;
    }
    const buttons = backgroundSet.palette.map(color => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'background-choice';
      button.dataset.background = color.value;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.title = `${color.label} · cor ${color.family}`;
      const swatch = document.createElement('span');
      swatch.className = 'background-swatch';
      swatch.style.setProperty('--swatch', color.value);
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = color.label;
      button.append(swatch, label);
      button.addEventListener('click', () => selectBackground(color.value));
      return button;
    });
    choices.replaceChildren(...buttons);
    updateBackgroundPicker();
  }

  function updateBackgroundPicker() {
    if (!backgroundSet?.palette?.length) return;
    const item = data.kind === 'example' ? data.image : null;
    const transparent = Boolean(item?._hasTransparentPixels);
    const selected = transparent ? item._selectedBackground : null;
    const prepared = workflowStage === 'prepared' || workflowStage === 'executed';
    $('backgroundPicker').hidden = !transparent || prepared;
    document.querySelector('.input-preview').style.setProperty('--entry-background', selected || '#ffffff');
    document.querySelectorAll('.background-choice').forEach(button => {
      button.disabled = !transparent;
      button.setAttribute('aria-checked', String(transparent && button.dataset.background === selected));
    });
    if (transparent) {
      const color = backgroundSet.palette.find(candidate => candidate.value === selected);
      $('backgroundStatus').textContent = `${color?.label || selected} · execução registrada. O fundo foi composto nos pixels transparentes antes do encoder e os gráficos correspondem a essa escolha.`;
    } else $('backgroundStatus').textContent = '';
  }

  function selectBackground(value) {
    if (data.kind !== 'example' || !applyBackgroundVariant(data.image, value)) return;
    const entryId = `example:${data.image.id}`;
    entries[entryId] = entryFromItem(data.image);
    data = entries[entryId];
    drawEntryVisuals();
    renderRecord();
    update();
    $('executionStatus').textContent = `Registro carregado com fundo ${value.toUpperCase()}: ${data.record.source}.`;
    window.dispatchEvent(new CustomEvent('labvisual:entrychange', { detail: { entryId, data, background: value } }));
  }

  function normalize(vector, method) {
    return window.LabDemoAnalysis.normalize(vector, method);
  }

  function recipe() {
    return { stage: $('stage').value, pooling: $('pooling').value, normalization: $('normalization').value, metric: $('metric').value };
  }





  function update() {
    const choice = recipe();
    const available = data.vectors[choice.stage];
    const poolingSelect = $('pooling');
    for (const option of poolingSelect.options) option.disabled = !available[option.value];
    if (!available[choice.pooling]) {
      poolingSelect.value = 'mean';
      choice.pooling = 'mean';
    }
    const raw = available[choice.pooling];
    const result = normalize(raw, choice.normalization);
    current = result.vector;
    if (linePinnedIndex !== null && linePinnedIndex >= current.length) linePinnedIndex = null;
    analysisMetric = choice.metric;
    const meta = data.stages[choice.stage];
    const peakValue = Math.max(...current.map(Math.abs));
    const peakIndex = current.findIndex(value => Math.abs(value) === peakValue);

    $('recipeReading').textContent = `${labels.pooling[choice.pooling]} dos ${meta.tokens} tokens → ${labels.normalization[choice.normalization]} → representação ${labels.stage[choice.stage]}.`;
    $('poolingExplanation').textContent = workflowExplanations.pooling[choice.pooling];
    $('normalizationExplanation').textContent = workflowExplanations.normalization[choice.normalization];
    $('analysisMetricChoice').textContent = labels.metric[choice.metric];
    $('analysisMetricExplanation').textContent = workflowExplanations.metric[choice.metric];
    $('analysisRecipeSummary').textContent = `Receita escolhida: ${labels.pooling[choice.pooling]} → ${labels.normalization[choice.normalization]} → ${labels.metric[choice.metric]}`;
    $('tokenCount').textContent = meta.tokens.toLocaleString('pt-BR');
    $('dimensionCount').textContent = meta.dimensions.toLocaleString('pt-BR');
    $('divisor').textContent = choice.normalization === 'none' ? 'nenhum' : number(result.divisor, 4);
    $('peak').textContent = `#${peakIndex + 1} · ${number(current[peakIndex])}`;

    charts.setVector(current);
    renderRecord();
    window.dispatchEvent(new CustomEvent('labvisual:recipechange', { detail: choice }));
  }

















  function tokenFile() {
    if(data.kind==='synthetic') return (data.pattern || extensions.pattern_cases['65536:original']).tokens_file;
    if(data.image._hasTransparentPixels) return extensions.background_tokens[data.image._selectedBackground].file;
    return extensions.image_tokens[data.image.id].file;
  }
  function exportedRecord() {
    return {schema:1,math_core:window.LabVisualMath.version,source:'demonstração pública; leitura de execução registrada',execution:data.record,
      reading:recipe(),notes:$('singleNotes').value,
      vectors:Object.fromEntries(['before','after'].map(stage=>[stage,normalize(data.vectors[stage][recipe().pooling],recipe().normalization).vector]))};
  }
  function renderRecord() {
    const noteKey = selectedEntryId + ':' + JSON.stringify(data.record.preparation);
    if (imageNotesKey !== noteKey) {
      if (imageNotesKey !== null) imageNotes.set(imageNotesKey, $('singleNotes').value);
      $('singleNotes').value = imageNotes.get(noteKey) || '';
      imageNotesKey = noteKey;
    }
    $('singleTokens').href=tokenFile();
    const elapsed = data.record.execution.inference_seconds;
    $('recordedTime').textContent = typeof elapsed === 'number' ? `${elapsed.toLocaleString('pt-BR')} s` : 'preservada no registro';
    renderJsonCode('record', {
      recorded_execution: data.record,
      browser_reading: { ...recipe(), source: 'agregados brutos conferidos com os tokens salvos; sem nova inferência' }
    });
  }

  function loadRegisteredEntry(entryId, {
    scroll = false,
    workflow = false,
    prepared = false,
    executed = false,
    automatic = false
  } = {}) {
    const next = entries[entryId];
    if (!next) return;
    const button = $('replayExecution');
    const card = document.querySelector('.record-card');
    clearTimeout(replayTimer);
    button.disabled = true;
    card.setAttribute('aria-busy', 'true');
    $('executionButtonLabel').textContent = 'Carregando registro';
    $('executionStatus').textContent = 'Aplicando à bancada os dados pré-calculados desta entrada…';
    replayTimer = setTimeout(() => {
      data = next;
      selectedEntryId = entryId;
      if (automatic) {
        $('stage').value = 'after';
        $('pooling').value = 'mean';
        $('normalization').value = 'l2';
        $('metric').value = 'cosine';
        $('barStart').value = 0;
        $('lineStart').value = 0;
        barZoom = 1;
        barWindowInitialized = false;
        lineZoom = 1;
      }
      syncPreparationControls();
      drawEntryVisuals();
      renderRecord();
      update();
      document.querySelectorAll('[data-entry-id]').forEach(option => option.removeAttribute('aria-current'));
      document.querySelector(`[data-entry-id="${entryId}"]`).setAttribute('aria-current', 'true');
      $('executionButtonLabel').textContent = 'Execução registrada';
      $('executionStatus').textContent = `Registro carregado: ${data.record.source}.`;
      card.removeAttribute('aria-busy');
      button.disabled = false;
      window.dispatchEvent(new CustomEvent('labvisual:entrychange', { detail: { entryId, data } }));
      if (workflow) setWorkflowStage(executed ? 'executed' : prepared ? 'prepared' : 'selected');
      if (executed && automatic) applyAutomaticLineView();
      if (scroll) $(workflow ? executed ? 'explorar' : 'demoWorkflow' : 'entrada-atual').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 520);
  }

  function events() {
    $('singleExport').addEventListener('click',()=>window.LabDemoResources.json('imagem_registro.json',exportedRecord()));
    $('singleCsv').addEventListener('click',()=>window.LabDemoResources.csv('imagem_vetores.csv',exportedRecord().vectors));
    const entryDialog = $('entryDialog');
    const syntheticOption = entryDialog.querySelector('[data-entry-id="synthetic"]');
    const openEntryPicker = (purpose = 'single', showLocalInstall = false) => {
      entryPickerPurpose = purpose;
      entryDialog.returnValue = '';
      syntheticOption.hidden = purpose === 'neighbor';
      $('entryLocalInstall').hidden = purpose === 'neighbor' || !showLocalInstall;
      $('entry-dialog-title').textContent = purpose === 'neighbor' ? 'Escolha uma imagem de referência' : 'Escolha uma entrada para explorar';
      entryDialog.showModal();
    };
    setupBackgroundPicker();
    for (const trigger of document.querySelectorAll('[data-open-entry-picker]')) {
      trigger.addEventListener('click', () => openEntryPicker('single', trigger.id === 'workflowEntrySelector'));
    }
    entryDialog.addEventListener('close', () => {
      if (!entries[entryDialog.returnValue]) return;
      if (entryPickerPurpose === 'neighbor') window.dispatchEvent(new CustomEvent('labvisual:neighborselect', { detail: { entryId: entryDialog.returnValue } }));
      else {
        const useAutomaticPreparation = entryDialog.returnValue === 'synthetic';
        $('singleResults').hidden = true;
        $('workflowChooseStatus').textContent = 'Carregando a entrada escolhida…';
        loadRegisteredEntry(entryDialog.returnValue, {
          scroll: true,
          workflow: true,
          prepared: useAutomaticPreparation,
          automatic: useAutomaticPreparation
        });
      }
    });
    $('replayExecution').addEventListener('click', () => loadRegisteredEntry(selectedEntryId));
    for (const id of ['stage', 'pooling', 'normalization', 'metric']) $(id).addEventListener('change', () => {
      $('barStart').value = 0; $('lineStart').value = 0; barZoom = 1; barWindowInitialized = false; lineZoom = 1; update();
    });
    $('workflowChoose').addEventListener('click', () => openEntryPicker('single'));
    $('workflowUseSynthetic').addEventListener('click', () => {
      $('singleResults').hidden = true;
      $('workflowChooseStatus').textContent = 'Carregando o padrão geométrico de teste…';
      loadRegisteredEntry('synthetic', { workflow: true, prepared: true, automatic: true });
    });
    $('workflowPrepare').addEventListener('click', prepareWorkflowEntry);
    $('workflowExecute').addEventListener('click', executeWorkflowEntry);
    for (const id of ['workflowPixelBudget', 'workflowImageVariant']) $(id).addEventListener('change', handlePreparationSettingChange);
    for (const id of ['workflowOpacityMask', 'workflowShowPatches', 'workflowShowGroups']) $(id).addEventListener('change', renderWorkflowVisuals);
    window.LabVisualOpenEntryPicker = openEntryPicker;
  }

  if (!data) {
    document.body.textContent = 'Os dados públicos da demonstração não foram encontrados.';
    return;
  }
  drawEntryVisuals();
  renderRecord();
  events();
  update();
  syncPreparationControls();
  setWorkflowStage('empty');
  window.LabVisualPublicDemo = {
    entries,
    openImage: item => { const id='example:'+item.id;entries[id]=entryFromItem({...item});loadRegisteredEntry(id,{scroll:true,workflow:true,executed:true,automatic:true}); },
    openEntry: loadRegisteredEntry,
    openPicker: purpose => window.LabVisualOpenEntryPicker(purpose),
    currentEntry: () => selectedEntryId,
    currentRecipe: () => ({ pooling: $('pooling').value, normalization: $('normalization').value, metric: $('metric').value })
  };
})();
