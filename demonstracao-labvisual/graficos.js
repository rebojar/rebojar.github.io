/* Componente de gráficos compartilhado entre imagem e vídeo. Não modifica os vetores. */
(function(root) {
 'use strict';
 function mount(container,prefix) {
  for (const original of document.querySelectorAll('#explorar > .chart-section')) {
   const copy=original.cloneNode(true);
   copy.querySelector('.bar-stage-control')?.remove();
   for (const element of [copy,...copy.querySelectorAll('*')]) {
    if(element.id) element.id=prefix+element.id;
    for(const attr of ['for','aria-labelledby','aria-describedby']) if(element.hasAttribute(attr)) {
      element.setAttribute(attr,element.getAttribute(attr).split(' ').map(id=>prefix+id).join(' '));
    }
   }
   copy.querySelectorAll('svg').forEach(svg=>svg.replaceChildren());
   container.append(copy);
  }
 }
 function create(prefix='') {
  const $=id=>document.getElementById(id==='pointerGuide'?id:prefix+id);
  const svgNS='http://www.w3.org/2000/svg';
  let current=[], barZoom=1, lineZoom=1, linePinnedIndex=null, barPinnedIndex=null;
  const minimumBarWindow=12, minimumLineWindow=64;
  function wheelPixels(event,svg) {
   const factor=event.deltaMode===1?16:event.deltaMode===2?Math.max(1,svg.getBoundingClientRect().height):1;
   return {deltaX:event.deltaX*factor,deltaY:event.deltaY*factor,ctrlKey:event.ctrlKey,clientX:event.clientX,
     preventDefault:()=>event.preventDefault()};
  }
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
    const clipPath = node('clipPath', { id: prefix + 'barPlotClip' });
    clipPath.append(node('rect', { x: left, y: top, width: plotWidth, height: plotHeight }));
    definitions.append(clipPath);
    svg.append(definitions);
    const plot = node('g', { 'clip-path': `url(#${prefix}barPlotClip)` });
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
      rect.addEventListener('click', () => { barPinnedIndex = start + index; drawBars(); $('barReading').textContent = message + ' Selecionada.'; });
      if (barPinnedIndex === start + index) { rect.setAttribute('stroke', 'var(--celeste)'); rect.setAttribute('stroke-width', '2'); }
      rect.addEventListener('mouseenter', read);
      rect.addEventListener('focus', read);
      rect.addEventListener('pointermove', event => { read(); showPointerGuide(event, message); });
      rect.addEventListener('pointerleave', hidePointerGuide);
      plot.append(rect);
      if (Math.abs(value) > scale.limit) {
        const boundary = value > 0 ? top : top + plotHeight;
        plot.append(node('line', {x1:left+index*slot,x2:left+(index+1)*slot,y1:boundary,y2:boundary,class:'clip-marker'}));
      }
    });
    svg.append(plot);
    const atMaximum = Math.abs(scale.zoom - scale.maximumZoom) < 0.001;
    syncZoomEditor($('barZoomInput'), $('barZoomDetail'), scale.zoom, atMaximum);
    $('barWindowTitle').textContent = values.length.toLocaleString('pt-BR');
    const clipping = scale.clipped ? ` ${scale.clipped.toLocaleString('pt-BR')} ${scale.clipped === 1 ? 'barra está' : 'barras estão'} fora do enquadramento vertical; os valores não foram alterados.` : '';
    $('barRange').textContent = `Coordenadas ${(start + 1).toLocaleString('pt-BR')}–${(start + values.length).toLocaleString('pt-BR')} de ${current.length.toLocaleString('pt-BR')}. Limite vertical ±${number(scale.limit, 7)}.${clipping}`;
    $('barScaleNote').textContent = `Os eixos horizontal e vertical usam o mesmo fator de zoom. Em 1×, o limite vertical é ±${number(scale.limit * scale.zoom, 7)}. Ao ampliar, esse limite diminui; os valores originais são preservados. Marcas amarelas na borda indicam barras que continuam além do enquadramento.`;
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
    event = wheelPixels(event, svg);
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
    const clipPath = node('clipPath', { id: prefix + 'linePlotClip' });
    clipPath.append(node('rect', { x: left, y: top, width: plotWidth, height: plotHeight }));
    definitions.append(clipPath);
    // A cor muda em zero; as coordenadas e a escala do traçado permanecem iguais.
    const signGradient = node('linearGradient', {id:prefix+'lineSignColor',gradientUnits:'userSpaceOnUse',x1:0,x2:0,y1:top,y2:top+plotHeight});
    signGradient.append(node('stop',{offset:'50%','stop-color':'var(--blue)'}),node('stop',{offset:'50%','stop-color':'var(--celeste)'}));
    definitions.append(signGradient);
    svg.append(definitions);
    const plot = node('g', { 'clip-path': `url(#${prefix}linePlotClip)` });
    const path = node('path', { class: 'vector-line', stroke: `url(#${prefix}lineSignColor)`, d: values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ') });
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
    event = wheelPixels(event, svg);
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

  for(const kind of ['bar','line']) {
    const zoom=kind==='bar'?applyBarZoom:applyLineZoom, draw=kind==='bar'?drawBars:drawLine;
    $(kind+'Window').addEventListener('change',e=>zoom(current.length/Number(e.target.value)));
    $(kind+'Auto').addEventListener('click',kind==='bar'?applyAutomaticBarView:applyAutomaticLineView);
    $(kind+'Start').addEventListener('input',draw);
    $(kind+'Chart').addEventListener('wheel',kind==='bar'?handleBarWheel:handleLineWheel,{passive:false});
    const commit=kind==='bar'?commitBarZoom:commitLineZoom;
    $(kind+'ZoomInput').addEventListener('change',commit);
    $(kind+'ZoomInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();e.currentTarget.blur();}});
  }
  return {setVector(vector) {
    if(!Array.isArray(vector)||!vector.length||!vector.every(Number.isFinite)) throw Error('Vetor indisponível.');
    current=vector.slice(); barZoom=1; lineZoom=1;
    if(linePinnedIndex>=current.length) linePinnedIndex=null;
    if(barPinnedIndex>=current.length) barPinnedIndex=null;
    $('barStart').value=0; $('lineStart').value=0;
    refreshBarWindowOptions(current.length,Math.min(48,current.length));
    barZoom=current.length/Number($('barWindow').value);
    configureBarPan();refreshWindowOptions(current.length);configureLinePan();drawBars();drawLine();
  },automaticLine:applyAutomaticLineView};
 }
 root.LabVisualCharts=Object.freeze({create,mount});
})(window);
