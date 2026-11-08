(() => {
  if (window.RebojarTraducao) return;

  const CHAVE_IDIOMA = "rebojar-idioma-v1";
  const IDIOMA_ORIGINAL = "pt";
  /* O fallback online só recebe textos públicos já filtrados por elementoIgnorado.
     Valores de campos e conteúdo editável nunca são enviados para tradução. */
  const SERVICO_TRADUCAO = "https://translate.googleapis.com/translate_a/single";
  const codigosServico = { zh: "zh-CN", "zh-Hant": "zh-TW" };
  const idiomas = [
    ["pt", "Português"],
    ["en", "English"],
    ["es", "Español"],
    ["fr", "Français"],
    ["de", "Deutsch"],
    ["it", "Italiano"],
    ["nl", "Nederlands"],
    ["pl", "Polski"],
    ["uk", "Українська"],
    ["ru", "Русский"],
    ["ar", "العربية"],
    ["hi", "हिन्दी"],
    ["bn", "বাংলা"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["zh", "简体中文"],
    ["zh-Hant", "繁體中文"],
    ["id", "Bahasa Indonesia"],
    ["tr", "Türkçe"],
    ["vi", "Tiếng Việt"]
  ];

  const originais = new WeakMap();
  const textosConhecidos = new Set();
  const traducoesOnline = new Map();
  let idiomaAtivo = IDIOMA_ORIGINAL;
  let revisao = 0;
  let tradutorAtual;

  function elementoIgnorado(elemento) {
    if (!elemento) return true;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "OPTION", "CODE", "PRE"].includes(elemento.tagName)) return true;
    /* Memórias escritas pela pessoa no Caderno nunca entram na tradução,
       mesmo se um campo editável passar a aparecer dentro do portal no futuro. */
    if (elemento.closest?.("[data-rebojar-nao-traduzir], input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])")) return true;
    return false;
  }

  function textoTraduzivel(no) {
    const conteudo = no.nodeValue || "";
    return /[A-Za-zÀ-ÿ]/u.test(conteudo) && !elementoIgnorado(no.parentElement);
  }

  function coletarTextos(raiz, visitadas = new Set()) {
    if (!raiz || visitadas.has(raiz)) return [];
    visitadas.add(raiz);
    const documento = raiz.nodeType === Node.DOCUMENT_NODE ? raiz : raiz.ownerDocument;
    if (!documento) return [];

    const encontrados = [];
    const filtro = documento.defaultView?.NodeFilter || NodeFilter;
    const caminhante = documento.createTreeWalker(raiz, filtro.SHOW_TEXT, {
      acceptNode: no => textoTraduzivel(no) ? filtro.FILTER_ACCEPT : filtro.FILTER_REJECT
    });
    let no;
    while ((no = caminhante.nextNode())) {
      if (!originais.has(no)) originais.set(no, no.nodeValue);
      textosConhecidos.add(no);
      encontrados.push(no);
    }

    raiz.querySelectorAll?.("*").forEach(elemento => {
      if (elemento.shadowRoot) encontrados.push(...coletarTextos(elemento.shadowRoot, visitadas));
      if (elemento.tagName === "IFRAME") {
        try {
          if (elemento.contentDocument) encontrados.push(...coletarTextos(elemento.contentDocument, visitadas));
        } catch {}
      }
    });
    return encontrados;
  }

  function restaurarPortugues() {
    revisao += 1;
    tradutorAtual?.destroy?.();
    tradutorAtual = undefined;
    textosConhecidos.forEach(no => {
      if (no.isConnected && originais.has(no)) no.nodeValue = originais.get(no);
    });
    idiomaAtivo = IDIOMA_ORIGINAL;
    document.documentElement.lang = "pt-BR";
    sessionStorage.setItem(CHAVE_IDIOMA, IDIOMA_ORIGINAL);
  }

  function preservarEspacos(original, traduzido) {
    const inicio = original.match(/^\s*/)?.[0] || "";
    const fim = original.match(/\s*$/)?.[0] || "";
    return `${inicio}${traduzido.trim()}${fim}`;
  }

  function dividirTexto(texto, limite = 1200) {
    const partes = [];
    let restante = texto;
    while (restante.length > limite) {
      let corte = restante.lastIndexOf(" ", limite);
      if (corte < limite * .55) corte = limite;
      partes.push(restante.slice(0, corte));
      restante = restante.slice(corte).trimStart();
    }
    if (restante) partes.push(restante);
    return partes;
  }

  async function traduzirTrechoOnline(texto, destino) {
    const idiomaDestino = codigosServico[destino] || destino;
    const chave = `${idiomaDestino}\u0000${texto}`;
    if (traducoesOnline.has(chave)) return traducoesOnline.get(chave);

    const url = new URL(SERVICO_TRADUCAO);
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", IDIOMA_ORIGINAL);
    url.searchParams.set("tl", idiomaDestino);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", texto);
    const resposta = await fetch(url, {
      credentials: "omit",
      mode: "cors",
      referrerPolicy: "no-referrer"
    });
    if (!resposta.ok) throw new Error(`traducao-online-${resposta.status}`);
    const dados = await resposta.json();
    const traducao = Array.isArray(dados?.[0])
      ? dados[0].map(segmento => segmento?.[0] || "").join("")
      : "";
    if (!traducao.trim()) throw new Error("traducao-online-vazia");
    traducoesOnline.set(chave, traducao);
    return traducao;
  }

  async function traduzirOnline(texto, destino) {
    const partes = dividirTexto(texto);
    const traduzidas = [];
    for (const parte of partes) traduzidas.push(await traduzirTrechoOnline(parte, destino));
    return traduzidas.join(" ");
  }

  function agruparTextos(textos, limite = 1800) {
    const grupos = [];
    let grupo = [];
    let tamanho = 0;
    textos.forEach((texto, indice) => {
      const adicional = texto.length + 28;
      if (grupo.length && tamanho + adicional > limite) {
        grupos.push(grupo);
        grupo = [];
        tamanho = 0;
      }
      grupo.push({ texto, indice });
      tamanho += adicional;
    });
    if (grupo.length) grupos.push(grupo);
    return grupos;
  }

  async function traduzirLoteOnline(textos, destino, progresso) {
    const resultado = new Array(textos.length);
    const grupos = agruparTextos(textos);
    let concluidos = 0;

    for (const grupo of grupos) {
      const corpo = grupo.map((item, indice) => indice
        ? `[[[REBOJAR_${indice - 1}]]]\n${item.texto}`
        : item.texto).join("\n");
      const traducaoAgrupada = await traduzirTrechoOnline(corpo, destino);
      let partes = traducaoAgrupada.split(/\s*\[\[\[REBOJAR_\d+\]\]\]\s*/u);
      if (partes.length !== grupo.length) {
        partes = [];
        for (const item of grupo) partes.push(await traduzirOnline(item.texto, destino));
      }
      grupo.forEach((item, indice) => { resultado[item.indice] = partes[indice]; });
      concluidos += grupo.length;
      progresso?.(concluidos, textos.length);
    }
    return resultado;
  }

  function montarControles() {
    const grupoSom = document.querySelector(".controles-som-site");
    if (!grupoSom || grupoSom.querySelector(".controle-traducao-site")) return false;

    const estilo = document.createElement("style");
    estilo.textContent = `
      .controle-traducao-site{display:grid;place-items:center;width:34px;height:34px;padding:0;flex:0 0 auto;border:1px solid #f4efdf24;border-radius:50%;color:#f4efdfb8;background:#69766e73;box-shadow:inset 0 0 0 1px #ffffff0d,0 2px 5px #11273c24;opacity:.72;cursor:pointer;transition:color .18s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease,opacity .18s ease,transform .18s ease}
      .controle-traducao-site:hover{color:#f4efdf;background:#78857d9c;border-color:#f4efdf52;opacity:.9}
      .controle-traducao-site[aria-expanded="true"],.controle-traducao-site.traducao-ativa{color:#f2992e;background:#0b2133;border-color:#f2992e88;box-shadow:inset 0 4px 8px #0008,0 1px 2px #11273c38;opacity:1;transform:translateY(2px)}
      .controle-traducao-site:focus-visible,.painel-traducao-site select:focus-visible{outline:3px solid #e8d73a;outline-offset:3px}
      .traducao-icone{font:700 .72rem/1 Georgia,"Times New Roman",serif;letter-spacing:-.1em;transform:translateX(-.04em)}
      .painel-traducao-site{position:absolute;top:calc(100% + .6rem);right:0;width:min(18rem,calc(100vw - 1.5rem));max-height:calc(100dvh - 5rem);padding:.85rem;overflow:auto;border:1px solid #315265;border-radius:12px;color:#f4efdf;background:#0d2638f2;box-shadow:0 14px 34px #02080d9c,inset 0 1px #ffffff17;backdrop-filter:blur(10px);scrollbar-width:thin;scrollbar-color:#f2992e transparent}
      .painel-traducao-site::-webkit-scrollbar,.painel-traducao-site select::-webkit-scrollbar{width:2px;height:2px;background:transparent}
      .painel-traducao-site::-webkit-scrollbar-track,.painel-traducao-site select::-webkit-scrollbar-track{background:transparent}
      .painel-traducao-site::-webkit-scrollbar-thumb,.painel-traducao-site select::-webkit-scrollbar-thumb{border:0;border-radius:999px;background:#f2992e}
      .painel-traducao-site[hidden]{display:none}
      .painel-traducao-site label{display:block;margin:0 0 .45rem;font:700 .78rem/1.2 "Segoe UI",system-ui,sans-serif}
      .painel-traducao-site select{display:block;width:100%;min-height:2.45rem;padding:.45rem .65rem;border:1px solid #52758c;border-radius:8px;color:#f4efdf;background:#112f44;font:600 .88rem/1.2 "Segoe UI",system-ui,sans-serif;cursor:pointer;scrollbar-width:thin;scrollbar-color:#f2992e transparent}
      .estado-traducao-site{min-height:2.5em;margin:.55rem 0 0;color:#c2cfdf;font:500 .7rem/1.35 "Segoe UI",system-ui,sans-serif}
      @media(max-width:560px){.controle-traducao-site{width:38px;height:38px}.traducao-icone{font-size:.8rem}.painel-traducao-site{top:0;right:auto;left:calc(100% + .55rem);width:min(17rem,calc(100vw - 5.5rem))}}
    `;
    document.head.append(estilo);

    const botao = document.createElement("button");
    botao.className = "controle-traducao-site";
    botao.type = "button";
    botao.setAttribute("aria-expanded", "false");
    botao.setAttribute("aria-haspopup", "dialog");
    botao.setAttribute("aria-label", "Escolher idioma");
    botao.title = "Traduzir o Rebojar";
    botao.innerHTML = '<span class="traducao-icone" aria-hidden="true">文A</span>';

    const painel = document.createElement("div");
    painel.className = "painel-traducao-site";
    painel.hidden = true;
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-label", "Tradução do Rebojar");
    painel.setAttribute("data-rebojar-nao-traduzir", "");
    painel.innerHTML = `
      <label for="idioma-rebojar">Idioma do portal</label>
      <select id="idioma-rebojar">${idiomas.map(([codigo, nome]) => `<option value="${codigo}">${nome}</option>`).join("")}</select>
      <p class="estado-traducao-site" aria-live="polite">A tradução usa o recurso local do navegador quando disponível e um serviço online nos demais.</p>
    `;

    const botaoSom = grupoSom.querySelector(".controle-som-site");
    grupoSom.insertBefore(botao, botaoSom || grupoSom.firstChild);
    grupoSom.append(painel);
    const seletor = painel.querySelector("select");
    const estado = painel.querySelector(".estado-traducao-site");

    const atualizarBotao = () => {
      const aberto = !painel.hidden;
      botao.setAttribute("aria-expanded", String(aberto));
      botao.classList.toggle("traducao-ativa", idiomaAtivo !== IDIOMA_ORIGINAL);
    };
    const fechar = () => {
      painel.hidden = true;
      atualizarBotao();
    };

    async function aplicarIdioma(destino) {
      const minhaRevisao = ++revisao;
      seletor.disabled = true;
      if (destino === IDIOMA_ORIGINAL) {
        restaurarPortugues();
        estado.textContent = "Texto original restaurado.";
        seletor.disabled = false;
        atualizarBotao();
        return;
      }

      try {
        tradutorAtual?.destroy?.();
        tradutorAtual = undefined;
        let modo = "online";

        if ("Translator" in window) {
          try {
            const disponibilidade = await window.Translator.availability({ sourceLanguage: IDIOMA_ORIGINAL, targetLanguage: destino });
            if (disponibilidade !== "unavailable") {
              estado.textContent = disponibilidade === "available" ? "Traduzindo…" : "Preparando o idioma no navegador…";
              tradutorAtual = await window.Translator.create({
                sourceLanguage: IDIOMA_ORIGINAL,
                targetLanguage: destino,
                monitor(monitor) {
                  monitor.addEventListener("downloadprogress", evento => {
                    if (minhaRevisao === revisao) estado.textContent = `Preparando o idioma… ${Math.round(evento.loaded * 100)}%`;
                  });
                }
              });
              modo = "local";
            }
          } catch {
            tradutorAtual?.destroy?.();
            tradutorAtual = undefined;
          }
        }

        if (!tradutorAtual) {
          estado.textContent = "Traduzindo online…";
          tradutorAtual = {
            translate: texto => traduzirOnline(texto, destino),
            translateBatch: (textos, progresso) => traduzirLoteOnline(textos, destino, progresso),
            destroy() {}
          };
        }

        const textos = coletarTextos(document);
        const total = textos.length;
        if (tradutorAtual.translateBatch) {
          const entradas = textos.map(no => (originais.get(no) || "").trim());
          const traducoes = await tradutorAtual.translateBatch(entradas, (concluidos, quantidade) => {
            if (minhaRevisao === revisao) estado.textContent = `Traduzindo online… ${Math.round(concluidos / quantidade * 100)}%`;
          });
          if (minhaRevisao !== revisao) return;
          textos.forEach((no, indice) => {
            const original = originais.get(no);
            if (no.isConnected && original && traducoes[indice]) no.nodeValue = preservarEspacos(original, traducoes[indice]);
          });
        } else {
          for (let indice = 0; indice < total; indice += 1) {
            if (minhaRevisao !== revisao) return;
            const no = textos[indice];
            const original = originais.get(no);
            if (!no.isConnected || !original) continue;
            const traducao = await tradutorAtual.translate(original.trim());
            if (minhaRevisao !== revisao) return;
            no.nodeValue = preservarEspacos(original, traducao);
            if (indice % 8 === 0) estado.textContent = `Traduzindo… ${Math.min(100, Math.round((indice + 1) / total * 100))}%`;
          }
        }

        idiomaAtivo = destino;
        document.documentElement.lang = destino;
        sessionStorage.setItem(CHAVE_IDIOMA, destino);
        estado.textContent = modo === "local"
          ? "Tradução aplicada localmente. Textos editáveis foram preservados."
          : "Tradução online aplicada. Textos editáveis foram preservados.";
      } catch {
        restaurarPortugues();
        estado.textContent = "Não foi possível traduzir agora. Confira a conexão e tente novamente.";
        seletor.value = idiomaAtivo;
      } finally {
        seletor.disabled = false;
        atualizarBotao();
      }
    }

    botao.addEventListener("click", evento => {
      evento.stopPropagation();
      painel.hidden = !painel.hidden;
      atualizarBotao();
      if (!painel.hidden) seletor.focus();
    });
    painel.addEventListener("click", evento => evento.stopPropagation());
    seletor.addEventListener("change", () => aplicarIdioma(seletor.value));
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", evento => {
      if (evento.key === "Escape") fechar();
    });

    idiomaAtivo = sessionStorage.getItem(CHAVE_IDIOMA) || IDIOMA_ORIGINAL;
    if (!idiomas.some(([codigo]) => codigo === idiomaAtivo)) idiomaAtivo = IDIOMA_ORIGINAL;
    seletor.value = idiomaAtivo;
    atualizarBotao();
    if (idiomaAtivo !== IDIOMA_ORIGINAL) aplicarIdioma(idiomaAtivo);
    return true;
  }

  function iniciar() {
    if (montarControles()) return;
    const observador = new MutationObserver(() => {
      if (montarControles()) observador.disconnect();
    });
    observador.observe(document.body, { childList: true, subtree: true });
  }

  window.RebojarTraducao = {
    get idioma() { return idiomaAtivo; },
    restaurarPortugues
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
})();
