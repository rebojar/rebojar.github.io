/* Leitura dos agregados reais da bancada, independente da apresentação. */
(function (root) {
  'use strict';
  function valid(vector) {
    if (!Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) {
      throw new Error('Vetor ausente ou não finito.');
    }
  }
  function normalize(vector, method) {
    valid(vector);
    if (method === 'none') return { vector: vector.slice(), divisor: 1 };
    let divisor;
    if (method === 'l1') divisor = vector.reduce((s, v) => s + Math.abs(v), 0);
    else if (method === 'linf') divisor = Math.max(...vector.map(Math.abs));
    else if (method === 'l2') divisor = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    else throw new Error('Normalização desconhecida.');
    if (!Number.isFinite(divisor) || divisor === 0) throw new Error('Vetor nulo: normalização indisponível.');
    // O NumPy da execução validada divide arrays FP32 pelo escalar convertido a FP32.
    // O divisor exibido permanece em precisão dupla, como em analysis.py.
    const scalar = Math.fround(divisor);
    return { vector: vector.map(v => Math.fround(v / scalar)), divisor };
  }
  function compare(left, right, metric) {
    valid(left); valid(right);
    if (left.length !== right.length) throw new Error('Compare vetores do mesmo estágio.');
    if (metric === 'euclidean') return Math.sqrt(left.reduce((s, v, i) => s + (v - right[i]) ** 2, 0));
    if (metric === 'dot') return left.reduce((s, v, i) => s + v * right[i], 0);
    if (metric !== 'cosine') throw new Error('Comparação desconhecida.');
    const nl = Math.sqrt(left.reduce((s, v) => s + v * v, 0));
    const nr = Math.sqrt(right.reduce((s, v) => s + v * v, 0));
    if (!nl || !nr) throw new Error('Cosseno indefinido para vetor nulo.');
    return Math.max(-1, Math.min(1, left.reduce((s, v, i) => s + (v / nl) * (right[i] / nr), 0)));
  }
  function nearest(images, anchorIndex, stage, recipe, count = 5) {
    const vectors = images.map(item => normalize(item.vectors[stage][recipe.pooling], recipe.normalization).vector);
    return images.map((_, index) => ({ index,
      score: index === anchorIndex ? null : compare(vectors[anchorIndex], vectors[index], recipe.metric) }))
      .filter(row => row.index !== anchorIndex)
      .sort((a, b) => (recipe.metric === 'euclidean' ? a.score - b.score : b.score - a.score) || a.index - b.index)
      .slice(0, count);
  }
  root.LabDemoAnalysis = Object.freeze({ normalize, compare, nearest });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LabDemoAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
