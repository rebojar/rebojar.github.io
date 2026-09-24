(() => {
  'use strict';

  const dataset = window.LAB_DEMO;
  const app = window.LabVisualPublicDemo;
  if (!dataset || !app) return;

  const $ = id => document.getElementById(id);
  const viewNames = ['single', 'batch', 'neighbors', 'video'];
  const tabOrder = viewNames.map(name => $(`${name}Tab`));
  let neighborEntryId = `example:${dataset.images[0].id}`;
  let sequenceVector = [];
  const minimumSequenceWindow = 64;
  let sequenceZoom = 1;
  let sequencePinnedIndex = null;

  function previewBackground(item) {
    return item._hasTransparentPixels ? item._selectedBackground : '#ffffff';
  }

  function syncZoomEditor(input, detail, zoom, atMaximum) {
    if (document.activeElement !== input) {
      input.value = zoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    detail.textContent = atMaximum ? 'detalhe máximo · eixos vinculados' : 'eixos horizontal e vertical vinculados';
  }

  function nearest(item, stage, recipe) {
    return window.LabDemoAnalysis.nearest(dataset.images, dataset.images.indexOf(item), stage, recipe);
  }

  function showView(name, { focus = false } = {}) {
    for (const candidate of viewNames) {
      const active = candidate === name;
      $(`${candidate}View`).hidden = !active;
      const tab = $(`${candidate}Tab`);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    if (name === 'neighbors') renderNeighbors();
    if (name === 'video') renderSequence();
  }

  function setupTabs() {
    tabOrder.forEach((tab, index) => {
      tab.addEventListener('click', () => showView(viewNames[index]));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabOrder.length;
        if (event.key === 'ArrowLeft') next = (index + tabOrder.length - 1) % tabOrder.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabOrder.length - 1;
        showView(viewNames[next], { focus: true });
      });
    });
  }

  function entryButton(item) {
    const button = document.createElement('button');
    button.className = 'entry-option';
    button.type = 'submit';
    button.value = `example:${item.id}`;
    button.dataset.entryId = button.value;
    const image = document.createElement('img');
    image.src = item.file;
    image.alt = '';
    image.loading = 'lazy';
    image.style.backgroundColor = previewBackground(item);
    const copy = document.createElement('span');
    copy.className = 'entry-option-copy';
    const title = document.createElement('strong');
    title.textContent = item.label;
    const meta = document.createElement('span');
    meta.textContent = `${item.tokens_before.toLocaleString('pt-BR')} patches · ${item.tokens_after.toLocaleString('pt-BR')} tokens depois do merger`;
    const status = document.createElement('small');
    status.textContent = 'Execução disponível';
    copy.append(title, meta, status);
    button.append(image, copy);
    return button;
  }

  function setupEntryPicker() {
    const options = $('entryOptions');
    const transparentFirst = dataset.images.find(item => item.id === 'branco_transparente');
    if (transparentFirst) options.prepend(entryButton(transparentFirst));
    for (const item of dataset.images) {
      if (item !== transparentFirst) options.append(entryButton(item));
    }
  }

  function openEntry(entryId) {
    showView('single');
    app.openEntry(entryId, {
      scroll: true,
      workflow: true,
      executed: true,
      automatic: true
    });
  }

  function setupBatch() {
    const gallery = $('batchGallery');
    const fragment = document.createDocumentFragment();
    for (const item of dataset.images) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'batch-card';
      button.dataset.entryId = `example:${item.id}`;
      const image = document.createElement('img');
      image.src = item.file;
      image.alt = '';
      image.loading = 'lazy';
      image.style.backgroundColor = previewBackground(item);
      const title = document.createElement('strong');
      title.textContent = item.label;
      const meta = document.createElement('span');
      meta.textContent = `${item.tokens_before} → ${item.tokens_after} tokens`;
      button.append(image, title, meta);
      button.addEventListener('click', () => openEntry(button.dataset.entryId));
      fragment.append(button);
    }
    gallery.replaceChildren(fragment);
    $('batchSummary').textContent = `${dataset.images.length} de ${dataset.images.length} conferidas`;
  }

  function exampleByEntryId(entryId) {
    return dataset.images.find(item => `example:${item.id}` === entryId);
  }

  function neighborCard(row, metric) {
    const item = dataset.images[row.index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'neighbor-card-public';
    const image = document.createElement('img');
    image.src = item.prepared;
    image.alt = '';
    image.loading = 'lazy';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.label;
    const score = document.createElement('small');
    const metricLabel = { cosine: 'cosseno', euclidean: 'distância', dot: 'produto escalar' }[metric];
    score.textContent = `${metricLabel} ${row.score.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 8 })}`;
    copy.append(title, score);
    button.append(image, copy);
    button.addEventListener('click', () => {
      neighborEntryId = `example:${item.id}`;
      renderNeighbors();
    });
    return button;
  }

  function renderNeighbors() {
    const item = exampleByEntryId(neighborEntryId) || dataset.images[0];
    const recipe = { pooling: $('neighborPooling').value, normalization: $('neighborNormalization').value, metric: $('neighborMetric').value };
    neighborEntryId = `example:${item.id}`;
    $('neighborSourceLabel').textContent = item.label;
    $('neighborAnchorImage').src = item.prepared;
    $('neighborAnchorImage').alt = `${item.label} — entrada preparada`;
    $('neighbor-title').textContent = item._hasTransparentPixels
      ? `${item.label} · fundo ${item._selectedBackground.toUpperCase()}`
      : item.label;
    $('neighborsBefore').replaceChildren(...nearest(item, 'before', recipe).map(row => neighborCard(row, recipe.metric)));
    $('neighborsAfter').replaceChildren(...nearest(item, 'after', recipe).map(row => neighborCard(row, recipe.metric)));
    const normalizationLabel = { l2: 'L2', l1: 'L1', linf: 'L∞', none: 'sem normalização' }[recipe.normalization];
    const metricLabel = { cosine: 'cosseno', euclidean: 'distância euclidiana', dot: 'produto escalar' }[recipe.metric];
    const poolingLabel = { mean: 'Média', max: 'Máximo', median: 'Mediana' }[recipe.pooling];
    $('neighborsRecipeBadge').textContent = `${poolingLabel} · ${normalizationLabel} · ${metricLabel}`;
    const transparent = dataset.images.find(image => image._hasTransparentPixels);
    $('neighborsDatasetNote').textContent = `Receita aplicada igualmente às doze imagens. Entrada transparente: fundo ${transparent._selectedBackground.toUpperCase()}. Alterar esse fundo em “Uma imagem” atualiza sua participação no lote e pode mudar os vizinhos de qualquer referência.`;
    $('neighborsMetricNote').textContent = recipe.metric === 'euclidean'
      ? 'Na distância euclidiana, valores menores indicam maior proximidade dentro deste pequeno lote. Isso não mede compreensão nem semelhança visual humana.'
      : recipe.metric === 'dot'
        ? 'No produto escalar, valores maiores ficam primeiro e dependem também do comprimento dos vetores. Isso não mede compreensão nem confiança.'
        : 'Cosseno próximo de 1 indica vetores mais alinhados dentro deste pequeno lote. Não é porcentagem de compreensão, confiança ou semelhança visual humana.';
  }

  function setupNeighbors() {
    for (const id of ['neighborPooling', 'neighborNormalization', 'neighborMetric']) $(id).addEventListener('change', renderNeighbors);
    $('neighborSource').addEventListener('click', () => app.openPicker('neighbor'));
    window.addEventListener('labvisual:neighborselect', event => {
      if (!exampleByEntryId(event.detail?.entryId)) return;
      neighborEntryId = event.detail.entryId;
      renderNeighbors();
    });
    $('openNeighborEntry').addEventListener('click', () => openEntry(neighborEntryId));
    renderNeighbors();
  }

  window.addEventListener('labvisual:entrychange', event => {
    const item = event.detail?.data?.image;
    if (!item) return;
    document.querySelectorAll(`[data-entry-id="example:${item.id}"] img`).forEach(image => {
      image.style.backgroundColor = previewBackground(item);
    });
    renderNeighbors();
  });

  function showPointerGuide(event, message) {
    const guide = $('pointerGuide');
    guide.textContent = message;
    guide.hidden = false;
    const left = Math.min(event.clientX + 10, window.innerWidth - guide.offsetWidth - 24);
    const top = Math.min(event.clientY + 10, window.innerHeight - guide.offsetHeight - 24);
    guide.style.left = `${Math.max(8, left)}px`;
    guide.style.top = `${Math.max(8, top)}px`;
  }

  function hidePointerGuide() {
    $('pointerGuide').hidden = true;
  }

  function sequenceWindowForZoom(dimensions, zoom) {
    if (!dimensions) return 0;
    const smallest = Math.min(minimumSequenceWindow, dimensions);
    return Math.max(smallest, Math.min(dimensions, Math.round(dimensions / Math.max(1, zoom))));
  }

  function refreshSequenceWindowOptions(dimensions, selectedSize = sequenceWindowForZoom(dimensions, sequenceZoom)) {
    const select = $('sequenceLineWindow');
    const safeSize = Math.max(Math.min(minimumSequenceWindow, dimensions), Math.min(dimensions, selectedSize));
    const sizes = [dimensions, 1024, 512, 256, 128, 64, safeSize]
      .filter((value, index, array) => value <= dimensions && array.indexOf(value) === index)
      .sort((left, right) => right - left);
    select.replaceChildren(...sizes.map(size => new Option(
      size === dimensions ? `Todas · ${size.toLocaleString('pt-BR')}` : size.toLocaleString('pt-BR'),
      String(size)
    )));
    select.value = String(safeSize);
  }

  function coupledScale(allValues, visibleValues) {
    const observedLimit = Math.max(...allValues.map(Math.abs), Number.EPSILON);
    const baseLimit = observedLimit <= 1 ? 1 : observedLimit * 1.05;
    const zoom = allValues.length / Math.max(1, visibleValues.length);
    const maximumZoom = allValues.length / Math.min(minimumSequenceWindow, allValues.length);
    const limit = baseLimit / zoom;
    return {
      limit,
      zoom,
      maximumZoom,
      clipped: visibleValues.reduce((count, value) => count + (Math.abs(value) > limit ? 1 : 0), 0)
    };
  }

  function appendVerticalRuler(svg, make, left, top, plotHeight, limit) {
    const ruler = make('g', { class: 'scale-ruler', 'aria-hidden': 'true' });
    ruler.append(make('line', { x1: left, x2: left, y1: top, y2: top + plotHeight, class: 'scale-ruler-axis' }));
    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const value = limit * (1 - ratio * 2);
      const y = top + ratio * plotHeight;
      ruler.append(make('line', { x1: left - 6, x2: left, y1: y, y2: y, class: 'scale-ruler-tick' }));
      const label = make('text', { x: left - 9, y: y + 4, class: 'scale-ruler-label' });
      const digits = limit < 0.02 ? 5 : limit < 0.2 ? 4 : 3;
      label.textContent = Math.abs(value) < Number.EPSILON
        ? '0'
        : value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
      ruler.append(label);
    }
    svg.append(ruler);
  }

  function drawSequenceChart() {
    const allValues = sequenceVector;
    if (!allValues.length) return;
    const start = Number($('sequenceLineStart').value);
    const requested = Number($('sequenceLineWindow').value);
    const values = allValues.slice(start, start + requested);
    const svg = $('sequenceChart');
    const width = 1000;
    const height = 448;
    const left = 64;
    const right = 15;
    const top = 24;
    const bottom = 40;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const scale = coupledScale(allValues, values);
    sequenceZoom = scale.zoom;
    const x = index => left + (index + 0.5) / Math.max(1, values.length) * plotWidth;
    const indexFromPointer = event => {
      const box = svg.getBoundingClientRect();
      const viewX = (event.clientX - box.left) / Math.max(1, box.width) * width;
      const plotX = Math.max(left, Math.min(width - right, viewX));
      return Math.max(0, Math.min(values.length - 1, Math.floor((plotX - left) / plotWidth * values.length)));
    };
    const y = value => top + (scale.limit - value) / (2 * scale.limit) * plotHeight;
    const ns = 'http://www.w3.org/2000/svg';
    const make = (name, attributes) => {
      const element = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    };
    svg.replaceChildren();
    appendVerticalRuler(svg, make, left, top, plotHeight, scale.limit);
    svg.append(make('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'axis' }));
    const definitions = make('defs', {});
    const clipPath = make('clipPath', { id: 'sequencePlotClip' });
    clipPath.append(make('rect', { x: left, y: top, width: plotWidth, height: plotHeight }));
    definitions.append(clipPath);
    svg.append(definitions);
    const plot = make('g', { 'clip-path': 'url(#sequencePlotClip)' });
    plot.append(make('path', {
      class: 'vector-line',
      d: values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ')
    }));
    const pinnedLocalIndex = sequencePinnedIndex === null ? -1 : sequencePinnedIndex - start;
    if (pinnedLocalIndex >= 0 && pinnedLocalIndex < values.length) {
      const pinnedX = x(pinnedLocalIndex);
      const pinnedY = y(values[pinnedLocalIndex]);
      plot.append(make('line', { x1: pinnedX, x2: pinnedX, y1: top, y2: height - bottom, class: 'pinned-axis' }));
      plot.append(make('circle', { cx: pinnedX, cy: pinnedY, r: 6, class: 'pinned-node' }));
    }
    svg.append(plot);
    const cursor = make('line', { y1: top, y2: height - bottom, class: 'cursor', visibility: 'hidden' });
    svg.append(cursor);
    svg.onpointermove = event => {
      const index = indexFromPointer(event);
      const cursorX = x(index);
      cursor.setAttribute('x1', cursorX);
      cursor.setAttribute('x2', cursorX);
      cursor.setAttribute('visibility', 'visible');
      const message = `Coordenada ${start + index + 1}: ${values[index].toLocaleString('pt-BR', { maximumFractionDigits: 8 })}.`;
      $('sequenceChartReading').textContent = message;
      showPointerGuide(event, message);
    };
    svg.onpointerleave = () => {
      cursor.setAttribute('visibility', 'hidden');
      hidePointerGuide();
    };
    svg.onclick = event => {
      sequencePinnedIndex = start + indexFromPointer(event);
      drawSequenceChart();
    };
    const atMaximum = Math.abs(scale.zoom - scale.maximumZoom) < 0.001;
    syncZoomEditor($('sequenceZoomInput'), $('sequenceZoomDetail'), scale.zoom, atMaximum);
    const clipping = scale.clipped ? ` ${scale.clipped.toLocaleString('pt-BR')} ${scale.clipped === 1 ? 'coordenada está' : 'coordenadas estão'} fora do enquadramento vertical; os valores não foram alterados.` : '';
    $('sequenceChartRange').textContent = `Coordenadas ${(start + 1).toLocaleString('pt-BR')}–${(start + values.length).toLocaleString('pt-BR')} de ${allValues.length.toLocaleString('pt-BR')}. Limite vertical ±${scale.limit.toLocaleString('pt-BR', { maximumFractionDigits: 7 })}.${clipping}`;
    if (sequencePinnedIndex === null) $('sequencePinnedReading').textContent = 'Clique em uma coordenada para fixá-la no gráfico.';
    else $('sequencePinnedReading').textContent = `Coordenada ${sequencePinnedIndex + 1} fixada: ${allValues[sequencePinnedIndex].toLocaleString('pt-BR', { maximumFractionDigits: 8 })}${pinnedLocalIndex < 0 || pinnedLocalIndex >= values.length ? ' · fora deste trecho' : ''}.`;
    $('sequenceChartReading').textContent = 'Mova o ponteiro sobre a linha para consultar uma coordenada.';
  }

  function configureSequencePan(focusIndex = null) {
    const windowSize = Number($('sequenceLineWindow').value);
    const slider = $('sequenceLineStart');
    slider.max = Math.max(0, sequenceVector.length - windowSize);
    const focus = focusIndex ?? (sequencePinnedIndex !== null ? sequencePinnedIndex : null);
    if (focus !== null) slider.value = Math.max(0, Math.min(Number(slider.max), focus - Math.floor(windowSize / 2)));
    else slider.value = Math.min(Number(slider.value), Number(slider.max));
    slider.disabled = Number(slider.max) === 0;
  }

  function sequencePointerFraction(event) {
    const box = $('sequenceChart').getBoundingClientRect();
    if (!box.width) return 0.5;
    const viewX = (event.clientX - box.left) / box.width * 1000;
    return Math.max(0, Math.min(1, (viewX - 64) / (1000 - 64 - 15)));
  }

  function applySequenceZoom(requestedZoom, anchorFraction = 0.5) {
    if (!sequenceVector.length) return;
    const maximumZoom = sequenceVector.length / Math.min(minimumSequenceWindow, sequenceVector.length);
    const zoom = Math.max(1, Math.min(maximumZoom, requestedZoom));
    const oldWindow = Math.max(1, Math.round(sequenceVector.length / sequenceZoom));
    const oldStart = Number($('sequenceLineStart').value);
    const anchor = oldStart + anchorFraction * oldWindow;
    const nextWindow = sequenceWindowForZoom(sequenceVector.length, zoom);
    refreshSequenceWindowOptions(sequenceVector.length, nextWindow);
    sequenceZoom = sequenceVector.length / nextWindow;
    const slider = $('sequenceLineStart');
    slider.max = Math.max(0, sequenceVector.length - nextWindow);
    slider.value = Math.max(0, Math.min(Number(slider.max), Math.round(anchor - anchorFraction * nextWindow)));
    slider.disabled = Number(slider.max) === 0;
    drawSequenceChart();
  }

  function commitSequenceZoom() {
    const input = $('sequenceZoomInput');
    const parsed = Number(input.value.trim().replace(/×/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      input.value = sequenceZoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return;
    }
    const windowSize = Number($('sequenceLineWindow').value);
    const start = Number($('sequenceLineStart').value);
    const pinnedLocal = sequencePinnedIndex === null ? -1 : sequencePinnedIndex - start;
    const anchorFraction = pinnedLocal >= 0 && pinnedLocal < windowSize ? (pinnedLocal + 0.5) / windowSize : 0.5;
    applySequenceZoom(parsed, anchorFraction);
    input.value = sequenceZoom.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function applyAutomaticSequenceView() {
    const previousWindow = Number($('sequenceLineWindow').value);
    const previousStart = Number($('sequenceLineStart').value);
    const focus = sequencePinnedIndex !== null
      ? sequencePinnedIndex
      : previousStart + Math.floor(previousWindow / 2);
    const automaticWindow = Math.min(128, sequenceVector.length);
    refreshSequenceWindowOptions(sequenceVector.length, automaticWindow);
    sequenceZoom = sequenceVector.length / automaticWindow;
    configureSequencePan(focus);
    drawSequenceChart();
  }

  function handleSequenceWheel(event) {
    const svg = $('sequenceChart');
    if (event.ctrlKey) {
      event.preventDefault();
      const maximumZoom = sequenceVector.length / Math.min(minimumSequenceWindow, sequenceVector.length);
      const next = Math.max(1, Math.min(maximumZoom, sequenceZoom * Math.exp(-event.deltaY * 0.015)));
      applySequenceZoom(next, sequencePointerFraction(event));
      return;
    }
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.65 || Number($('sequenceLineStart').max) === 0) return;
    event.preventDefault();
    const windowSize = Number($('sequenceLineWindow').value);
    const width = Math.max(1, svg.getBoundingClientRect().width);
    const delta = Math.sign(event.deltaX) * Math.max(1, Math.round(Math.abs(event.deltaX) / width * windowSize));
    $('sequenceLineStart').value = Math.max(0, Math.min(Number($('sequenceLineStart').max), Number($('sequenceLineStart').value) + delta));
    drawSequenceChart();
  }

  function focusSequenceFrame(sequence, index) {
    const safeIndex = Math.max(0, Math.min(sequence.prepared_frames.length - 1, Number(index)));
    $('sequenceFrame').value = safeIndex;
    $('sequenceFocus').src = sequence.prepared_frames[safeIndex];
    $('sequenceFocus').alt = `Quadro preparado em ${sequence.timestamps[safeIndex].toLocaleString('pt-BR')} segundos`;
    $('sequenceFrameReading').textContent = `Quadro ${safeIndex + 1} de ${sequence.prepared_frames.length} · ${sequence.timestamps[safeIndex].toLocaleString('pt-BR')} s.`;
    document.querySelectorAll('.sequence-frame-button').forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === safeIndex)));
  }

  function renderSequence() {
    const sequence = dataset.sequences[Number($('sequenceFormat').value) || 0];
    if (!sequence) return;
    const media = document.createElement(sequence.label === 'GIF' ? 'img' : 'video');
    media.src = sequence.file;
    if (sequence.label === 'GIF') media.alt = 'GIF original usado no ensaio';
    else {
      media.controls = true;
      media.preload = 'metadata';
      media.setAttribute('aria-label', 'Vídeo original usado no ensaio');
    }
    $('sequenceOriginal').replaceChildren(media);
    $('sequenceMeta').textContent = `${sequence.label} · ${sequence.duration.toLocaleString('pt-BR')} s · ${sequence.prepared_frames.length} quadros selecionados · fundo branco registrado · ${sequence.tokens_before} tokens antes / ${sequence.tokens_after} depois do merger.`;
    const sequenceParameters = { preparation: sequence.preparation, execution: sequence.execution,
      analysis: sequence.analysis, provenance: sequence.provenance };
    if (window.LabVisualRenderJson) window.LabVisualRenderJson('sequenceRecord', sequenceParameters);
    else $('sequenceRecord').textContent = JSON.stringify(sequenceParameters, null, 2);
    $('sequenceFrame').max = sequence.prepared_frames.length - 1;
    const frames = sequence.prepared_frames.map((path, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sequence-frame-button';
      button.setAttribute('aria-pressed', String(index === 0));
      const image = document.createElement('img');
      image.src = path;
      image.alt = '';
      const label = document.createElement('span');
      label.textContent = `${sequence.timestamps[index].toLocaleString('pt-BR')} s`;
      button.append(image, label);
      button.addEventListener('click', () => focusSequenceFrame(sequence, index));
      return button;
    });
    $('sequenceFrames').replaceChildren(...frames);
    focusSequenceFrame(sequence, 0);
    sequenceVector = sequence.after;
    refreshSequenceWindowOptions(sequenceVector.length);
    configureSequencePan();
    drawSequenceChart();
  }

  function setupVideo() {
    const select = $('sequenceFormat');
    dataset.sequences.forEach((sequence, index) => select.append(new Option(sequence.label, String(index))));
    select.addEventListener('change', () => { sequenceZoom = 1; renderSequence(); });
    $('sequenceFrame').addEventListener('input', () => {
      const sequence = dataset.sequences[Number(select.value) || 0];
      focusSequenceFrame(sequence, $('sequenceFrame').value);
    });
    $('sequenceLineWindow').addEventListener('change', event => applySequenceZoom(sequenceVector.length / Number(event.target.value)));
    $('sequenceLineAuto').addEventListener('click', applyAutomaticSequenceView);
    $('sequenceLineStart').addEventListener('input', drawSequenceChart);
    $('sequenceChart').addEventListener('wheel', handleSequenceWheel, { passive: false });
    $('sequenceZoomInput').addEventListener('change', commitSequenceZoom);
    $('sequenceZoomInput').addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitSequenceZoom();
      event.currentTarget.blur();
    });
    renderSequence();
  }

  window.addEventListener('labvisual:entrychange', event => {
    document.querySelectorAll('[data-entry-id]').forEach(button => {
      button.setAttribute('aria-current', String(button.dataset.entryId === event.detail.entryId));
    });
  });

  setupTabs();
  setupEntryPicker();
  setupBatch();
  setupNeighbors();
  setupVideo();
})();
