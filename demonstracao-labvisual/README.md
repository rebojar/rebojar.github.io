# Demonstração da Bancada Visual · Qwen3.5-9B

Página estática com resultados reais de execuções registradas da torre visual. As entradas geométricas foram construídas para o ensaio; os vetores foram produzidos pelo encoder. A página não recebe arquivos nem executa inferência.

## As quatro guias

- **Uma imagem:** preparação, transparência, patches, antes/depois do merger, agregação, normalização, barras, linha, notas e exportações.
- **Lote:** coleção de 12 imagens, receita e fundo próprios, conferência, reunião das representações e exportações. O progresso corresponde à reunião dos vetores no navegador.
- **Vizinhos:** cinco resultados por estágio, estatísticas sobre todas as outras imagens, sobreposição, histórico, busca, notas e investigação da coordenada 3995.
- **Vídeo/GIF:** dois formatos, três cenários por formato, quadros preparados, pares temporais, receitas, barras, linha e exportações.

Vizinhos mantém a edição direta da receita usando agregados já registrados. A interface local 0.5 recebeu a mesma possibilidade; a versão já publicada no GitHub ainda é anterior. Lotes antigos oferecem somente as opções sustentadas pelos dados salvos. Ela não altera a receita original do conjunto.

## Origem e conferência

`proveniencia.json` registra checkpoint, hashes, parâmetros e arquivos das execuções. `conferencia.json` descreve os testes numéricos e seus limites. A extração registrada usou o [LabVisual no commit fa3cb54](https://github.com/rebojar/LabVisual/tree/fa3cb5439d22186ae324f605e70bf5986971849d).

`analysis_core.py` é a fonte canônica das fórmulas. `analysis-core.js` é gerado dela no projeto LabVisual; `analise.js` adapta os dados da demo sem implementar fórmulas. `core-manifest.json` permite conferir os hashes e `LICENSE-LabVisual.txt` acompanha esses componentes. `recursos.js` reúne leitura e exportação. `graficos.js` é usado tanto em imagem quanto em vídeo. Os controladores de apresentação ficam em `demo.js` e `demo-modos.js`; mudar cores e composição não deve alterar os valores.

Os arquivos de `assets/analise/` são somente saídas dos exemplos geométricos públicos. Não contêm pesos do modelo ou experimentos pessoais. Os NPZ completos preservam `antes_merger` e `depois_merger`, ainda por token. Os arquivos de dados JavaScript guardam agregados em FP32 anteriores à normalização.

## Exportações e notas

O acesso ao caderno no final da página abre o `Experimento_visual.ipynb` público para leitura. A execução das células continua no JupyterLab local, instalado com a bancada. Não há kernel Python embutido nesta demonstração.

Notas e conjuntos reunidos ficam na memória da página. Baixe os resultados antes de recarregar ou fechar a aba. Para preservar o contexto de uma matriz NPZ ou CSV, baixe também seu registro JSON: ele informa a receita e as condições. Essas exportações destinam-se à inspeção; não constituem um lote automaticamente importável pela versão indicada do LabVisual.

Uma leitura inicial dos tokens completos pode ser feita com NumPy:

```python
import numpy as np

with np.load("arquivo_tokens.npz", allow_pickle=False) as arquivo:
    tokens = arquivo["depois_merger"]
    media = tokens.mean(axis=0, dtype=np.float32)
    from analysis_core import normalize
    resultado = normalize(media.tolist(), 'l2', 32)
    vetor_l2 = np.asarray(resultado['vector'], dtype=np.float32)
    print(tokens.shape, vetor_l2.shape)
```

Esse exemplo demonstra somente média + L2. Máximo e mediana devem ser calculados sobre os tokens completos, nunca recuperados de uma média salva. Para seguir exatamente a metodologia e os casos de borda, use a fonte `analysis_core.py` que acompanha esta demo. A agregação continua usando os tokens completos, como em `analysis.aggregate`.

## Integração no portal

A rota atual é `/demonstracao-labvisual/`. Esta pasta depende de `../assets/labvisual-icon.png`, que já pertence ao portal. Integre somente a seleção revisada da demo, preservando a página inicial, o RSS, o sitemap e os demais arquivos do Rebojar. Não publique backups, registros de sessões locais ou caminhos particulares.

A bancada instalável conserva seus próprios termos, documentação e identidade de versão. A composição visual da demonstração pertence à apresentação editorial do Rebojar; esta revisão não altera os termos de distribuição dos repositórios.

O rodapé identifica explicitamente a licença do **código do LabVisual**, `AGPL-3.0-only`, e aponta para o texto publicado pelo projeto. Esse rótulo não estabelece por si só uma nova licença para o conjunto editorial do portal. A licença de componentes derivados deve seguir as condições aplicáveis às suas fontes.
