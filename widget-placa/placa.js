'use strict';
(() => {
  const CHAVE_VISIBILIDADE = 'rebojar-placa-botoes-v1';
  const CHAVE_PERSONALIZADO = 'rebojar-placa-personalizado-v1';
  const ids = ['github', 'kofi', 'apoia'];
  const adicionar = document.querySelector('#adicionarBotao');
  const menu = document.querySelector('#menuAdicionar');
  const personalizado = document.querySelector('[data-botao="personalizado"]');
  const editarPersonalizado = document.querySelector('#botaoPersonalizado');
  const botaoKofi = document.querySelector('[data-botao="kofi"]');
  const botaoApoia = document.querySelector('[data-botao="apoia"]');
  const janelaApoio = document.querySelector('#janelaApoio');
  const quadroApoio = document.querySelector('#quadroApoio');
  const voltarPlaca = document.querySelector('#voltarPlaca');
  const fundoJanelaApoio = document.querySelector('#fundoJanelaApoio');
  let visiveis = Object.fromEntries(ids.map(id => [id, true]));
  let dadosPersonalizados = null;

  try { visiveis = { ...visiveis, ...JSON.parse(localStorage.getItem(CHAVE_VISIBILIDADE) || '{}') }; } catch {}
  try { dadosPersonalizados = JSON.parse(localStorage.getItem(CHAVE_PERSONALIZADO) || 'null'); } catch {}

  const guardar = () => {
    try { localStorage.setItem(CHAVE_VISIBILIDADE, JSON.stringify(visiveis)); } catch {}
  };

  const abrirApoio = (plataforma, destino, titulo) => {
    if (window.parent !== window) {
      window.parent.postMessage({ tipo: 'rebojar:placa-abrir', plataforma, destino, titulo }, '*');
      return;
    }
    quadroApoio.src = destino;
    quadroApoio.title = titulo;
    janelaApoio.dataset.plataforma = plataforma;
    janelaApoio.hidden = false;
    voltarPlaca.focus({ preventScroll: true });
  };

  const fecharApoio = () => {
    janelaApoio.hidden = true;
    delete janelaApoio.dataset.plataforma;
    quadroApoio.removeAttribute('src');
  };

  const renderizar = () => {
    ids.forEach(id => {
      document.querySelector(`[data-botao="${id}"]`).hidden = !visiveis[id];
      const controle = document.querySelector(`[data-alternar="${id}"]`);
      controle.setAttribute('aria-checked', String(visiveis[id]));
      controle.querySelector('small').textContent = visiveis[id] ? 'Exibido na placa' : 'Oculto da placa';
    });
    if (dadosPersonalizados?.rotulo && dadosPersonalizados?.endereco) {
      personalizado.textContent = dadosPersonalizados.rotulo;
      personalizado.href = dadosPersonalizados.endereco;
      personalizado.hidden = false;
      editarPersonalizado.querySelector('small').textContent = 'Botão adicionado · clique para alterar';
    } else {
      personalizado.hidden = true;
      personalizado.removeAttribute('href');
      editarPersonalizado.querySelector('small').textContent = 'Dar nome e colar o endereço';
    }
  };

  const posicionarMenu = () => {
    const r = adicionar.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
  };

  document.querySelectorAll('[data-alternar]').forEach(controle => controle.addEventListener('click', () => {
    const id = controle.dataset.alternar;
    visiveis[id] = !visiveis[id];
    guardar();
    renderizar();
  }));

  editarPersonalizado.addEventListener('click', () => {
    const rotulo = prompt('Nome do botão:', dadosPersonalizados?.rotulo || 'Meu apoio');
    if (rotulo === null) return;
    const enderecoInformado = prompt('Endereço do botão (deixe vazio para remover):', dadosPersonalizados?.endereco || 'https://');
    if (enderecoInformado === null) return;
    const endereco = enderecoInformado.trim();
    if (!endereco) {
      dadosPersonalizados = null;
      try { localStorage.removeItem(CHAVE_PERSONALIZADO); } catch {}
      renderizar();
      return;
    }
    try {
      const url = new URL(endereco);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      dadosPersonalizados = { rotulo: rotulo.trim() || 'Meu apoio', endereco: url.href };
      try { localStorage.setItem(CHAVE_PERSONALIZADO, JSON.stringify(dadosPersonalizados)); } catch {}
      renderizar();
    } catch { alert('Use um endereço completo começando com http:// ou https://.'); }
  });

  botaoApoia.addEventListener('click', evento => {
    evento.preventDefault();
    abrirApoio('apoia', 'https://apoia.se/rebojar', 'Apoiar o Rebojar pelo Apoia.se');
  });
  botaoKofi.addEventListener('click', evento => {
    evento.preventDefault();
    abrirApoio('kofi', 'https://ko-fi.com/rebojar/?hidefeed=true&widget=true&embed=true&preview=true', 'Apoiar o Rebojar pelo Ko-fi');
  });
  voltarPlaca.addEventListener('click', fecharApoio);
  fundoJanelaApoio.addEventListener('click', fecharApoio);
  janelaApoio.addEventListener('click', evento => {
    if (evento.target === janelaApoio) fecharApoio();
  });

  adicionar.addEventListener('click', evento => {
    evento.stopPropagation();
    const abrir = menu.hidden;
    menu.hidden = !abrir;
    adicionar.setAttribute('aria-expanded', String(abrir));
    if (abrir) { posicionarMenu(); menu.querySelector('button').focus(); }
  });
  document.addEventListener('click', evento => {
    if (!menu.hidden && !menu.contains(evento.target) && evento.target !== adicionar) {
      menu.hidden = true;
      adicionar.setAttribute('aria-expanded', 'false');
    }
  });
  addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && !janelaApoio.hidden) {
      fecharApoio();
      return;
    }
    if (evento.key === 'Escape' && !menu.hidden) {
      menu.hidden = true;
      adicionar.setAttribute('aria-expanded', 'false');
      adicionar.focus();
    }
  });
  addEventListener('resize', () => { if (!menu.hidden) posicionarMenu(); }, { passive: true });

  addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => {
    const controles = document.querySelector('.controles-som-site');
    if (document.documentElement.dataset.embed === '1') {
      controles?.remove();
      adicionar.remove();
      menu.remove();
    } else controles?.prepend(adicionar);
  }), { once: true });

  renderizar();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
})();
