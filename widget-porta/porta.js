const moldura=document.querySelector(".moldura");
const macaneta=document.querySelector(".macaneta");
const passagem=document.querySelector(".passagem-escolhida");
const passagemMacaneta=document.querySelector(".passagem-macaneta");
const botaoSom=document.querySelector("#somPorta");
const executandoFonteLocal=location.protocol==="file:"||/\/Widget-Porta\//.test(location.pathname);
if(executandoFonteLocal){
  document.querySelectorAll("[data-destino-arquivo]").forEach(porta=>{porta.dataset.destino=porta.dataset.destinoArquivo});
}
const portasInternas=[...document.querySelectorAll(".porta-interna[data-destino]")];
const chaveSom="rebojar-som-ativo-v1";
let somAtivo=true;
let contextoSom;
let arraste;
let moveu=false;
let entrando=false;
let navegando=false;
let destinoEscolhido="";
let arrastePassagem;
let moveuPassagem=false;
let temporizadorFechamento;
let temporizadorEstadoFechando;
let temporizadorPassagemPronta;

function habilitarTextosEditaveisPorta(){
  const chave="rebojar-porta-textos-v1";
  let valores={};
  try{valores=JSON.parse(localStorage.getItem(chave)||"{}")||{}}catch{}
  const salvar=()=>{try{localStorage.setItem(chave,JSON.stringify(valores))}catch{}};
  const sincronizar=(origem,texto)=>{
    document.querySelectorAll(`[data-texto-editavel="${CSS.escape(origem.dataset.textoEditavel)}"]`).forEach(elemento=>{
      if(elemento!==origem)elemento.textContent=texto;
    });
    const porta=origem.closest(".porta-interna");
    if(porta){
      porta.dataset.nome=texto;
      porta.setAttribute("aria-label",`Entrar em ${texto}`);
    }
  };
  document.querySelectorAll("[data-texto-editavel]").forEach(elemento=>{
    if(elemento.dataset.textoEditavelPronto==="1")return;
    elemento.dataset.textoEditavelPronto="1";
    const id=elemento.dataset.textoEditavel;
    const padrao=elemento.textContent.trim();
    if(typeof valores[id]==="string"&&valores[id].trim())elemento.textContent=valores[id];
    sincronizar(elemento,elemento.textContent.trim());
    elemento.contentEditable="plaintext-only";
    if(elemento.contentEditable!=="plaintext-only")elemento.contentEditable="true";
    elemento.spellcheck=true;
    elemento.title="Clique para editar";
    let anterior=elemento.textContent;
    elemento.addEventListener("focus",()=>{anterior=elemento.textContent});
    elemento.addEventListener("pointerdown",evento=>evento.stopPropagation());
    elemento.addEventListener("click",evento=>{evento.preventDefault();evento.stopPropagation();});
    elemento.addEventListener("dblclick",evento=>evento.stopPropagation());
    elemento.addEventListener("paste",evento=>{
      evento.preventDefault();
      document.execCommand("insertText",false,evento.clipboardData?.getData("text/plain")||"");
    });
    elemento.addEventListener("input",()=>{
      valores[id]=elemento.textContent.replace(/[\r\n]+/g," ");
      sincronizar(elemento,valores[id]);
      salvar();
    });
    elemento.addEventListener("blur",()=>{
      const texto=elemento.textContent.replace(/\s+/g," ").trim()||padrao;
      elemento.textContent=texto;
      valores[id]=texto;
      sincronizar(elemento,texto);
      salvar();
    });
    elemento.addEventListener("keydown",evento=>{
      if(evento.key==="Enter"){
        evento.preventDefault();
        elemento.blur();
      }else if(evento.key==="Escape"){
        evento.preventDefault();
        elemento.textContent=anterior;
        valores[id]=anterior;
        sincronizar(elemento,anterior);
        salvar();
        elemento.blur();
      }
    });
  });
}

try{
  const somDoPortal=window.parent!==window?window.parent.RebojarSom?.ativo:undefined;
  const somSalvo=sessionStorage.getItem(chaveSom);
  somAtivo=typeof somDoPortal==="boolean"?somDoPortal:somSalvo===null||somSalvo==="true";
}catch{}

function atualizarControleSom(){
  document.documentElement.dataset.somAtivo=String(somAtivo);
  if(!botaoSom)return;
  botaoSom.setAttribute("aria-checked",String(somAtivo));
  botaoSom.setAttribute("aria-label",somAtivo?"Desativar sons da porta":"Ativar sons da porta");
  botaoSom.title=somAtivo?"Sons ligados":"Sons desligados";
  botaoSom.classList.toggle("som-desligado",!somAtivo);
}
atualizarControleSom();

botaoSom?.addEventListener("click",()=>{
  somAtivo=!somAtivo;
  try{sessionStorage.setItem(chaveSom,String(somAtivo))}catch{}
  atualizarControleSom();
  try{
    if(window.parent!==window&&window.parent.RebojarSom?.definirAtivo){
      window.parent.RebojarSom.definirAtivo(somAtivo,{desbloquear:somAtivo});
    }
  }catch{}
});

function tocarPortaAbrindo(){
  if(!somAtivo)return;
  try{
    contextoSom??=new(window.AudioContext||window.webkitAudioContext)();
    if(contextoSom.state==="suspended")contextoSom.resume().catch(()=>{});
    const inicio=contextoSom.currentTime;
    const criarRuido=(duracao,gerar)=>{
      const amostras=Math.ceil(contextoSom.sampleRate*duracao);
      const buffer=contextoSom.createBuffer(1,amostras,contextoSom.sampleRate);
      const dados=buffer.getChannelData(0);
      let madeira=0;
      for(let indice=0;indice<amostras;indice+=1){
        const tempo=indice/contextoSom.sampleRate;
        const bruto=Math.random()*2-1;
        madeira=madeira*.86+bruto*.14;
        dados[indice]=gerar(tempo,duracao,bruto,madeira);
      }
      return buffer;
    };
    const tocarRuido=({atraso=0,duracao,volume,tipo="lowpass",frequenciaInicial,frequenciaFinal,q=.7,gerar})=>{
      const quando=inicio+atraso;
      const fonte=contextoSom.createBufferSource();
      const filtro=contextoSom.createBiquadFilter();
      const ganho=contextoSom.createGain();
      fonte.buffer=criarRuido(duracao,gerar);
      filtro.type=tipo;
      filtro.frequency.setValueAtTime(frequenciaInicial,quando);
      filtro.frequency.exponentialRampToValueAtTime(frequenciaFinal,quando+duracao);
      filtro.Q.value=q;
      ganho.gain.setValueAtTime(volume,quando);
      ganho.gain.exponentialRampToValueAtTime(.0001,quando+duracao);
      fonte.connect(filtro).connect(ganho).connect(contextoSom.destination);
      fonte.start(quando);
      fonte.stop(quando+duracao+.02);
    };

    // O trinco e o impacto são rajadas curtas de madeira. Não há osciladores
    // tonais aqui: eles deixavam a porta com um timbre elástico, de mola.
    tocarRuido({
      duracao:.075,
      volume:.11,
      frequenciaInicial:1250,
      frequenciaFinal:330,
      gerar:(tempo,duracao,bruto,madeira)=>{
        const ataque=Math.min(1,tempo/.006);
        const queda=(1-tempo/duracao)**2.7;
        return (bruto*.42+madeira*.58)*ataque*queda;
      }
    });

    // Atrito irregular da madeira e das dobradiças durante o giro da folha.
    tocarRuido({
      atraso:.035,
      duracao:.78,
      volume:.052,
      tipo:"bandpass",
      frequenciaInicial:520,
      frequenciaFinal:190,
      q:.62,
      gerar:(tempo,duracao,bruto,madeira)=>{
        const entrada=Math.min(1,tempo/.055);
        const saida=Math.min(1,(duracao-tempo)/.12);
        const irregular=.38+.24*(1+Math.sin(tempo*29))+.14*(1+Math.sin(tempo*47+.8));
        return (bruto*.22+madeira*.78)*entrada*saida*irregular;
      }
    });

    tocarRuido({
      atraso:.67,
      duracao:.12,
      volume:.13,
      frequenciaInicial:310,
      frequenciaFinal:105,
      gerar:(tempo,duracao,bruto,madeira)=>{
        const ataque=Math.min(1,tempo/.008);
        const queda=(1-tempo/duracao)**3.2;
        return (bruto*.18+madeira*.82)*ataque*queda;
      }
    });
  }catch{}
}

function tocarPortaFechando(){
  if(!somAtivo)return;
  try{
    contextoSom??=new(window.AudioContext||window.webkitAudioContext)();
    if(contextoSom.state==="suspended")contextoSom.resume().catch(()=>{});
    const inicio=contextoSom.currentTime;
    const tocarRuido=({atraso=0,duracao,volume,frequenciaInicial,frequenciaFinal,tipo="bandpass",q=.65,impacto=false})=>{
      const amostras=Math.ceil(contextoSom.sampleRate*duracao);
      const buffer=contextoSom.createBuffer(1,amostras,contextoSom.sampleRate);
      const dados=buffer.getChannelData(0);
      let madeira=0;
      for(let indice=0;indice<amostras;indice+=1){
        const tempo=indice/contextoSom.sampleRate;
        const bruto=Math.random()*2-1;
        madeira=madeira*.88+bruto*.12;
        const ataque=Math.min(1,tempo/(impacto?.004:.045));
        const saida=Math.min(1,(duracao-tempo)/(impacto?.035:.11));
        const irregular=impacto?1:.52+.22*Math.sin(tempo*31)+.12*Math.sin(tempo*53+.7);
        dados[indice]=(bruto*.2+madeira*.8)*ataque*saida*irregular;
      }
      const fonte=contextoSom.createBufferSource();
      const filtro=contextoSom.createBiquadFilter();
      const ganho=contextoSom.createGain();
      const quando=inicio+atraso;
      fonte.buffer=buffer;
      filtro.type=tipo;
      filtro.frequency.setValueAtTime(frequenciaInicial,quando);
      filtro.frequency.exponentialRampToValueAtTime(frequenciaFinal,quando+duracao);
      filtro.Q.value=q;
      ganho.gain.setValueAtTime(volume,quando);
      ganho.gain.exponentialRampToValueAtTime(.0001,quando+duracao);
      fonte.connect(filtro).connect(ganho).connect(contextoSom.destination);
      fonte.start(quando);
      fonte.stop(quando+duracao+.02);
    };
    tocarRuido({duracao:.68,volume:.045,frequenciaInicial:190,frequenciaFinal:480});
    tocarRuido({atraso:.61,duracao:.13,volume:.14,frequenciaInicial:260,frequenciaFinal:82,tipo:"lowpass",impacto:true});
  }catch{}
}

addEventListener("message",evento=>{
  if(evento.data?.tipo!=="rebojar:som"||typeof evento.data.ativo!=="boolean")return;
  somAtivo=evento.data.ativo;
  atualizarControleSom();
});

function definirAberta(aberta){
  const estavaAberta=moldura.dataset.aberta==="true";
  clearTimeout(temporizadorFechamento);
  clearTimeout(temporizadorEstadoFechando);
  if(!aberta&&moldura.dataset.aberta==="true"){
    moldura.dataset.fechando="true";
    temporizadorEstadoFechando=setTimeout(()=>delete moldura.dataset.fechando,760);
    tocarPortaFechando();
  }else{
    delete moldura.dataset.fechando;
  }
  moldura.dataset.aberta=String(aberta);
  macaneta.setAttribute("aria-expanded",String(aberta));
  macaneta.setAttribute("aria-label",aberta?"Fechar a porta; dê dois cliques ou gire a maçaneta":"Abrir a porta; dê dois cliques ou gire a maçaneta");
  macaneta.style.setProperty("--rotacao","0deg");
  if(aberta&&!estavaAberta)tocarPortaAbrindo();
}

function alternar(){
  if(entrando)return;
  definirAberta(moldura.dataset.aberta!=="true");
}

function agendarFechamento(){
  clearTimeout(temporizadorFechamento);
  if(entrando||moldura.dataset.aberta!=="true")return;
  temporizadorFechamento=setTimeout(()=>definirAberta(false),420);
}

function navegarPelaPassagem(){
  if(!entrando||navegando||moldura.dataset.passagemPronta!=="true"||!destinoEscolhido)return;
  navegando=true;
  moldura.dataset.navegando="true";
  passagemMacaneta.disabled=true;
  const destino=destinoEscolhido;
  setTimeout(()=>{
    try{window.top.location.href=destino}catch{window.location.href=destino}
  },300);
}

function cancelarPassagem(){
  clearTimeout(temporizadorPassagemPronta);
  entrando=false;
  navegando=false;
  destinoEscolhido="";
  delete moldura.dataset.entrando;
  delete moldura.dataset.passagemPronta;
  delete moldura.dataset.navegando;
  passagem.setAttribute("aria-hidden","true");
  passagemMacaneta.disabled=true;
  passagemMacaneta.style.removeProperty("--rotacao");
  passagemMacaneta.style.removeProperty("--empurre-x");
  passagemMacaneta.style.removeProperty("--empurre-y");
}

function entrarPelaPorta(porta){
  if(entrando||moldura.dataset.aberta!=="true")return;
  entrando=true;
  navegando=false;
  destinoEscolhido=porta.dataset.destino;
  const caixaPorta=porta.getBoundingClientRect();
  const caixaMoldura=moldura.getBoundingClientRect();
  passagem.style.setProperty("--origem-x",`${caixaPorta.left-caixaMoldura.left}px`);
  passagem.style.setProperty("--origem-y",`${caixaPorta.top-caixaMoldura.top}px`);
  passagem.style.setProperty("--origem-largura",`${caixaPorta.width}px`);
  passagem.style.setProperty("--origem-altura",`${caixaPorta.height}px`);
  passagem.style.setProperty("--cor-escolhida",getComputedStyle(porta).getPropertyValue("--cor-porta").trim());
  passagem.querySelector("span").textContent=porta.dataset.nome;
  passagem.setAttribute("aria-hidden","false");
  passagemMacaneta.disabled=true;
  passagemMacaneta.setAttribute("aria-label",`Abrir a passagem para ${porta.dataset.nome}`);
  delete moldura.dataset.passagemPronta;
  delete moldura.dataset.navegando;
  moldura.dataset.entrando="true";
  clearTimeout(temporizadorPassagemPronta);
  temporizadorPassagemPronta=setTimeout(()=>{
    moldura.dataset.passagemPronta="true";
    passagemMacaneta.disabled=false;
    passagemMacaneta.focus({preventScroll:true});
  },780);
}

habilitarTextosEditaveisPorta();
portasInternas.forEach(porta=>porta.addEventListener("click",()=>entrarPelaPorta(porta)));
passagem.addEventListener("click",navegarPelaPassagem);

passagemMacaneta.addEventListener("pointerdown",evento=>{
  if(evento.button!==0||moldura.dataset.passagemPronta!=="true")return;
  arrastePassagem={id:evento.pointerId,x:evento.clientX,y:evento.clientY};
  moveuPassagem=false;
  passagemMacaneta.setPointerCapture(evento.pointerId);
});

passagemMacaneta.addEventListener("pointermove",evento=>{
  if(!arrastePassagem||evento.pointerId!==arrastePassagem.id)return;
  const dx=evento.clientX-arrastePassagem.x;
  const dy=evento.clientY-arrastePassagem.y;
  const distancia=Math.hypot(dx,dy);
  if(distancia>5)moveuPassagem=true;
  passagemMacaneta.style.setProperty("--rotacao",`${Math.max(-72,Math.min(72,dy+dx*.5)).toFixed(1)}deg`);
  passagemMacaneta.style.setProperty("--empurre-x",`${Math.max(-2,Math.min(12,dx*.22)).toFixed(1)}px`);
  passagemMacaneta.style.setProperty("--empurre-y",`${Math.max(-2,Math.min(12,dy*.22)).toFixed(1)}px`);
});

function terminarPassagem(evento){
  if(!arrastePassagem||evento.pointerId!==arrastePassagem.id)return;
  const distancia=Math.hypot(evento.clientX-arrastePassagem.x,evento.clientY-arrastePassagem.y);
  arrastePassagem=undefined;
  passagemMacaneta.releasePointerCapture?.(evento.pointerId);
  if(moveuPassagem&&distancia>=24){
    evento.preventDefault();
    evento.stopPropagation();
    navegarPelaPassagem();
    return;
  }
  passagemMacaneta.style.removeProperty("--rotacao");
  passagemMacaneta.style.removeProperty("--empurre-x");
  passagemMacaneta.style.removeProperty("--empurre-y");
}

passagemMacaneta.addEventListener("pointerup",terminarPassagem);
passagemMacaneta.addEventListener("pointercancel",evento=>{
  if(arrastePassagem?.id!==evento.pointerId)return;
  arrastePassagem=undefined;
  passagemMacaneta.style.removeProperty("--rotacao");
  passagemMacaneta.style.removeProperty("--empurre-x");
  passagemMacaneta.style.removeProperty("--empurre-y");
});

macaneta.addEventListener("dblclick",evento=>{
  evento.preventDefault();
  alternar();
});

macaneta.addEventListener("pointerdown",evento=>{
  if(evento.button!==0)return;
  arraste={id:evento.pointerId,x:evento.clientX,y:evento.clientY};
  moveu=false;
  macaneta.setPointerCapture(evento.pointerId);
});

macaneta.addEventListener("pointermove",evento=>{
  if(!arraste||evento.pointerId!==arraste.id)return;
  const dx=evento.clientX-arraste.x;
  const dy=evento.clientY-arraste.y;
  const distancia=Math.hypot(dx,dy);
  if(distancia>5)moveu=true;
  const angulo=Math.max(-82,Math.min(82,dy+dx*.45));
  macaneta.style.setProperty("--rotacao",`${angulo.toFixed(1)}deg`);
});

function terminarGiro(evento){
  if(!arraste||evento.pointerId!==arraste.id)return;
  const distancia=Math.hypot(evento.clientX-arraste.x,evento.clientY-arraste.y);
  arraste=undefined;
  macaneta.releasePointerCapture?.(evento.pointerId);
  macaneta.style.setProperty("--rotacao","0deg");
  if(moveu&&distancia>=28)alternar();
}

macaneta.addEventListener("pointerup",terminarGiro);
macaneta.addEventListener("pointercancel",evento=>{
  if(arraste?.id!==evento.pointerId)return;
  arraste=undefined;
  macaneta.style.setProperty("--rotacao","0deg");
});

macaneta.addEventListener("keydown",evento=>{
  if(evento.key!=="Enter"&&evento.key!==" ")return;
  evento.preventDefault();
  alternar();
});

moldura.addEventListener("pointerenter",()=>clearTimeout(temporizadorFechamento));
moldura.addEventListener("pointerleave",agendarFechamento);
document.addEventListener("keydown",evento=>{
  if(evento.key!=="Escape")return;
  if(entrando&&!navegando){
    cancelarPassagem();
    return;
  }
  if(moldura.dataset.aberta==="true")definirAberta(false);
});

definirAberta(false);
