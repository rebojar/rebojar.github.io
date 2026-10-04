/* GERADO de analysis_core.py · SHA-256 2fa9e7a32831dbf54d0fef94f6f3b059481139ab989e8cbdc9bd26503612e5ab · NÃO EDITAR. */
(function(root) {
'use strict';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const is_list = Array.isArray;
const f32 = Math.fround;
const sqrt = Math.sqrt;
const ordered = values => values.slice().sort((a,b)=>a-b);
const ordered_rows = rows => rows.slice().sort((a,b)=>(a.order-b.order)||(a.index-b.index));
function validate(vector) {
  let value;
  if (((!is_list(vector)) || ((vector).length === 0))) {
    throw new Error("Vetor ausente ou vazio.");
  }
  for (value of vector) {
    if ((!finite(value))) {
      throw new Error("O vetor precisa conter somente números reais finitos.");
    }
  }
}

function compensated_sum(values) {
  let adjusted, correction, total, updated, value;
  total = 0.0;
  correction = 0.0;
  for (value of values) {
    adjusted = (value - correction);
    updated = (total + adjusted);
    correction = ((updated - total) - adjusted);
    total = updated;
  }
  return total;
}

function norm(vector, method) {
  let part, scale, terms, total, value;
  validate(vector);
  scale = 0.0;
  for (value of vector) {
    scale = Math.max(scale, Math.abs(value));
  }
  if ((method === "linf")) {
    return scale;
  }
  if (((method !== "l1") && (method !== "l2"))) {
    throw new Error("Norma desconhecida.");
  }
  if ((scale === 0)) {
    return 0.0;
  }
  terms = [];
  for (value of vector) {
    part = (Math.abs(value) / scale);
    if ((method === "l2")) {
      part = (part * part);
    }
    terms.push(part);
  }
  total = compensated_sum(terms);
  if ((method === "l2")) {
    total = sqrt(total);
  }
  return (scale * total);
}

function normalize(vector, method = "l2", precision = 32) {
  let divisor, item, result, scalar, value;
  validate(vector);
  if (((precision !== 32) && (precision !== 64))) {
    throw new Error("Precisão não suportada.");
  }
  if ((method === "none")) {
    return {"vector": vector.slice(0), "divisor": 1.0};
  }
  divisor = norm(vector, method);
  if (((!finite(divisor)) || (divisor === 0))) {
    throw new Error("Vetor nulo ou norma fora do intervalo finito: normalização indisponível.");
  }
  scalar = divisor;
  if ((precision === 32)) {
    scalar = f32(divisor);
  }
  if (((!finite(scalar)) || (scalar === 0))) {
    throw new Error("Norma não representável na precisão escolhida.");
  }
  result = [];
  for (value of vector) {
    item = (value / scalar);
    if ((precision === 32)) {
      item = f32(item);
    }
    if ((!finite(item))) {
      throw new Error("A normalização produziu um valor não finito.");
    }
    result.push(item);
  }
  return {"vector": result, "divisor": divisor};
}

function compare(left, right, metric = "cosine") {
  let index, left_norm, result, right_norm, terms;
  validate(left);
  validate(right);
  if (((left).length !== (right).length)) {
    throw new Error("Compare vetores do mesmo estágio e dimensão.");
  }
  terms = [];
  if ((metric === "euclidean")) {
    for (index = 0; index < (left).length; index++) {
      terms.push((left[index] - right[index]));
    }
    result = norm(terms, "l2");
  } else {
    if ((metric === "dot")) {
      for (index = 0; index < (left).length; index++) {
        terms.push((left[index] * right[index]));
      }
      result = compensated_sum(terms);
    } else {
      if ((metric === "cosine")) {
        left_norm = norm(left, "l2");
        right_norm = norm(right, "l2");
        if (((left_norm === 0) || (right_norm === 0) || (!finite(left_norm)) || (!finite(right_norm)))) {
          throw new Error("Cosseno indefinido para vetor nulo ou norma não finita.");
        }
        for (index = 0; index < (left).length; index++) {
          terms.push(((left[index] / left_norm) * (right[index] / right_norm)));
        }
        result = Math.max((-1.0), Math.min(1.0, compensated_sum(terms)));
      } else {
        throw new Error("Comparação desconhecida.");
      }
    }
  }
  if ((!finite(result))) {
    throw new Error("A comparação produziu um valor não finito.");
  }
  return result;
}

function statistics(values) {
  let count, items, median, middle;
  if (((values).length === 0)) {
    return null;
  }
  validate(values);
  items = ordered(values);
  count = (items).length;
  middle = Math.floor((count / 2));
  median = items[middle];
  if (((count % 2) === 0)) {
    median = ((items[(middle - 1)] / 2) + (items[middle] / 2));
  }
  return {"min": items[0], "median": median, "max": items[(count - 1)], "count": count};
}

function ranking(vectors, index, metric = "cosine", count = 5) {
  let neighbors, order, position, row, rows, score, scores, sorted_rows;
  if (((!is_list(vectors)) || ((vectors).length === 0) || (!finite(index)) || (index < 0) || (index >= (vectors).length) || ((index % 1) !== 0))) {
    throw new Error("Conjunto ou índice inválido.");
  }
  if (((!finite(count)) || (count < 0) || ((count % 1) !== 0))) {
    throw new Error("Quantidade de vizinhos inválida.");
  }
  if (((metric !== "cosine") && (metric !== "dot") && (metric !== "euclidean"))) {
    throw new Error("Comparação desconhecida.");
  }
  rows = [];
  scores = [];
  for (position = 0; position < (vectors).length; position++) {
    validate(vectors[position]);
    if (((vectors[position]).length !== (vectors[index]).length)) {
      throw new Error("Dimensões diferentes no mesmo estágio.");
    }
    if (((metric === "cosine") && (norm(vectors[position], "l2") === 0))) {
      throw new Error("Este conjunto contém vetor nulo; cosseno indisponível.");
    }
    if ((position !== index)) {
      score = compare(vectors[index], vectors[position], metric);
      order = (-score);
      if ((metric === "euclidean")) {
        order = score;
      }
      rows.push({"index": position, "score": score, "similarity": score, "order": order});
      scores.push(score);
    }
  }
  sorted_rows = ordered_rows(rows);
  neighbors = [];
  for (position = 0; position < Math.min(count, (sorted_rows).length); position++) {
    row = sorted_rows[position];
    neighbors.push({"index": row["index"], "score": row["score"], "similarity": row["similarity"]});
  }
  return {"neighbors": neighbors, "statistics": statistics(scores)};
}

function squared_share(vector, coordinate) {
  let length, value;
  validate(vector);
  if (((coordinate < 0) || (coordinate >= (vector).length) || ((coordinate % 1) !== 0))) {
    throw new Error("Coordenada inválida.");
  }
  length = norm(vector, "l2");
  if ((length === 0)) {
    return 0.0;
  }
  if ((!finite(length))) {
    throw new Error("Norma não finita.");
  }
  value = (vector[coordinate] / length);
  return (value * value);
}
const api = Object.freeze({version: "1.0.0", validate, compensated_sum, norm, normalize, compare, statistics, ranking, squared_share});
root.LabVisualMath=api;
if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window==='undefined'?globalThis:window);
