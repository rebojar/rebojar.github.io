(() => {
  if (window.RebojarTraducao) return;

  const CHAVE_IDIOMA = "rebojar-idioma-v1";
  const IDIOMA_ORIGINAL = "pt";
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
      .painel-traducao-site{position:absolute;top:calc(100% + .6rem);right:0;width:min(18rem,calc(100vw - 1.5rem));padding:.85rem;border:1px solid #315265;border-radius:12px;color:#f4efdf;background:#0d2638f2;box-shadow:0 14px 34px #02080d9c,inset 0 1px #ffffff17;backdrop-filter:blur(10px)}
      .painel-traducao-site[hidden]{display:none}
      .painel-traducao-site label{display:block;margin:0 0 .45rem;font:700 .78rem/1.2 "Segoe UI",system-ui,sans-serif}
      .painel-traducao-site select{display:block;width:100%;min-height:2.45rem;padding:.45rem .65rem;border:1px solid #52758c;border-radius:8px;color:#f4efdf;background:#112f44;font:600 .88rem/1.2 "Segoe UI",system-ui,sans-serif;cursor:pointer}
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
      <p class="estado-traducao-site" aria-live="polite">A tradução acontece no próprio navegador quando ele oferece esse recurso.</p>
    `;

    const linkAudio = grupoSom.querySelector(".estudio-som-site");
    grupoSom.insertBefore(botao, linkAudio || null);
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

      if (!("Translator" in window)) {
        estado.textContent = "Este navegador ainda não oferece tradução local. No momento, ela funciona no Chrome para computador.";
        seletor.value = idiomaAtivo;
        seletor.disabled = false;
        atualizarBotao();
        return;
      }

      try {
        const disponibilidade = await Translator.availability({ sourceLanguage: IDIOMA_ORIGINAL, targetLanguage: destino });
        if (disponibilidade === "unavailable") throw new Error("par-indisponivel");
        estado.textContent = disponibilidade === "available" ? "Traduzindo…" : "Preparando o idioma no navegador…";
        tradutorAtual?.destroy?.();
        tradutorAtual = await Translator.create({
          sourceLanguage: IDIOMA_ORIGINAL,
          targetLanguage: destino,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", evento => {
              if (minhaRevisao === revisao) estado.textContent = `Preparando o idioma… ${Math.round(evento.loaded * 100)}%`;
            });
          }
        });

        const textos = coletarTextos(document);
        const total = textos.length;
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

        idiomaAtivo = destino;
        document.documentElement.lang = destino;
        sessionStorage.setItem(CHAVE_IDIOMA, destino);
        estado.textContent = "Tradução aplicada localmente. Textos editáveis foram preservados.";
      } catch {
        restaurarPortugues();
        estado.textContent = "Este idioma não pôde ser preparado neste navegador.";
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
