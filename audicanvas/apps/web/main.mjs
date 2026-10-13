import { SpatialSpike } from '../../packages/audio-web/spike.mjs';
import { DIAGNOSTIC_DURATION, DIAGNOSTIC_SCENES } from '../../packages/engine/diagnostic-scenes.mjs';
import { MovementSimulator } from '../../packages/engine/movement.mjs';
import { FootstepAudio } from '../../packages/audio-web/steps.mjs';
const audio = new SpatialSpike();
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const restart = document.querySelector('#restart');
const scene = document.querySelector('#scene');
const description = document.querySelector('#scene-description');
const status = document.querySelector('#status');
const signal = document.querySelector('#signal');
const listener = document.querySelector('#listener');
const source = document.querySelector('#source');
const movement = new MovementSimulator();
const steps = new FootstepAudio();
const movementSpeed = document.querySelector('#movement-speed');
const movementSpeedValue = document.querySelector('#movement-speed-value');
const movementStart = document.querySelector('#movement-start');
const movementStop = document.querySelector('#movement-stop');
const movementReset = document.querySelector('#movement-reset');
const movementStatus = document.querySelector('#movement-status');
const movementDistance = document.querySelector('#movement-distance');
const stepStatus = document.querySelector('#step-status');
const stepCount = document.querySelector('#step-count');
let frame;
let movementFrame;
let movementStartRequest = 0;
let passagePaused = false;
const descriptions = {
  [DIAGNOSTIC_SCENES.PASS]: 'Uma fonte fica à sua direita enquanto você passa por ela. Esta é a versão que você já ouviu.',
  [DIAGNOSTIC_SCENES.CROSS]: 'Você fica parado enquanto uma fonte cruza à sua frente, da direita para a esquerda.',
  [DIAGNOSTIC_SCENES.FAR]: 'Você passa pela mesma fonte e continua mais longe para trás antes do som terminar.',
  [DIAGNOSTIC_SCENES.PASS_RIGHT]: 'Novo teste: a fonte está 2,5 m à sua direita e o trajeto é mais curto, para manter a lateralidade clara.',
  [DIAGNOSTIC_SCENES.PASS_RIGHT_RICH]: 'A mesma passagem 2,5 m à direita, agora com mais frequências para testar as pistas de localização do HRTF.',
};
function renderScene(progress = 0) {
  const selected = scene.value;
  description.textContent = descriptions[selected];
  source.textContent = [DIAGNOSTIC_SCENES.PASS_RIGHT, DIAGNOSTIC_SCENES.PASS_RIGHT_RICH].includes(selected) ? '◇ fonte à direita' : '◇ fonte';
  if (selected === DIAGNOSTIC_SCENES.CROSS) {
    listener.style.left = '50%';
    source.style.left = `${100 * (1 - progress)}%`;
  } else {
    listener.style.left = `${100 * progress}%`;
    source.style.left = selected === DIAGNOSTIC_SCENES.FAR ? '33.3%' : '50%';
  }
}
function halt(message = 'Passagem interrompida.') {
  cancelAnimationFrame(frame);
  audio.stop();
  passagePaused = false;
  start.disabled = false;
  start.textContent = 'Iniciar passagem';
  stop.disabled = true;
  restart.disabled = true;
  scene.disabled = false;
  status.textContent = message;
  signal.textContent = 'Sinal: —';
}
function draw() {
  const sample = audio.sample();
  if (!sample.playing) { halt('Passagem concluída. Você pode ouvir novamente.'); return; }
  if (sample.state !== 'running') { void pausePassage(`Áudio pausado: ${sample.state}.`); return; }
  signal.textContent = `Contexto: ${sample.state} · sinal RMS: ${sample.rms.toFixed(4)} · tempo: ${sample.elapsed.toFixed(1)} s`;
  renderScene(sample.elapsed / DIAGNOSTIC_DURATION);
  frame = requestAnimationFrame(draw);
}
async function beginPassage(restartFromBeginning = false) {
  if (restartFromBeginning) { audio.stop(); passagePaused = false; }
  start.disabled = true;
  restart.disabled = true;
  scene.disabled = true;
  status.textContent = passagePaused ? 'Continuando áudio…' : 'Iniciando áudio…';
  try {
    if (passagePaused) await audio.resume();
    else await audio.start(scene.value);
    passagePaused = false;
    if (document.hidden) { await pausePassage('Pausado ao sair da página.'); return; }
    start.textContent = 'Iniciar passagem';
    stop.disabled = false;
    restart.disabled = false;
    status.textContent = 'Ouça a trajetória selecionada.';
    draw();
  } catch (error) { halt(`Não foi possível iniciar: ${error.message}`); }
}
async function pausePassage(message = 'Passagem pausada. Continue de onde parou.') {
  if (!audio.active || passagePaused) return;
  cancelAnimationFrame(frame);
  stop.disabled = true;
  try {
    await audio.pause();
    passagePaused = true;
    start.disabled = false;
    start.textContent = 'Continuar passagem';
    restart.disabled = false;
    status.textContent = message;
    const sample = audio.sample();
    signal.textContent = `Pausado em ${sample.elapsed.toFixed(1)} s`;
  } catch (error) { halt(`Não foi possível pausar: ${error.message}`); }
}
start.addEventListener('click', () => { void beginPassage(); });
stop.addEventListener('click', () => { void pausePassage(); });
restart.addEventListener('click', () => { void beginPassage(true); });
scene.addEventListener('change', () => renderScene());

function movementTime() { return performance.now() / 1000; }
function renderMovement(snapshot) {
  movementSpeedValue.textContent = `${snapshot.speed.toFixed(1).replace('.', ',')} m/s`;
  movementDistance.textContent = `${snapshot.position.z.toFixed(2).replace('.', ',')} m`;
  stepCount.textContent = String(steps.scheduledCount);
  movementStatus.textContent = snapshot.moving ? 'Andando em terreno plano.' : 'Parado.';
  movementStart.disabled = snapshot.moving;
  movementStop.disabled = !snapshot.moving;
}
function drawMovement() {
  const snapshot = movement.observe(movementTime());
  renderMovement(snapshot);
  if (snapshot.moving) movementFrame = requestAnimationFrame(drawMovement);
}
function stopMovement() {
  movementStartRequest++;
  cancelAnimationFrame(movementFrame);
  const time = movementTime();
  steps.stop(time);
  renderMovement(movement.stop(time));
  stepStatus.textContent = 'Passos: desligados.';
}
movementStart.addEventListener('click', async () => {
  const request = ++movementStartRequest;
  movementStart.disabled = true;
  stepStatus.textContent = 'Iniciando passos sintéticos…';
  let time;
  try {
    time = await steps.start(Number(movementSpeed.value));
    stepStatus.textContent = 'Passos sintéticos ligados. Use fones e volume confortável.';
  } catch (error) {
    time = movementTime();
    stepStatus.textContent = `Passos indisponíveis: ${error.message}`;
  }
  if (request !== movementStartRequest || document.hidden) {
    steps.stop(time);
    stepStatus.textContent = 'Passos: desligados.';
    movementStart.disabled = false;
    return;
  }
  renderMovement(movement.start(time));
  movementFrame = requestAnimationFrame(drawMovement);
});
movementStop.addEventListener('click', stopMovement);
movementReset.addEventListener('click', () => {
  movementStartRequest++;
  cancelAnimationFrame(movementFrame);
  const time = movementTime();
  steps.stop(time);
  renderMovement(movement.reset(time));
  stepStatus.textContent = 'Passos: desligados.';
});
movementSpeed.addEventListener('input', () => {
  const time = movementTime();
  const speed = Number(movementSpeed.value);
  steps.setSpeed(speed, time);
  renderMovement(movement.setSpeed(speed, time));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { void pausePassage('Pausado ao sair da página.'); stopMovement(); }
});
window.addEventListener('pagehide', () => { halt(); stopMovement(); });
renderScene();
renderMovement(movement.observe(movementTime()));
