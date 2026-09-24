(() => {
  'use strict';
  const publicSet = window.LAB_DEMO && Array.isArray(window.LAB_DEMO.images) ? window.LAB_DEMO : null;
  const backgroundSet = window.LAB_BACKGROUND_VARIANTS || null;
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
      originalImage.src = window.LAB_SYNTHETIC_WHITE.source;
      originalImage.alt = 'Padrão geométrico — arquivo original do ensaio';
      preparedImage.src = window.LAB_SYNTHETIC_WHITE.prepared;
      preparedImage.alt = 'Padrão geométrico — pixels reconstruídos da entrada real do encoder';
      $('inputSelectorLabel').textContent = 'Entrada sintética';
      $('execucao-title').textContent = 'Um padrão geométrico controlado';
      $('inputDimensions').textContent = '320 × 240 px';
      $('inputDescription').textContent = 'O padrão foi criado dentro da própria bancada. Nenhuma fotografia ou arquivo pessoal participa desta demonstração.';
      $('preparationSummary').textContent = '288 × 192 pixels preparados e organizados em 216 patches de entrada.';
      $('beforeSummary').textContent = '216 tokens, cada um com 1.152 coordenadas.';
      $('afterSummary').textContent = '54 tokens, cada um com 4.096 coordenadas.';
      $('patch-title').textContent = 'Grade de entrada em 216 patches';
      $('patchDescription').textContent = 'Os 288 × 192 pixels preparados formam uma grade de 18 × 12 células. Cada célula corresponde a um patch de 16 × 16 pixels antes da representação em tokens.';
      $('patchCaption').textContent = 'Imagem preparada real exportada pela bancada. A grade é uma sobreposição didática e não entra no encoder.';
      grid.style.setProperty('--patch-columns', 18);
      grid.style.setProperty('--patch-rows', 12);
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
      originalImage.src = window.LAB_SYNTHETIC_WHITE.source;
      originalImage.alt = 'Padrão geométrico — arquivo original';
      originalImage.style.backgroundColor = '#ffffff';
      preparedImage.src = window.LAB_SYNTHETIC_WHITE.prepared;
      preparedImage.alt = 'Padrão geométrico — entrada preparada real';
      grid.style.setProperty('--patch-columns', 18);
      grid.style.setProperty('--patch-rows', 12);
      mergeGrid.style.setProperty('--patch-columns', 18);
      mergeGrid.style.setProperty('--patch-rows', 12);
    } else {
      const item = data.image;
      const [, rows, columns] = item.preparation.grid_thw;
      originalImage.src = item.file;
      originalImage.alt = `${item.label} — arquivo original da demonstração`;
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
    return Number($('workflowPixelBudget').value) === Number(preparation.max_pixels)
      && $('workflowImageVariant').value === (preparation.variante || 'original');
  }

  function syncPreparationControls() {
    const preparation = recordedPreparation();
    if (!preparation) return;
    const budget = String(preparation.max_pixels ?? 65536);
    if ([...$('workflowPixelBudget').options].some(option => option.value === budget)) $('workflowPixelBudget').value = budget;
    $('workflowImageVariant').value = preparation.variante || 'original';
  }

  function refreshPreparationAvailability() {
    const selected = workflowStage !== 'empty';
    const matches = preparationSelectionMatchesRecord();
    $('workflowPrepare').disabled = !selected || !matches;
    if (!selected) return;
    if (!matches) {
      $('workflowPrepareStatus').textContent = 'Esta combinação ainda não possui uma execução pública pré-calculada. Volte a 65.536 pixels e cores originais para continuar nesta demonstração.';
    } else if (workflowStage === 'selected') {
      $('workflowPrepareStatus').textContent = 'Imagem escolhida. Agora você pode revelar a preparação registrada.';
    }
  }

  function handlePreparationSettingChange() {
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
    if (workflowStage === 'empty') return;
    const button = $('workflowPrepare');
    button.disabled = true;
    button.textContent = 'Preparando…';
    $('workflowPrepareStatus').textContent = 'Carregando a preparação pré-calculada desta entrada…';
    setTimeout(() => {
      setWorkflowStage('prepared');
      update();
    }, 420);
  }

  function executeWorkflowEntry() {
    if (workflowStage !== 'prepared' && workflowStage !== 'executed') return;
    $('singleResults').hidden = true;
    document.querySelector('.workflow').classList.remove('has-results');
    const button = $('workflowExecute');
    button.disabled = true;
    button.textContent = 'Carregando execução…';
    $('workflowExecuteStatus').textContent = 'Revelando os vetores e resultados pré-calculados do encoder…';
    setTimeout(() => {
      const selectedRecipe = workflowRecipe();
      analysisMetric = selectedRecipe.metric;
      lineZoom = 1;
      update();
      renderRecord();
      setWorkflowStage('executed');
      $('explorar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 650);
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

  function windowSizeForZoom(dimensions, zoom) {
    if (!dimensions) return 0;
    const smallest = Math.min(minimumLineWindow, dimensions);
    return Math.max(smallest, Math.min(dimensions, Math.round(dimensions / Math.max(1, zoom))));
  }

  function barWindowSizeForZoom(dimensions, zoom) {
    if (!dimensions) return 0;
    const smallest = Math.min(minimumBarWindow, dimensions);
    return Math.max(smallest, Math.min(dimensions, Math.round(dimensions / Math.max(1, zoom))));
  }

  function refreshBarWindowOptions(dimensions, selectedSize = barWindowSizeForZoom(dimensions, barZoom)) {
    const select = $('barWindow');
    const safeSize = Math.max(Math.min(minimumBarWindow, dimensions), Math.min(dimensions, selectedSize));
    const sizes = [dimensions, 1024, 512, 256, 128, 64, 48, 32, 24, 16, 12, safeSize]
      .filter((value, index, array) => value <= dimensions && array.indexOf(value) === index)
      .sort((left, right) => right - left);
    select.replaceChildren(...sizes.map(size => new Option(
      size === dimensions ? `Todas · ${size.toLocaleString('pt-BR')}` : size.toLocaleString('pt-BR'),
      String(size)
    )));
    select.value = String(safeSize);
  }

  function refreshWindowOptions(dimensions, selectedSize = windowSizeForZoom(dimensions, lineZoom)) {
    const select = $('lineWindow');
    const safeSize = Math.max(Math.min(minimumLineWindow, dimensions), Math.min(dimensions, selectedSize));
    const sizes = [dimensions, 1024, 512, 256, 128, 64, safeSize]
      .filter((value, index, array) => value <= dimensions && array.indexOf(value) === index)
      .sort((left, right) => right - left);
    select.replaceChildren(...sizes.map(size => new Option(
      size === dimensions ? `Todas · ${size.toLocaleString('pt-BR')}` : size.toLocaleString('pt-BR'),
      String(size)
    )));
    select.value = String(safeSize);
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

    const barWindowSize = barWindowInitialized
      ? barWindowSizeForZoom(current.length, barZoom)
      : Math.min(48, current.length);
    refreshBarWindowOptions(current.length, barWindowSize);
    barZoom = current.length / Math.max(1, Number($('barWindow').value));
    barWindowInitialized = true;
    configureBarPan();
    refreshWindowOptions(current.length);
    configureLinePan();
    drawBars();
    drawLine();
    renderRecord();
    window.dispatchEvent(new CustomEvent('labvisual:recipechange', { detail: choice }));
  }

  function drawBars() {
    const svg = $('barChart');
    const start = Number($('barStart').value);
    const requested = Number($('barWindow').value);
    const values = current.slice(start, start + requested);
    const width = 960, height = 280, left = 64, right = 15, top = 24, bottom = 40;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const scale = coupledScale(current, values, minimumBarWindow);
    barZoom = scale.zoom;
    const y = value => top + (scale.limit - value) / (2 * scale.limit) * plotHeight;
    const zero = y(0);
    const slot = plotWidth / values.length;
    const barGap = Math.min(4, slot * 0.22);
    const barWidth = Math.max(0.08, slot - barGap);
    svg.replaceChildren();
    appendVerticalRuler(svg, left, top, plotHeight, scale.limit);
    svg.append(node('line', { x1: left, x2: width - right, y1: zero, y2: zero, class: 'axis' }));
    const definitions = node('defs');
    const clipPath = node('clipPath', { id: 'barPlotClip' });
    clipPath.append(node('rect', { x: left, y: top, width: plotWidth, height: plotHeight }));
    definitions.append(clipPath);
    svg.append(definitions);
    const plot = node('g', { 'clip-path': 'url(#barPlotClip)' });
    values.forEach((value, index) => {
      const valueY = Math.max(top, Math.min(top + plotHeight, y(value)));
      const rect = node('rect', {
        x: left + index * slot + barGap / 2,
        y: Math.min(zero, valueY),
        width: barWidth,
        height: Math.max(1, Math.abs(valueY - zero)),
        rx: Math.min(1, barWidth / 2),
        class: `bar ${value >= 0 ? 'bar-positive' : 'bar-negative'}`,
        tabindex: values.length <= 256 ? 0 : -1,
        role: 'img',
        'aria-label': `Coordenada ${start + index + 1}: ${number(value, 7)}`
      });
      const message = `Coordenada ${start + index + 1}: ${number(value, 7)}.`;
      const read = () => $('barReading').textContent = message;
      rect.addEventListener('mouseenter', read);
      rect.addEventListener('focus', read);
      rect.addEventListener('pointermove', event => { read(); showPointerGuide(event, message); });
      rect.addEventListener('pointerleave', hidePointerGuide);
      plot.append(rect);
    });
    svg.append(plot);
    const atMaximum = Math.abs(scale.zoom - scale.maximumZoom) < 0.001;
    syncZoomEditor($('barZoomInput'), $('barZoomDetail'), scale.zoom, atMaximum);
    $('barWindowTitle').textContent = values.length.toLocaleString('pt-BR');
    const clipping = scale.clipped ? ` ${scale.clipped.toLocaleString('pt-BR')} ${scale.clipped === 1 ? 'barra está' : 'barras estão'} fora do enquadramento vertical; os valores não foram alterados.` : '';
    $('barRange').textContent = `Coordenadas ${(start + 1).toLocaleString('pt-BR')}–${(start + values.length).toLocaleString('pt-BR')} de ${current.length.toLocaleString('pt-BR')}. Limite vertical ±${number(scale.limit, 7)}.${clipping}`;
    $('barScaleNote').textContent = `Os eixos horizontal e vertical usam o mesmo fator de zoom. Em 1×, a régua vai de −1 a 1; ao ampliar, o limite vertical diminui na mesma proporção que a janela horizontal.`;
  }

  function configureBarPan(focusIndex = null) {
    const windowSize = Number($('barWindow').value);
    const slider = $('barStart');
    slider.max = Math.max(0, current.length - windowSize);
    if (focusIndex !== null) slider.value = Math.max(0, Math.min(Number(slider.max), focusIndex - Math.floor(windowSize / 2)));
    else slider.value = Math.min(Number(slider.value), Number(slider.max));
    slider.disabled = Number(slider.max) === 0;
  }

  function barPointerFraction(event) {
    const box = $('barChart').getBoundingClientRect();
    if (!box.width) return 0.5;
    const viewX = (event.clientX - box.left) / box.width * 960;
    return Math.max(0, Math.min(1, (viewX - 64) / (960 - 64 - 15)));
  }

  function applyBarZoom(requestedZoom, anchorFraction = 0.5) {
    if (!current.length) return;
    const maximumZoom = current.length / Math.min(minimumBarWindow, current.length);
    const zoom = Math.max(1, Math.min(maximumZoom, requestedZoom));
    const oldWindow = Math.max(1, Math.round(current.length / barZoom));
    const oldStart = Number($('barStart').value);
    const anchor = oldStart + anchorFraction * oldWindow;
    const nextWindow = barWindowSizeForZoom(current.length, zoom);
    refreshBarWindowOptions(current.length, nextWindow);
    barZoom = current.length / nextWindow;
    const slider = $('barStart');
    slider.max = Math.max(0, current.length - nextWindow);
    slider.value = Math.max(0, Math.min(Number(slider.max), Math.round(anchor - anchorFraction * nextWindow)));
    slider.disabled = Number(slider.max) === 0;
    drawBars();
  }

  function commitBarZoom() {
    const input = $('barZoomInput');
    const parsed = Number(input.value.trim().replace(/×/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      input.value = barZoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return;
    }
    applyBarZoom(parsed);
    input.value = barZoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function applyAutomaticBarView() {
    const previousWindow = Number($('barWindow').value);
    const focus = Number($('barStart').value) + Math.floor(previousWindow / 2);
    const automaticWindow = Math.min(128, current.length);
    refreshBarWindowOptions(current.length, automaticWindow);
    barZoom = current.length / automaticWindow;
    configureBarPan(focus);
    drawBars();
  }

  function handleBarWheel(event) {
    const svg = $('barChart');
    const slider = $('barStart');
    if (event.ctrlKey) {
      event.preventDefault();
      const maximumZoom = current.length / Math.min(minimumBarWindow, current.length);
      const next = Math.max(1, Math.min(maximumZoom, barZoom * Math.exp(-event.deltaY * 0.015)));
      applyBarZoom(next, barPointerFraction(event));
      return;
    }
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.65 || Number($('barStart').max) === 0) return;
    event.preventDefault();
    const windowSize = Number($('barWindow').value);
    const width = Math.max(1, svg.getBoundingClientRect().width);
    const step = Math.sign(event.deltaX) * Math.max(1, Math.round(Math.abs(event.deltaX) / width * windowSize));
    slider.value = Math.max(0, Math.min(Number(slider.max), Number(slider.value) + step));
    drawBars();
  }

  function coupledScale(allValues, visibleValues, minimumWindow = minimumLineWindow) {
    const observedLimit = Math.max(...allValues.map(Math.abs), Number.EPSILON);
    const baseLimit = observedLimit <= 1 ? 1 : observedLimit * 1.05;
    const zoom = allValues.length / Math.max(1, visibleValues.length);
    const maximumZoom = allValues.length / Math.min(minimumWindow, allValues.length);
    const limit = baseLimit / zoom;
    return {
      limit,
      zoom,
      maximumZoom,
      clipped: visibleValues.reduce((count, value) => count + (Math.abs(value) > limit ? 1 : 0), 0)
    };
  }

  function appendVerticalRuler(svg, left, top, plotHeight, limit) {
    const ruler = node('g', { class: 'scale-ruler', 'aria-hidden': 'true' });
    ruler.append(node('line', { x1: left, x2: left, y1: top, y2: top + plotHeight, class: 'scale-ruler-axis' }));
    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const value = limit * (1 - ratio * 2);
      const y = top + ratio * plotHeight;
      ruler.append(node('line', { x1: left - 6, x2: left, y1: y, y2: y, class: 'scale-ruler-tick' }));
      const label = node('text', { x: left - 9, y: y + 4, class: 'scale-ruler-label' });
      const digits = limit < 0.02 ? 5 : limit < 0.2 ? 4 : 3;
      label.textContent = Math.abs(value) < Number.EPSILON ? '0' : number(value, digits);
      ruler.append(label);
    }
    svg.append(ruler);
  }

  function drawLine() {
    const svg = $('lineChart');
    const start = Number($('lineStart').value);
    const requested = Number($('lineWindow').value);
    const values = current.slice(start, start + requested);
    const width = 1000, height = 448, left = 64, right = 15, top = 24, bottom = 40;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const scale = coupledScale(current, values);
    lineZoom = scale.zoom;
    const y = value => top + (scale.limit - value) / (2 * scale.limit) * plotHeight;
    const x = index => left + (index + 0.5) / Math.max(1, values.length) * plotWidth;
    const indexFromPointer = event => {
      const box = svg.getBoundingClientRect();
      const viewX = (event.clientX - box.left) / Math.max(1, box.width) * width;
      const plotX = Math.max(left, Math.min(width - right, viewX));
      return Math.max(0, Math.min(values.length - 1, Math.floor((plotX - left) / plotWidth * values.length)));
    };
    svg.replaceChildren();
    appendVerticalRuler(svg, left, top, plotHeight, scale.limit);
    svg.append(node('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'axis' }));
    const definitions = node('defs');
    const clipPath = node('clipPath', { id: 'linePlotClip' });
    clipPath.append(node('rect', { x: left, y: top, width: plotWidth, height: plotHeight }));
    definitions.append(clipPath);
    svg.append(definitions);
    const plot = node('g', { 'clip-path': 'url(#linePlotClip)' });
    const path = node('path', { class: 'vector-line', d: values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ') });
    plot.append(path);
    const pinnedLocalIndex = linePinnedIndex === null ? -1 : linePinnedIndex - start;
    if (pinnedLocalIndex >= 0 && pinnedLocalIndex < values.length) {
      const pinnedX = x(pinnedLocalIndex);
      const pinnedY = y(values[pinnedLocalIndex]);
      plot.append(node('line', { x1: pinnedX, x2: pinnedX, y1: top, y2: height - bottom, class: 'pinned-axis' }));
      plot.append(node('circle', { cx: pinnedX, cy: pinnedY, r: 6, class: 'pinned-node' }));
    }
    svg.append(plot);
    const cursor = node('line', { y1: top, y2: height - bottom, class: 'cursor', visibility: 'hidden' });
    svg.append(cursor);
    const move = event => {
      const index = indexFromPointer(event);
      const cx = x(index);
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('visibility', 'visible');
      const message = `Coordenada ${start + index + 1}: ${number(values[index], 7)}.`;
      $('lineReading').textContent = message;
      showPointerGuide(event, message);
    };
    svg.onpointermove = move;
    svg.onpointerleave = () => { cursor.setAttribute('visibility', 'hidden'); hidePointerGuide(); };
    svg.onclick = event => {
      linePinnedIndex = start + indexFromPointer(event);
      drawLine();
    };
    const atMaximum = Math.abs(scale.zoom - scale.maximumZoom) < 0.001;
    syncZoomEditor($('lineZoomInput'), $('lineZoomDetail'), scale.zoom, atMaximum);
    const clipping = scale.clipped ? ` ${scale.clipped.toLocaleString('pt-BR')} ${scale.clipped === 1 ? 'coordenada está' : 'coordenadas estão'} fora do enquadramento vertical; os valores não foram alterados.` : '';
    $('lineRange').textContent = `Coordenadas ${(start + 1).toLocaleString('pt-BR')}–${(start + values.length).toLocaleString('pt-BR')} de ${current.length.toLocaleString('pt-BR')}. Limite vertical ±${number(scale.limit, 7)}.${clipping}`;
    if (linePinnedIndex === null) $('linePinnedReading').textContent = 'Clique em uma coordenada para fixá-la no gráfico.';
    else if (linePinnedIndex >= current.length) $('linePinnedReading').textContent = `Coordenada ${linePinnedIndex + 1} fixada · não existe nesta representação.`;
    else $('linePinnedReading').textContent = `Coordenada ${linePinnedIndex + 1} fixada: ${number(current[linePinnedIndex], 7)}${pinnedLocalIndex < 0 || pinnedLocalIndex >= values.length ? ' · fora deste trecho' : ''}.`;
    $('lineReading').textContent = 'Mova o ponteiro sobre a linha para consultar uma coordenada.';
  }

  function configureLinePan(focusIndex = null) {
    const windowSize = Number($('lineWindow').value);
    const slider = $('lineStart');
    slider.max = Math.max(0, current.length - windowSize);
    const focus = focusIndex ?? (linePinnedIndex !== null && linePinnedIndex < current.length ? linePinnedIndex : null);
    if (focus !== null) slider.value = Math.max(0, Math.min(Number(slider.max), focus - Math.floor(windowSize / 2)));
    else slider.value = Math.min(Number(slider.value), Number(slider.max));
    slider.disabled = Number(slider.max) === 0;
  }

  function linePointerFraction(event) {
    const box = $('lineChart').getBoundingClientRect();
    if (!box.width) return 0.5;
    const viewX = (event.clientX - box.left) / box.width * 1000;
    return Math.max(0, Math.min(1, (viewX - 64) / (1000 - 64 - 15)));
  }

  function applyLineZoom(requestedZoom, anchorFraction = 0.5) {
    if (!current.length) return;
    const maximumZoom = current.length / Math.min(minimumLineWindow, current.length);
    const zoom = Math.max(1, Math.min(maximumZoom, requestedZoom));
    const oldWindow = Math.max(1, Math.round(current.length / lineZoom));
    const oldStart = Number($('lineStart').value);
    const anchor = oldStart + anchorFraction * oldWindow;
    const nextWindow = windowSizeForZoom(current.length, zoom);
    refreshWindowOptions(current.length, nextWindow);
    lineZoom = current.length / nextWindow;
    const slider = $('lineStart');
    slider.max = Math.max(0, current.length - nextWindow);
    slider.value = Math.max(0, Math.min(Number(slider.max), Math.round(anchor - anchorFraction * nextWindow)));
    slider.disabled = Number(slider.max) === 0;
    drawLine();
  }

  function commitLineZoom() {
    const input = $('lineZoomInput');
    const parsed = Number(input.value.trim().replace(/×/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      input.value = lineZoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return;
    }
    const windowSize = Number($('lineWindow').value);
    const start = Number($('lineStart').value);
    const pinnedLocal = linePinnedIndex === null ? -1 : linePinnedIndex - start;
    const anchorFraction = pinnedLocal >= 0 && pinnedLocal < windowSize ? (pinnedLocal + 0.5) / windowSize : 0.5;
    applyLineZoom(parsed, anchorFraction);
    input.value = lineZoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function applyAutomaticLineView() {
    const previousWindow = Number($('lineWindow').value);
    const previousStart = Number($('lineStart').value);
    const focus = linePinnedIndex !== null && linePinnedIndex < current.length
      ? linePinnedIndex
      : previousStart + Math.floor(previousWindow / 2);
    const automaticWindow = Math.min(128, current.length);
    refreshWindowOptions(current.length, automaticWindow);
    lineZoom = current.length / automaticWindow;
    configureLinePan(focus);
    drawLine();
  }

  function handleLineWheel(event) {
    const svg = $('lineChart');
    if (event.ctrlKey) {
      event.preventDefault();
      const maximumZoom = current.length / Math.min(minimumLineWindow, current.length);
      const next = Math.max(1, Math.min(maximumZoom, lineZoom * Math.exp(-event.deltaY * 0.015)));
      applyLineZoom(next, linePointerFraction(event));
      return;
    }
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.65 || Number($('lineStart').max) === 0) return;
    event.preventDefault();
    const windowSize = Number($('lineWindow').value);
    const width = Math.max(1, svg.getBoundingClientRect().width);
    const delta = Math.sign(event.deltaX) * Math.max(1, Math.round(Math.abs(event.deltaX) / width * windowSize));
    $('lineStart').value = Math.max(0, Math.min(Number($('lineStart').max), Number($('lineStart').value) + delta));
    drawLine();
  }

  function renderRecord() {
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
    $('barWindow').addEventListener('change', event => applyBarZoom(current.length / Number(event.target.value)));
    $('barAuto').addEventListener('click', applyAutomaticBarView);
    $('barStart').addEventListener('input', drawBars);
    $('barChart').addEventListener('wheel', handleBarWheel, { passive: false });
    $('barZoomInput').addEventListener('change', commitBarZoom);
    $('barZoomInput').addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitBarZoom();
      event.currentTarget.blur();
    });
    $('lineWindow').addEventListener('change', event => applyLineZoom(current.length / Number(event.target.value)));
    $('lineAuto').addEventListener('click', applyAutomaticLineView);
    $('lineStart').addEventListener('input', drawLine);
    $('lineChart').addEventListener('wheel', handleLineWheel, { passive: false });
    $('lineZoomInput').addEventListener('change', commitLineZoom);
    $('lineZoomInput').addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitLineZoom();
      event.currentTarget.blur();
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
    openEntry: loadRegisteredEntry,
    openPicker: purpose => window.LabVisualOpenEntryPicker(purpose),
    currentEntry: () => selectedEntryId,
    currentRecipe: () => ({ pooling: $('pooling').value, normalization: $('normalization').value, metric: $('metric').value })
  };
})();
