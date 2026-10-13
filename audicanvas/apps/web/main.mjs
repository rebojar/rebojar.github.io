import { SpatialSpike } from '../../packages/audio-web/spike.mjs?v=9de99ce8c698';
import { DIAGNOSTIC_DURATION, DIAGNOSTIC_SCENES } from '../../packages/engine/diagnostic-scenes.mjs?v=9de99ce8c698';
import { MovementSimulator } from '../../packages/engine/movement.mjs?v=9de99ce8c698';
import { FootstepAudio } from '../../packages/audio-web/steps.mjs?v=9de99ce8c698';
import { InteractionEngine, densityScaleForSpeed } from '../../packages/engine/interaction.mjs?v=9de99ce8c698';
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
const track = document.querySelector('.track');
const hideTrack = document.querySelector('#hide-track');
const movement = new MovementSimulator();
const steps = new FootstepAudio();
const movementSpeed = document.querySelector('#movement-speed');
const movementSpeedValue = document.querySelector('#movement-speed-value');
const movementStart = document.querySelector('#movement-start');
const movementStop = document.querySelector('#movement-stop');
const movementReset = document.querySelector('#movement-reset');
const movementStatus = document.querySelector('#movement-status');
const movementDistance = document.querySelector('#movement-distance');
const movementElapsed = document.querySelector('#movement-elapsed');
const stepStatus = document.querySelector('#step-status');
const stepCount = document.querySelector('#step-count');
const isolateContacts = document.querySelector('#isolate-contacts');
const bodyEarrings = document.querySelector('#body-earrings');
const bodyStatus = document.querySelector('#body-status');
const bodyCount = document.querySelector('#body-count');
const bodyVolume = document.querySelector('#body-volume');
const bodyVolumeValue = document.querySelector('#body-volume-value');
const interactionDensity = document.querySelector('#interaction-density');
const interactionDensityValue = document.querySelector('#interaction-density-value');
const interactionStatus = document.querySelector('#interaction-status');
const encounterSpeedNote = document.querySelector('#encounter-speed-note');
const contactPreviewStatus = document.querySelector('#contact-preview-status');
const flowerCount = document.querySelector('#flower-count');
const leafCount = document.querySelector('#leaf-count');
const pebbleCount = document.querySelector('#pebble-count');
const contactPreviewButtons = document.querySelectorAll('[data-contact-kind]');
let interactionEngine = null;
let surfaceReady = false;
let frame;
let movementFrame;
let movementStartRequest = 0;
let movementStartedAt = null;
let movementElapsedSeconds = 0;
let passageRequest = 0;
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
  passageRequest++;
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
  const request = ++passageRequest;
  stopMovement();
  if (restartFromBeginning) { audio.stop(); passagePaused = false; }
  start.disabled = true;
  restart.disabled = true;
  scene.disabled = true;
  status.textContent = passagePaused ? 'Continuando áudio…' : 'Iniciando áudio…';
  try {
    if (passagePaused) await audio.resume();
    else await audio.start(scene.value);
    if (request !== passageRequest) return;
    passagePaused = false;
    if (document.hidden) { await pausePassage('Pausado ao sair da página.'); return; }
    start.textContent = 'Iniciar passagem';
    stop.disabled = false;
    restart.disabled = false;
    status.textContent = 'Ouça a trajetória selecionada.';
    draw();
  } catch (error) { if (request === passageRequest) halt(`Não foi possível iniciar: ${error.message}`); }
}
async function pausePassage(message = 'Passagem pausada. Continue de onde parou.') {
  if (!audio.active || passagePaused) return;
  const request = passageRequest;
  cancelAnimationFrame(frame);
  stop.disabled = true;
  try {
    await audio.pause();
    if (request !== passageRequest) return;
    passagePaused = true;
    start.disabled = false;
    start.textContent = 'Continuar passagem';
    restart.disabled = false;
    status.textContent = message;
    const sample = audio.sample();
    signal.textContent = `Pausado em ${sample.elapsed.toFixed(1)} s`;
  } catch (error) { if (request === passageRequest) halt(`Não foi possível pausar: ${error.message}`); }
}
start.addEventListener('click', () => { void beginPassage(); });
stop.addEventListener('click', () => { void pausePassage(); });
restart.addEventListener('click', () => { void beginPassage(true); });
scene.addEventListener('change', () => renderScene());
hideTrack.addEventListener('change', () => { track.hidden = hideTrack.checked; });

function movementTime() { return performance.now() / 1000; }
function renderMovementElapsed(time) {
  if (movementStartedAt !== null) movementElapsedSeconds = Math.max(0, time - movementStartedAt);
  const seconds = Math.floor(movementElapsedSeconds);
  movementElapsed.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}${seconds >= 120 ? ' ✓' : ''}`;
}
function renderMovement(snapshot) {
  movementSpeedValue.textContent = `${snapshot.speed.toFixed(1).replace('.', ',')} m/s`;
  movementDistance.textContent = `${snapshot.position.z.toFixed(2).replace('.', ',')} m`;
  stepCount.textContent = String(steps.scheduledCount);
  flowerCount.textContent = String(steps.interactionCounts.dry_flower);
  leafCount.textContent = String(steps.interactionCounts.dry_leaf);
  pebbleCount.textContent = String(steps.interactionCounts.pebble);
  bodyCount.textContent = String(steps.bodyCount);
  movementStatus.textContent = snapshot.moving ? 'Andando em terreno plano.' : 'Parado.';
  movementStart.disabled = snapshot.moving || !surfaceReady;
  movementStop.disabled = !snapshot.moving;
}
function drawMovement() {
  const time = movementTime();
  const snapshot = movement.observe(time);
  renderMovement(snapshot);
  renderMovementElapsed(time);
  if (snapshot.moving) movementFrame = requestAnimationFrame(drawMovement);
}
function stopMovement(reason) {
  movementStartRequest++;
  cancelAnimationFrame(movementFrame);
  const time = movementTime();
  steps.stop(time);
  renderMovementElapsed(time);
  movementStartedAt = null;
  renderMovement(movement.stop(time));
  stepStatus.textContent = 'Passos: desligados.';
  if (reason && movementElapsedSeconds > 0) movementStatus.textContent = reason;
}
isolateContacts.addEventListener('change', () => {
  steps.setFootstepsMuted(isolateContacts.checked);
  bodyStatus.textContent = isolateContacts.checked && bodyEarrings.checked
    ? 'Brincos silenciados durante o teste só de encontros.'
    : bodyEarrings.checked ? 'Brincos ligados; acompanham os passos.' : 'Brincos desligados.';
  if (steps.active) stepStatus.textContent = isolateContacts.checked
    ? 'Passos silenciados para comparar os encontros.'
    : 'Passos sintéticos ligados. Use fones e volume confortável.';
});
bodyEarrings.addEventListener('change', () => {
  steps.setBodyEnabled(bodyEarrings.checked);
  bodyStatus.textContent = bodyEarrings.checked
    ? isolateContacts.checked ? 'Brincos silenciados durante o teste só de encontros.' : 'Brincos ligados; acompanham os passos.'
    : 'Brincos desligados.';
});
bodyVolume.addEventListener('input', () => {
  const volume = Number(bodyVolume.value);
  steps.setBodyVolume(volume);
  bodyVolumeValue.textContent = volume === 0 ? 'mudo' : volume <= 0.4 ? 'baixo' : volume <= 0.7 ? 'médio' : 'alto';
});
movementStart.addEventListener('click', async () => {
  if (audio.active || start.disabled || passagePaused) halt('Passagem interrompida para ouvir os passos separadamente.');
  const request = ++movementStartRequest;
  movementStart.disabled = true;
  stepStatus.textContent = 'Iniciando passos sintéticos…';
  let time;
  try {
    time = await steps.start(Number(movementSpeed.value));
    stepStatus.textContent = isolateContacts.checked
      ? 'Passos silenciados para comparar os encontros.'
      : 'Passos sintéticos ligados. Use fones e volume confortável.';
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
  movementStartedAt = time;
  movementElapsedSeconds = 0;
  renderMovementElapsed(time);
  renderMovement(movement.start(time));
  movementFrame = requestAnimationFrame(drawMovement);
});
movementStop.addEventListener('click', () => stopMovement());
movementReset.addEventListener('click', () => {
  movementStartRequest++;
  cancelAnimationFrame(movementFrame);
  const time = movementTime();
  steps.stop(time);
  movementStartedAt = null;
  movementElapsedSeconds = 0;
  renderMovementElapsed(time);
  renderMovement(movement.reset(time));
  stepStatus.textContent = 'Passos: desligados.';
});
movementSpeed.addEventListener('input', () => {
  const time = movementTime();
  const speed = Number(movementSpeed.value);
  const snapshot = movement.setSpeed(speed, time);
  updateEncounterRate();
  steps.setSpeed(speed, time);
  renderMovement(snapshot);
});

function updateEncounterRate() {
  if (!interactionEngine) return;
  const scale = Number(interactionDensity.value);
  const speed = Number(movementSpeed.value);
  interactionEngine.setDensityScale(densityScaleForSpeed(scale, speed));
  steps.interactions.cancelVoices(false, steps.context);
  interactionDensityValue.textContent = scale === 0 ? 'desligados' : scale < 0.8 ? 'raros' : scale > 1.2 ? 'frequentes' : 'normal';
  encounterSpeedNote.textContent = `A ${speed.toFixed(1).replace('.', ',')} m/s: cerca de ${Math.round(interactionEngine.estimatedEncountersPerMinute(speed))} encontros por minuto. Estimativa; os contatos continuam irregulares.`;
}
interactionDensity.addEventListener('input', updateEncounterRate);

const contactNames = { dry_flower: 'flor seca', dry_leaf: 'folha seca', pebble: 'pedrinha' };
for (const button of contactPreviewButtons) button.addEventListener('click', async () => {
  const kind = button.dataset.contactKind;
  if (audio.active || start.disabled || passagePaused) halt('Passagem interrompida para comparar contatos.');
  stopMovement();
  contactPreviewStatus.textContent = `Preparando ${contactNames[kind]}…`;
  for (const control of contactPreviewButtons) control.disabled = true;
  try {
    const played = await steps.previewInteraction(kind);
    contactPreviewStatus.textContent = played
      ? `Três contatos de ${contactNames[kind]} programados. Compare com outro material.`
      : 'Comparação interrompida por outro ensaio.';
  } catch (error) { contactPreviewStatus.textContent = `Não foi possível ouvir: ${error.message}`; }
  finally { for (const control of contactPreviewButtons) control.disabled = false; }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { void pausePassage('Pausado ao sair da página.'); stopMovement('Ensaio interrompido ao sair da aba.'); }
});
window.addEventListener('pagehide', () => { halt(); stopMovement(); });
renderScene();
renderMovement(movement.observe(movementTime()));
async function loadSurfaceScene() {
  try {
    const url = new URL('../../scenes/quiet-street.v0.json', import.meta.url);
    const version = new URL(import.meta.url).searchParams.get('v');
    if (version) url.searchParams.set('v', version);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cena não carregada (${response.status}).`);
    interactionEngine = new InteractionEngine(await response.json());
    steps.setInteractionPlan((step) => interactionEngine.eventsForStep(step, {
      speed: Number(movementSpeed.value),
      position: { x: 0, y: 0, z: movement.positionAt(step.time) },
    }));
    surfaceReady = true;
    interactionDensity.disabled = false;
    updateEncounterRate();
    interactionStatus.textContent = 'Cena de asfalto pronta. A frequência muda os próximos contatos.';
    renderMovement(movement.observe(movementTime()));
  } catch (error) { interactionStatus.textContent = `Não foi possível preparar o chão: ${error.message}`; }
}
void loadSurfaceScene();
