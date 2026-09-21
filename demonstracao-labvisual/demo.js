(() => {
  'use strict';
  const entries = { synthetic: window.LAB_DEMO_DATA };
  let data = entries.synthetic;
  const $ = id => document.getElementById(id);
  const svgNS = 'http://www.w3.org/2000/svg';
  const labels = {
    stage: { before: 'antes do merger', after: 'depois do merger' },
    pooling: { mean: 'Média', max: 'Máximo', median: 'Mediana' },
    normalization: { l2: 'L2', l1: 'L1', linf: 'L∞', none: 'sem normalização' }
  };
  let current = [];
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

  function drawPattern() {
    const canvas = $('pattern');
    const context = canvas.getContext('2d');
    context.fillStyle = '#f5f8f5';
    context.fillRect(0, 0, 320, 240);
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 8; column++) {
        context.fillStyle = (row + column) % 2 ? '#004e92' : '#f2992e';
        context.fillRect(32 + column * 32, 24 + row * 32, 27, 27);
      }
    }
    const patchCanvas = $('patchPattern');
    const patchContext = patchCanvas.getContext('2d');
    patchContext.drawImage(canvas, 0, 0, 320, 240, 0, 0, 288, 192);
    const entryCanvas = $('entryPattern');
    const entryContext = entryCanvas.getContext('2d');
    entryContext.drawImage(canvas, 0, 0, 320, 240, 0, 0, 160, 120);
  }

  function normalize(vector, method) {
    if (method === 'none') return { vector: vector.slice(), divisor: 1 };
    let divisor;
    if (method === 'l1') divisor = vector.reduce((sum, value) => sum + Math.abs(value), 0);
    else if (method === 'linf') divisor = Math.max(...vector.map(Math.abs));
    else divisor = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return { vector: vector.map(value => value / divisor), divisor };
  }

  function recipe() {
    return { stage: $('stage').value, pooling: $('pooling').value, normalization: $('normalization').value };
  }

  function refreshWindowOptions(dimensions) {
    const select = $('lineWindow');
    const previous = Number(select.value);
    const sizes = [dimensions, 1024, 512, 256].filter((value, index, array) => value <= dimensions && array.indexOf(value) === index);
    select.replaceChildren(...sizes.map((size, index) => new Option(index === 0 ? `Todas · ${size.toLocaleString('pt-BR')}` : size.toLocaleString('pt-BR'), String(size))));
    if (sizes.includes(previous)) select.value = String(previous);
  }

  function update() {
    const choice = recipe();
    const raw = data.vectors[choice.stage][choice.pooling];
    const result = normalize(raw, choice.normalization);
    current = result.vector;
    const meta = data.stages[choice.stage];
    const peakValue = Math.max(...current.map(Math.abs));
    const peakIndex = current.findIndex(value => Math.abs(value) === peakValue);

    $('recipeReading').textContent = `${labels.pooling[choice.pooling]} dos ${meta.tokens} tokens → ${labels.normalization[choice.normalization]} → representação ${labels.stage[choice.stage]}.`;
    $('tokenCount').textContent = meta.tokens.toLocaleString('pt-BR');
    $('dimensionCount').textContent = meta.dimensions.toLocaleString('pt-BR');
    $('divisor').textContent = choice.normalization === 'none' ? 'nenhum' : number(result.divisor, 4);
    $('peak').textContent = `#${peakIndex + 1} · ${number(current[peakIndex])}`;

    $('barStart').max = Math.max(0, current.length - 48);
    $('barStart').value = Math.min(Number($('barStart').value), Number($('barStart').max));
    refreshWindowOptions(current.length);
    const windowSize = Number($('lineWindow').value);
    $('lineStart').max = Math.max(0, current.length - windowSize);
    $('lineStart').value = Math.min(Number($('lineStart').value), Number($('lineStart').max));
    drawBars();
    drawLine();
  }

  function drawBars() {
    const svg = $('barChart');
    const start = Number($('barStart').value);
    const values = current.slice(start, start + 48);
    const width = 960, height = 280, left = 42, right = 12, top = 18, bottom = 32;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const zero = top + plotHeight / 2;
    const maximum = Math.max(...values.map(Math.abs), Number.EPSILON);
    const slot = plotWidth / values.length;
    svg.replaceChildren();
    svg.append(node('line', { x1: left, x2: width - right, y1: zero, y2: zero, class: 'axis' }));
    values.forEach((value, index) => {
      const magnitude = Math.abs(value) / maximum * (plotHeight / 2 - 8);
      const rect = node('rect', {
        x: left + index * slot + 2,
        y: value >= 0 ? zero - magnitude : zero,
        width: Math.max(2, slot - 4),
        height: Math.max(1, magnitude),
        rx: 1,
        class: `bar ${value >= 0 ? 'bar-positive' : 'bar-negative'}`,
        tabindex: 0,
        role: 'img',
        'aria-label': `Coordenada ${start + index + 1}: ${number(value, 7)}`
      });
      const message = `Coordenada ${start + index + 1}: ${number(value, 7)}.`;
      const read = () => $('barReading').textContent = message;
      rect.addEventListener('mouseenter', read);
      rect.addEventListener('focus', read);
      rect.addEventListener('pointermove', event => { read(); showPointerGuide(event, message); });
      rect.addEventListener('pointerleave', hidePointerGuide);
      svg.append(rect);
    });
    $('barRange').textContent = `Coordenadas ${(start + 1).toLocaleString('pt-BR')}–${(start + values.length).toLocaleString('pt-BR')} de ${current.length.toLocaleString('pt-BR')}. A escala usa o maior valor absoluto deste trecho.`;
  }

  function drawLine() {
    const svg = $('lineChart');
    const start = Number($('lineStart').value);
    const requested = Number($('lineWindow').value);
    const values = current.slice(start, start + requested);
    const width = 1000, height = 280, left = 45, right = 15, top = 18, bottom = 32;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const maximum = Math.max(...current.map(Math.abs), Number.EPSILON);
    const y = value => top + (maximum - value) / (2 * maximum) * plotHeight;
    const x = index => left + (values.length === 1 ? 0 : index / (values.length - 1) * plotWidth);
    svg.replaceChildren();
    svg.append(node('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'axis' }));
    const path = node('path', { class: 'vector-line', d: values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ') });
    svg.append(path);
    const cursor = node('line', { y1: top, y2: height - bottom, class: 'cursor', visibility: 'hidden' });
    svg.append(cursor);
    const move = event => {
      const box = svg.getBoundingClientRect();
      const localX = Math.max(0, Math.min(box.width, event.clientX - box.left));
      const index = Math.round(localX / box.width * (values.length - 1));
      const cx = x(index);
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('visibility', 'visible');
      const message = `Coordenada ${start + index + 1}: ${number(values[index], 7)}.`;
      $('lineReading').textContent = message;
      showPointerGuide(event, message);
    };
    svg.onpointermove = move;
    svg.onpointerleave = () => { cursor.setAttribute('visibility', 'hidden'); hidePointerGuide(); };
    $('lineRange').textContent = `Coordenadas ${(start + 1).toLocaleString('pt-BR')}–${(start + values.length).toLocaleString('pt-BR')} de ${current.length.toLocaleString('pt-BR')}. A escala vertical permanece fixa ao ampliar este vetor.`;
  }

  function renderRecord() {
    $('recordedTime').textContent = `${data.record.execution.inference_seconds.toLocaleString('pt-BR')} s`;
    $('record').textContent = JSON.stringify(data.record, null, 2);
  }

  function loadRegisteredEntry(entryId, { scroll = false } = {}) {
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
      drawPattern();
      renderRecord();
      update();
      document.querySelectorAll('[data-entry-id]').forEach(option => option.removeAttribute('aria-current'));
      document.querySelector(`[data-entry-id="${entryId}"]`).setAttribute('aria-current', 'true');
      $('executionButtonLabel').textContent = 'Execução registrada';
      $('executionStatus').textContent = `Registro carregado: ${data.record.source}.`;
      card.removeAttribute('aria-busy');
      button.disabled = false;
      if (scroll) $('entrada-atual').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 520);
  }

  function events() {
    const entryDialog = $('entryDialog');
    for (const trigger of document.querySelectorAll('[data-open-entry-picker]')) {
      trigger.addEventListener('click', () => entryDialog.showModal());
    }
    entryDialog.addEventListener('close', () => {
      if (entryDialog.returnValue !== 'synthetic') return;
      loadRegisteredEntry('synthetic', { scroll: true });
    });
    $('replayExecution').addEventListener('click', () => loadRegisteredEntry('synthetic'));
    for (const id of ['stage', 'pooling', 'normalization']) $(id).addEventListener('change', () => {
      $('barStart').value = 0; $('lineStart').value = 0; update();
    });
    $('barStart').addEventListener('input', drawBars);
    $('lineWindow').addEventListener('change', () => { $('lineStart').value = 0; $('lineStart').max = Math.max(0, current.length - Number($('lineWindow').value)); drawLine(); });
    $('lineStart').addEventListener('input', drawLine);
  }

  if (!data) {
    document.body.textContent = 'Os dados públicos da demonstração não foram encontrados.';
    return;
  }
  drawPattern();
  renderRecord();
  events();
  update();
})();
