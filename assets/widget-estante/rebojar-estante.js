const modelo = document.createElement("template");

modelo.innerHTML = `
  <style>
    :host {
      --estante-indigo: #11273c;
      --estante-verde: #0d2e1a;
      --estante-papel: #f4efdf;
      --estante-laranja: #f2992e;
      --estante-azul: #2eaee8;
      --madeira-clara: #264d69;
      --madeira-media: #173a55;
      --madeira-escura: #081d2e;
      display: block;
      min-width: 250px;
      height: var(--estante-altura, clamp(300px, min(62vw, calc(100dvh - 155px)), 600px));
      contain: layout paint;
      color: var(--estante-papel);
      font-family: "Segoe UI", system-ui, sans-serif;
    }

    * { box-sizing: border-box; }

    .estante {
      position: relative;
      width: 100%;
      height: calc(100% - 20px);
      margin-top: 20px;
      min-height: 0;
      padding: clamp(46px, 8dvh, 82px) clamp(42px, 7vw, 76px) clamp(48px, 9dvh, 88px);
      overflow: visible;
      border: 1px solid #061725;
      border-radius: 5px 5px 3px 3px;
      background:
        repeating-linear-gradient(2deg, transparent 0 15px, #e7f2f608 16px, transparent 18px 31px),
        repeating-linear-gradient(91deg, #ffffff05 0 1px, transparent 2px 11px),
        linear-gradient(100deg, var(--madeira-escura), var(--madeira-clara) 17%, var(--madeira-media) 48%, #102f48 78%, #071a2a);
      box-shadow:
        0 24px 45px #11273c35,
        0 5px 0 #061522,
        inset 0 1px #ffffff24,
        inset 16px 0 22px #020a125c,
        inset -16px 0 22px #020a125c;
      isolation: isolate;
    }

    .estante::before {
      content: "";
      position: absolute;
      top: 12px;
      left: 14px;
      right: 14px;
      z-index: 6;
      height: clamp(30px, 5vw, 42px);
      border: 1px solid #061827;
      border-radius: 3px 3px 1px 1px;
      background:
        repeating-linear-gradient(3deg, transparent 0 8px, #ffffff0b 9px, transparent 10px 17px),
        linear-gradient(180deg, #315a76, #1a405c 43%, #0a2336 47%, #1d435e 100%);
      box-shadow:
        -9px -5px 0 -4px #315775,
        9px -5px 0 -4px #315775,
        0 8px 0 -3px #071a29,
        0 12px 12px #02091199,
        inset 0 1px #ffffff2b;
      pointer-events: none;
    }

    .estante::after {
      content: "";
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 13px;
      z-index: 6;
      height: clamp(31px, 5vw, 43px);
      border: 1px solid #061725;
      border-radius: 1px 1px 4px 4px;
      background:
        repeating-linear-gradient(-2deg, transparent 0 9px, #ffffff09 10px, transparent 11px 20px),
        linear-gradient(#234d69, #0b2a40 54%, #061827 57%, #173b55);
      box-shadow: 0 7px 0 -3px #061522, 0 11px 15px #0209118f, inset 0 1px #ffffff26;
      pointer-events: none;
    }

    .placa {
      position: absolute;
      top: -18px;
      left: 50%;
      z-index: 8;
      transform: translateX(-50%);
      display: flex;
      align-items: baseline;
      gap: 9px;
      padding: 6px 15px 7px;
      border: 1px solid #f2992e70;
      border-radius: 2px;
      color: #f7efe0;
      background: linear-gradient(#102d43, #071c2d);
      box-shadow: 0 4px 8px #020b1399, inset 0 1px #ffffff17;
      white-space: nowrap;
    }

    .placa strong { font: italic 1.05rem/1 Georgia, serif; }
    .placa span { font-size: .56rem; letter-spacing: .23em; text-transform: uppercase; }

    .nicho {
      position: relative;
      z-index: 7;
      height: 100%;
      min-height: 0;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: clamp(5px, 1vw, 10px);
      padding: clamp(30px, 5vw, 52px) clamp(18px, 4vw, 48px) 28px;
      overflow: visible;
      border: 3px solid #061725;
      border-bottom: 0;
      border-radius: 1px 1px 0 0;
      background:
        repeating-linear-gradient(0deg, transparent 0 37px, #8fb2c50b 38px, transparent 39px 76px),
        repeating-linear-gradient(90deg, #ffffff05 0 1px, transparent 2px 29px),
        radial-gradient(ellipse at 50% 115%, #2eaee81c, transparent 63%),
        linear-gradient(90deg, #061624, #0c2b40 13%, #12354d 50%, #0a273b 87%, #051521);
      box-shadow:
        inset 22px 0 29px #0008,
        inset -22px 0 29px #0008,
        inset 0 20px 30px #0009,
        0 -1px #63809938;
      perspective: 900px;
      perspective-origin: center 88%;
    }

    .nicho::before,
    .nicho::after {
      content: "";
      position: absolute;
      top: -8px;
      bottom: -31px;
      z-index: 5;
      width: clamp(25px, 4vw, 39px);
      border: 1px solid #061624;
      background:
        repeating-linear-gradient(2deg, transparent 0 11px, #ffffff0a 12px, transparent 13px 25px),
        linear-gradient(90deg, #0a263a, #28516d 32%, #173b56 66%, #071d2e);
      box-shadow: inset 1px 0 #ffffff17, inset -4px 0 #02091170, 3px 5px 9px #0209118f;
      pointer-events: none;
    }

    .nicho::before { left: calc(clamp(25px, 4vw, 39px) * -1 - 3px); }
    .nicho::after {
      right: calc(clamp(25px, 4vw, 39px) * -1 - 3px);
      transform: scaleX(-1);
    }

    .prateleira {
      position: absolute;
      left: -11px;
      right: -11px;
      bottom: -2px;
      z-index: 2;
      height: 30px;
      border: 1px solid #061725;
      border-radius: 1px 1px 3px 3px;
      background:
        repeating-linear-gradient(2deg, transparent 0 7px, #ffffff0b 8px, transparent 9px 15px),
        linear-gradient(#315b77, #1a405b 34%, #071b2b 38%, #173a54 100%);
      box-shadow: 0 9px 0 -3px #061827, 0 15px 17px #02080da8, inset 0 1px #ffffff2c;
    }

    .livro {
      --puxado-x: 0px;
      --puxado-y: 0px;
      --puxado-z: 0px;
      --puxado-angulo: 0deg;
      --puxado-inclinacao: 0deg;
      --puxado-giro: 0deg;
      --largura-capa: clamp(148px, 21vw, 190px);
      position: relative;
      z-index: 3;
      width: clamp(48px, 6.4vw, 64px);
      height: clamp(168px, min(33vw, 42dvh), 292px);
      flex: 0 0 auto;
      border: 0;
      padding: 0;
      color: inherit;
      background: transparent;
      text-decoration: none;
      transform-style: preserve-3d;
      transform-origin: 50% 100%;
      cursor: pointer;
      touch-action: none;
      user-select: none;
      -webkit-user-drag: none;
      -webkit-tap-highlight-color: transparent;
      transition: transform 320ms cubic-bezier(.2, .72, .2, 1), filter 240ms ease;
    }

    .livro-miolo,
    .livro-capa,
    .livro-frente,
    .livro-corte,
    .livro-topo,
    .livro-base {
      position: absolute;
      border-radius: 5px 5px 3px 3px;
      backface-visibility: hidden;
    }

    .livro-miolo {
      inset: 3px -3px 2px 4px;
      background: repeating-linear-gradient(90deg, #ded8c6 0 2px, #f8f3e5 2px 4px);
      box-shadow: 5px 6px 13px #0008;
    }

    .livro-capa {
      inset: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 11px 8px;
      overflow: hidden;
      border: 1px solid #f4efdf38;
      background:
        repeating-linear-gradient(90deg, #ffffff04 0 1px, transparent 1px 5px),
        var(--estante-indigo);
      box-shadow: inset 6px 0 #071b2d, inset 8px 0 #f2992e88;
      transition: transform 210ms ease, filter 210ms ease, box-shadow 210ms ease;
    }

    .livro-frente {
      top: 0;
      bottom: 0;
      left: calc(100% - 5px);
      width: var(--largura-capa);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 13px;
      padding: 18px;
      overflow: hidden;
      border: 1px solid #f4efdf4d;
      border-left: 7px solid #071b2d;
      border-radius: 2px 8px 8px 2px;
      color: var(--estante-papel);
      background:
        repeating-linear-gradient(90deg, #ffffff05 0 1px, transparent 1px 7px),
        linear-gradient(145deg, #1a3b57, #0e263b 68%, #071b2d);
      box-shadow: inset 0 0 0 1px #071827, inset 0 0 0 10px #ffffff08, 12px 13px 22px #02080d80;
      transform-origin: left center;
      transform: rotateY(90deg);
      backface-visibility: visible;
    }

    .livro-corte {
      inset: 5px 5px 4px 4px;
      border: 1px solid #bdb6a3;
      background:
        repeating-linear-gradient(90deg, #d5cfbd 0 2px, #faf6ea 2px 4px),
        #eee8d8;
      box-shadow: inset 0 0 8px #8c857455;
      transform: translateZ(calc(0px - var(--largura-capa)));
    }

    .livro-topo,
    .livro-base {
      left: 0;
      width: 100%;
      height: var(--largura-capa);
      border: 1px solid #071827;
      border-radius: 2px;
      background:
        linear-gradient(90deg, #0a2033 0 7px, transparent 7px calc(100% - 6px), #102d44 calc(100% - 6px)),
        repeating-linear-gradient(90deg, #d1cbb9 0 2px, #f7f2e4 2px 4px);
      box-shadow: inset 0 0 7px #79726055;
      backface-visibility: visible;
    }

    .livro-topo {
      top: 0;
      transform-origin: top center;
      transform: rotateX(-90deg);
    }

    .livro-base {
      bottom: 0;
      transform-origin: bottom center;
      transform: rotateX(90deg);
    }

    .livro-frente::before {
      content: "";
      position: absolute;
      inset: 12px;
      border: 1px solid #f2992e78;
      border-radius: 3px;
    }

    .livro-frente strong,
    .livro-frente small { position: relative; }

    .livro-frente strong { font: italic clamp(1.35rem, 3vw, 2rem)/1 Georgia, serif; }
    .livro-frente small {
      max-width: 9rem;
      color: #cbd6d1;
      font-size: clamp(.48rem, .9vw, .62rem);
      letter-spacing: .18em;
      text-align: center;
      text-transform: uppercase;
    }
    .livro-capa::before {
      content: "";
      position: absolute;
      inset: 7px 5px 7px 9px;
      border: 1px dashed #f4efdf2e;
      border-radius: 3px;
    }

    .livro-capa strong {
      position: relative;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font: italic clamp(.86rem, 1.5vw, 1.08rem)/1 Georgia, serif;
      white-space: nowrap;
    }

    .livro-capa small {
      position: relative;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      color: #c5d1cd;
      font-size: clamp(.34rem, .7vw, .48rem);
      letter-spacing: .12em;
      text-transform: uppercase;
      text-align: center;
      white-space: nowrap;
    }

    .caderno:hover .livro-capa,
    .caderno:focus-visible .livro-capa {
      filter: brightness(1.08);
      box-shadow: inset 6px 0 #071b2d, inset 8px 0 #f2992e, 0 12px 15px #0005;
    }

    @media (hover: hover) and (pointer: fine) {
      .caderno:hover:not(.puxando):not(.saindo) {
        z-index: 10;
        animation: caderno-retira 620ms cubic-bezier(.18,.72,.2,1) both;
      }
    }

    .livro:focus-visible { outline: none; }
    .livro:focus-visible::after {
      content: "";
      position: absolute;
      inset: -9px -10px -12px -9px;
      border: 3px solid var(--estante-laranja);
      border-radius: 9px;
    }

    .livro.puxando {
      z-index: 11;
      transform:
        translate3d(var(--puxado-x), var(--puxado-y), var(--puxado-z))
        rotateX(var(--puxado-inclinacao))
        rotateY(var(--puxado-giro))
        rotateZ(var(--puxado-angulo));
      transition: none;
      cursor: grabbing;
    }

    .livro.saindo {
      z-index: 12;
      pointer-events: none;
      animation: caderno-tomba 780ms cubic-bezier(.2,.72,.2,1) both;
    }

    .livro.saindo .livro-capa { filter: brightness(1.09); }

    .album {
      width: clamp(52px, 6.8vw, 68px);
      height: clamp(150px, min(29vw, 37dvh), 258px);
      cursor: default;
    }

    .album .livro-miolo { background: #d7d0b8; }
    .album .livro-capa {
      color: #233d48;
      border-color: #ffffff80;
      background:
        radial-gradient(circle at 65% 28%, #ffffff80 0 2px, transparent 3px),
        linear-gradient(145deg, #e8d73a, #c8ad31);
      box-shadow: inset 6px 0 #806d2a, inset 8px 0 #fff8b377;
      filter: saturate(.62) brightness(.82);
    }

    .album .livro-capa::before { border-color: #11273c36; }
    .album .livro-capa small { color: #324941; }

    .album .etiqueta {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 7px;
      height: 7px;
      padding: 0;
      border-radius: 999px;
      color: transparent;
      background: #11273cbd;
      overflow: hidden;
    }

    .estado {
      position: absolute;
      left: 50%;
      bottom: 9px;
      z-index: 8;
      transform: translateX(-50%);
      min-height: 1em;
      margin: 0;
      color: #c8d2ce;
      font-size: .62rem;
      letter-spacing: .08em;
      white-space: nowrap;
    }

    @keyframes caderno-tomba {
      0% {
        transform: translate3d(-82px, 3px, 185px) rotateX(-5deg) rotateY(-18deg);
      }
      30% { transform: translate3d(-82px, 18px, 225px) rotateX(-28deg) rotateY(-18deg) rotateZ(-.2deg); }
      62% { transform: translate3d(-82px, 62px, 285px) rotateX(-64deg) rotateY(-18deg) rotateZ(-.2deg); opacity: 1; }
      84% { opacity: 1; }
      100% { transform: translate3d(-82px, 132px, 365px) rotateX(-89deg) rotateY(-18deg) rotateZ(-.2deg); opacity: 0; }
    }

    @keyframes caderno-retira {
      0% {
        transform: translate3d(0, 0, 0) rotateX(0) rotateY(0);
      }
      100% {
        transform: translate3d(-82px, 3px, 185px) rotateX(-5deg) rotateY(-18deg);
      }
    }

    @media (max-width: 480px) {
      :host { height: var(--estante-altura, clamp(310px, min(96vw, calc(100dvh - 150px)), 370px)); }
      .estante { padding-inline: 24px; }
      .nicho { gap: 5px; padding-inline: 12px; }
      .livro { width: 48px; height: min(218px, 32dvh); }
      .album { width: 52px; height: min(192px, 28dvh); }
      .placa { top: -16px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .livro, .livro-capa { transition: none; }
      .livro.saindo { animation: caderno-tomba-reduzido 140ms ease-out both; }
      @keyframes caderno-tomba-reduzido {
        to { transform: translate3d(-42px, 15px, 100px) rotateX(-42deg) rotateY(-14deg); opacity: .2; }
      }
    }
  </style>

  <section class="estante" aria-label="Estante de cadernos Rebojar">
    <div class="placa" aria-hidden="true"><strong>rebojar</strong><span>estante</span></div>
    <div class="nicho">
      <a class="livro caderno" part="livro caderno" href="https://rebojar.netlify.app/" target="_top" draggable="false" aria-label="Abrir o Caderno de Bordo" title="Clique ou puxe a lombada">
        <span class="livro-miolo" aria-hidden="true"></span>
        <span class="livro-topo" aria-hidden="true"></span>
        <span class="livro-base" aria-hidden="true"></span>
        <span class="livro-frente" aria-hidden="true">
          <strong>rebojar</strong>
          <small>Caderno de Bordo</small>
        </span>
        <span class="livro-corte" aria-hidden="true"></span>
        <span class="livro-capa">
          <strong>rebojar</strong>
          <small>Caderno de Bordo</small>
        </span>
      </a>

      <button class="livro album" part="livro album" type="button" disabled aria-label="Álbum, em preparação">
        <span class="livro-miolo" aria-hidden="true"></span>
        <span class="livro-capa">
          <span class="etiqueta">em preparação</span>
          <strong>álbum</strong>
          <small>próximo caderno</small>
        </span>
      </button>

      <span class="prateleira" aria-hidden="true"></span>
    </div>
    <p class="estado" role="status" aria-live="polite"></p>
  </section>
`;

class RebojarEstante extends HTMLElement {
  #navegando = false;
  #temporizador;
  #arraste;
  #ignorarClique = false;

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(modelo.content.cloneNode(true));
  }

  connectedCallback() {
    this.#configurar();
    const caderno = this.shadowRoot.querySelector(".caderno");
    caderno.addEventListener("click", this.#abrirCaderno);
    caderno.addEventListener("pointerdown", this.#iniciarPuxada);
    caderno.addEventListener("pointermove", this.#moverPuxada);
    caderno.addEventListener("pointerup", this.#terminarPuxada);
    caderno.addEventListener("pointercancel", this.#cancelarPuxada);
    caderno.addEventListener("dragstart", this.#impedirArrasteNativo);
    addEventListener("pageshow", this.#restaurar);
  }

  disconnectedCallback() {
    clearTimeout(this.#temporizador);
    const caderno = this.shadowRoot.querySelector(".caderno");
    caderno.removeEventListener("click", this.#abrirCaderno);
    caderno.removeEventListener("pointerdown", this.#iniciarPuxada);
    caderno.removeEventListener("pointermove", this.#moverPuxada);
    caderno.removeEventListener("pointerup", this.#terminarPuxada);
    caderno.removeEventListener("pointercancel", this.#cancelarPuxada);
    caderno.removeEventListener("dragstart", this.#impedirArrasteNativo);
    removeEventListener("pageshow", this.#restaurar);
  }

  #configurar() {
    const destino = this.getAttribute("destino-caderno") || "https://rebojar.netlify.app/";
    const caderno = this.shadowRoot.querySelector(".caderno");
    caderno.href = destino;
    this.shadowRoot.querySelector(".album").hidden = !this.hasAttribute("mostrar-album");
  }

  #abrirCaderno = (evento) => {
    evento.preventDefault();
    if (this.#ignorarClique) {
      this.#ignorarClique = false;
      return;
    }
    if (this.#navegando) {
      return;
    }

    const caderno = evento.currentTarget;
    this.#iniciarSaida(caderno, caderno.href);
  };

  #impedirArrasteNativo = (evento) => evento.preventDefault();

  #iniciarPuxada = (evento) => {
    if (this.#navegando || evento.button !== 0) return;
    const caderno = evento.currentTarget;
    this.#arraste = {
      ponteiro: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      distancia: 0
    };
    caderno.setPointerCapture(evento.pointerId);
    caderno.classList.add("puxando");
    this.shadowRoot.querySelector(".estado").textContent = "Puxe a lombada para fora";
  };

  #moverPuxada = (evento) => {
    if (!this.#arraste || evento.pointerId !== this.#arraste.ponteiro || this.#navegando) return;
    const dx = evento.clientX - this.#arraste.x;
    const dy = evento.clientY - this.#arraste.y;
    const distancia = Math.hypot(dx, dy);
    const progresso = Math.min(distancia / 90, 1);
    const caderno = evento.currentTarget;

    this.#arraste.distancia = distancia;
    caderno.style.setProperty("--puxado-x", `${Math.round(-progresso * 82)}px`);
    caderno.style.setProperty("--puxado-y", `${Math.round(progresso * 3)}px`);
    caderno.style.setProperty("--puxado-z", `${Math.round(progresso * 185)}px`);
    caderno.style.setProperty("--puxado-inclinacao", `${(-progresso * 5).toFixed(2)}deg`);
    caderno.style.setProperty("--puxado-giro", `${(-progresso * 18).toFixed(2)}deg`);
    caderno.style.setProperty("--puxado-angulo", "0deg");
  };

  #terminarPuxada = (evento) => {
    if (!this.#arraste || evento.pointerId !== this.#arraste.ponteiro) return;
    const caderno = evento.currentTarget;
    const deveAbrir = this.#arraste.distancia >= 55;
    this.#arraste = undefined;
    caderno.releasePointerCapture?.(evento.pointerId);
    caderno.classList.remove("puxando");

    if (deveAbrir) {
      evento.preventDefault();
      this.#ignorarClique = true;
      this.#limparPuxada(caderno);
      this.#iniciarSaida(caderno, caderno.href);
      setTimeout(() => { this.#ignorarClique = false; }, 0);
      return;
    }

    this.#limparPuxada(caderno);
    this.shadowRoot.querySelector(".estado").textContent = "";
  };

  #cancelarPuxada = (evento) => {
    if (!this.#arraste || evento.pointerId !== this.#arraste.ponteiro) return;
    const caderno = evento.currentTarget;
    this.#arraste = undefined;
    caderno.classList.remove("puxando");
    this.#limparPuxada(caderno);
    this.shadowRoot.querySelector(".estado").textContent = "";
  };

  #limparPuxada(caderno) {
    for (const propriedade of ["--puxado-x", "--puxado-y", "--puxado-z", "--puxado-inclinacao", "--puxado-giro", "--puxado-angulo"]) {
      caderno.style.removeProperty(propriedade);
    }
  }

  #iniciarSaida(caderno, destino) {
    if (this.#navegando) return;
    const pedido = new CustomEvent("rebojar-estante:abrir", {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: { projeto: "caderno-de-bordo", destino }
    });

    if (!this.dispatchEvent(pedido)) {
      this.#limparPuxada(caderno);
      return;
    }

    this.#navegando = true;
    caderno.classList.add("saindo");
    caderno.setAttribute("aria-disabled", "true");
    this.shadowRoot.querySelector(".estado").textContent = "Abrindo o Caderno de Bordo…";

    const reduzido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.#temporizador = setTimeout(() => this.#navegar(destino), reduzido ? 170 : 810);
  }

  #navegar(destino) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.assign(destino);
        return;
      }
    } catch (_) {
      // Um iframe com restrições pode impedir a navegação do topo.
    }
    window.location.assign(destino);
  }

  #restaurar = () => {
    clearTimeout(this.#temporizador);
    this.#navegando = false;
    this.#arraste = undefined;
    this.#ignorarClique = false;
    const caderno = this.shadowRoot.querySelector(".caderno");
    caderno.classList.remove("saindo", "puxando");
    this.#limparPuxada(caderno);
    caderno.removeAttribute("aria-disabled");
    this.shadowRoot.querySelector(".estado").textContent = "";
  };
}

if (!customElements.get("rebojar-estante")) {
  customElements.define("rebojar-estante", RebojarEstante);
}
