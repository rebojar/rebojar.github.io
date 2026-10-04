"""Fonte canônica das operações após a agregação dos tokens.

O navegador recebe código gerado deste arquivo por tools/build_web_core.py.
Não editar o JavaScript gerado. As primitivas da plataforma (float32, ordenação,
raiz e validação de números) têm equivalentes explícitos no gerador.
"""
import math
import struct

VERSION = '1.0.0'


# Primitivas de representação, sem fórmulas de análise.
def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def is_list(value):
    return isinstance(value, list)


def f32(value):
    try:
        return struct.unpack('<f', struct.pack('<f', value))[0]
    except OverflowError:
        return math.copysign(float('inf'), value)


def sqrt(value):
    return math.sqrt(value)


def ordered(values):
    return sorted(values)


def ordered_rows(rows):
    return sorted(rows, key=lambda row: (row['order'], row['index']))


def validate(vector):
    if not is_list(vector) or len(vector) == 0:
        raise ValueError('Vetor ausente ou vazio.')
    for value in vector:
        if not finite(value):
            raise ValueError('O vetor precisa conter somente números reais finitos.')


def compensated_sum(values):
    total = 0.0
    correction = 0.0
    for value in values:
        adjusted = value - correction
        updated = total + adjusted
        correction = (updated - total) - adjusted
        total = updated
    return total


def norm(vector, method):
    validate(vector)
    scale = 0.0
    for value in vector:
        scale = max(scale, abs(value))
    if method == 'linf':
        return scale
    if method != 'l1' and method != 'l2':
        raise ValueError('Norma desconhecida.')
    if scale == 0:
        return 0.0
    terms = []
    for value in vector:
        part = abs(value) / scale
        if method == 'l2':
            part = part * part
        terms.append(part)
    total = compensated_sum(terms)
    if method == 'l2':
        total = sqrt(total)
    return scale * total


def normalize(vector, method='l2', precision=32):
    validate(vector)
    if precision != 32 and precision != 64:
        raise ValueError('Precisão não suportada.')
    if method == 'none':
        return {'vector': vector[:], 'divisor': 1.0}
    divisor = norm(vector, method)
    if not finite(divisor) or divisor == 0:
        raise ValueError('Vetor nulo ou norma fora do intervalo finito: normalização indisponível.')
    # Mantém a convenção FP32 da bancada. A conversão do divisor agora é
    # explícita, sem depender das regras de promoção da versão do NumPy.
    scalar = divisor
    if precision == 32:
        scalar = f32(divisor)
    if not finite(scalar) or scalar == 0:
        raise ValueError('Norma não representável na precisão escolhida.')
    result = []
    for value in vector:
        item = value / scalar
        if precision == 32:
            item = f32(item)
        if not finite(item):
            raise ValueError('A normalização produziu um valor não finito.')
        result.append(item)
    return {'vector': result, 'divisor': divisor}


def compare(left, right, metric='cosine'):
    validate(left)
    validate(right)
    if len(left) != len(right):
        raise ValueError('Compare vetores do mesmo estágio e dimensão.')
    terms = []
    if metric == 'euclidean':
        for index in range(len(left)):
            terms.append(left[index] - right[index])
        result = norm(terms, 'l2')
    elif metric == 'dot':
        for index in range(len(left)):
            terms.append(left[index] * right[index])
        result = compensated_sum(terms)
    elif metric == 'cosine':
        left_norm = norm(left, 'l2')
        right_norm = norm(right, 'l2')
        if left_norm == 0 or right_norm == 0 or not finite(left_norm) or not finite(right_norm):
            raise ValueError('Cosseno indefinido para vetor nulo ou norma não finita.')
        for index in range(len(left)):
            terms.append((left[index] / left_norm) * (right[index] / right_norm))
        result = max(-1.0, min(1.0, compensated_sum(terms)))
    else:
        raise ValueError('Comparação desconhecida.')
    if not finite(result):
        raise ValueError('A comparação produziu um valor não finito.')
    return result


def statistics(values):
    if len(values) == 0:
        return None
    validate(values)
    items = ordered(values)
    count = len(items)
    middle = count // 2
    median = items[middle]
    if count % 2 == 0:
        median = items[middle - 1] / 2 + items[middle] / 2
    return {'min': items[0], 'median': median, 'max': items[count - 1], 'count': count}


def ranking(vectors, index, metric='cosine', count=5):
    if not is_list(vectors) or len(vectors) == 0 or not finite(index) or index < 0 or index >= len(vectors) or index % 1 != 0:
        raise ValueError('Conjunto ou índice inválido.')
    if not finite(count) or count < 0 or count % 1 != 0:
        raise ValueError('Quantidade de vizinhos inválida.')
    if metric != 'cosine' and metric != 'dot' and metric != 'euclidean':
        raise ValueError('Comparação desconhecida.')
    rows = []
    scores = []
    for position in range(len(vectors)):
        validate(vectors[position])
        if len(vectors[position]) != len(vectors[index]):
            raise ValueError('Dimensões diferentes no mesmo estágio.')
        if metric == 'cosine' and norm(vectors[position], 'l2') == 0:
            raise ValueError('Este conjunto contém vetor nulo; cosseno indisponível.')
        if position != index:
            score = compare(vectors[index], vectors[position], metric)
            order = -score
            if metric == 'euclidean':
                order = score
            rows.append({'index': position, 'score': score, 'similarity': score, 'order': order})
            scores.append(score)
    sorted_rows = ordered_rows(rows)
    neighbors = []
    for position in range(min(count, len(sorted_rows))):
        row = sorted_rows[position]
        neighbors.append({'index': row['index'], 'score': row['score'], 'similarity': row['similarity']})
    return {'neighbors': neighbors, 'statistics': statistics(scores)}


def squared_share(vector, coordinate):
    validate(vector)
    if coordinate < 0 or coordinate >= len(vector) or coordinate % 1 != 0:
        raise ValueError('Coordenada inválida.')
    length = norm(vector, 'l2')
    if length == 0:
        return 0.0
    if not finite(length):
        raise ValueError('Norma não finita.')
    value = vector[coordinate] / length
    return value * value
