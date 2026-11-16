import { SpatialSpike } from '../../packages/audio-web/spike.mjs?v=228c1e899ea2';
import { DIAGNOSTIC_DURATION, DIAGNOSTIC_SCENES } from '../../packages/engine/diagnostic-scenes.mjs?v=228c1e899ea2';
import { MovementSimulator } from '../../packages/engine/movement.mjs?v=228c1e899ea2';
import { FootstepAudio } from '../../packages/audio-web/steps.mjs?v=228c1e899ea2';
import { InteractionEngine, densityScaleForSpeed } from '../../packages/engine/interaction.mjs?v=228c1e899ea2';
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
const masterVolume = document.querySelector('#master-volume');
const masterVolumeValue = document.querySelector('#master-volume-value');
const masterVolumeControl = document.querySelector('#master-volume-control');
const movementMode = document.querySelector('#movement-mode');
const movementSpeed = document.querySelector('#movement-speed');
const movementSpeedValue = document.querySelector('#movement-speed-value');
const stepsVolume = document.querySelector('#steps-volume');
const stepsVolumeValue = document.querySelector('#steps-volume-value');
const movementStart = document.querySelector('#movement-start');
const movementStop = document.querySelector('#movement-stop');
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
const worldTraffic = document.querySelector('#world-traffic');
const environmentType = document.querySelector('#environment-type');
const environmentNote = document.querySelector('#environment-note');
const ambientChoices = [...document.querySelectorAll('[data-ambient-kind]')];
const ambientVolumes = new Map([...document.querySelectorAll('[data-ambient-volume]')].map((input) => [input.dataset.ambientVolume, input]));
const ambienceStatus = document.querySelector('#ambience-status');
const ambientRequests = new Map();
const trafficVolume = document.querySelector('#traffic-volume');
const trafficVolumeValue = document.querySelector('#traffic-volume-value');
const passageVolume = document.querySelector('#passage-volume');
const passageVolumeValue = document.querySelector('#passage-volume-value');
const trafficStatus = document.querySelector('#traffic-status');
const trafficCount = document.querySelector('#traffic-count');
const interactionDensity = document.querySelector('#interaction-density');
const materialChoices = document.querySelectorAll('[data-material-kind]');
const layerVolumes = new Map([...document.querySelectorAll('[data-layer-volume]')].map((input) => [input.dataset.layerVolume, input]));
const interactionDensityValue = document.querySelector('#interaction-density-value');
const interactionStatus = document.querySelector('#interaction-status');
const encounterSpeedNote = document.querySelector('#encounter-speed-note');
const contactPreviewStatus = document.querySelector('#contact-preview-status');
const flowerCount = document.querySelector('#flower-count');
const leafCount = document.querySelector('#leaf-count');
const pebbleCount = document.querySelector('#pebble-count');
const contactPreviewButtons = document.querySelectorAll('[data-contact-kind]');
const drawers = [...document.querySelectorAll('.control-drawer')];
const trajectoryDrawer = document.querySelector('#drawer-trajectory');
const walkView = document.querySelector('#walk-view');
const trajectoryView = document.querySelector('#trajectory-view');
const trajectorySceneLabel = document.querySelector('#trajectory-scene-label');
const trackHiddenNote = document.querySelector('#track-hidden-note');
const stageMetrics = document.querySelector('.stage-metrics');
const sceneTransport = document.querySelector('#scene-transport');
const walkVisual = document.querySelector('.walk-visual');
const visualSummary = document.querySelector('#visual-summary');
const animateScene = document.querySelector('#animate-scene');
const audioError = document.querySelector('#audio-error');
const mediaAudioTest = document.querySelector('#media-audio-test');
const engineAudioTest = document.querySelector('#engine-audio-test');
const stepsChannelTest = document.querySelector('#steps-channel-test');
const audioTestStatus = document.querySelector('#audio-test-status');
const mediaOutputCheck = new Audio(new URL('./audio-output-check.wav', document.baseURI).href);
const playerChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('rebojar-audicanvas-v1') : null;
let playerMuted = false;
function publishPlayerState() {
  playerChannel?.postMessage({ type: 'player-state', playing: Boolean(steps.active || audio.active), muted: playerMuted });
}
if (playerChannel) playerChannel.onmessage = ({ data }) => {
  if (data?.type === 'request-state') { publishPlayerState(); return; }
  if (data?.type !== 'set-muted' || typeof data.muted !== 'boolean') return;
  playerMuted = data.muted;
  syncMasterVolume();
  audio.setVolume(playerMuted ? 0 : Number(passageVolume.value));
  publishPlayerState();
};
window.name = 'rebojar-audicanvas';
syncOutputProfile();
steps.setEnvironmentMode(environmentType.value);
for (const [kind, input] of ambientVolumes) steps.setChannelVolume(kind, Number(input.value));
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
  trajectorySceneLabel.textContent = scene.selectedOptions[0].textContent;
  source.textContent = [DIAGNOSTIC_SCENES.PASS_RIGHT, DIAGNOSTIC_SCENES.PASS_RIGHT_RICH].includes(selected) ? '◇ fonte à direita' : '◇ fonte';
  if (selected === DIAGNOSTIC_SCENES.CROSS) {
    listener.style.left = '50%';
    source.style.left = `${100 * (1 - progress)}%`;
  } else {
    listener.style.left = `${100 * progress}%`;
    source.style.left = selected === DIAGNOSTIC_SCENES.FAR ? '33.3%' : '50%';
  }
}
function syncScreen() {
  const showTrajectory = trajectoryDrawer.open || audio.active || passagePaused;
  walkView.hidden = showTrajectory;
  trajectoryView.hidden = !showTrajectory;
  stageMetrics.hidden = showTrajectory;
  sceneTransport.hidden = showTrajectory;
}
function syncVisualMotion() {
  walkVisual.dataset.animate = String(animateScene.checked);
}
animateScene.addEventListener('change', syncVisualMotion);
syncVisualMotion();
function setupAutoHideHeader() {
  const header = document.querySelector('.site-header');
  if (!header || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let hideTimer = null;
  const cancelHide = () => { clearTimeout(hideTimer); hideTimer = null; };
  const show = () => { cancelHide(); header.classList.remove('header-hidden'); };
  const scheduleHide = () => {
    if (hideTimer || header.classList.contains('header-hidden')) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!header.matches(':hover') && !header.contains(document.activeElement)) header.classList.add('header-hidden');
    }, 2000);
  };
  header.addEventListener('pointerenter', show);
  header.addEventListener('pointerleave', scheduleHide);
  header.addEventListener('focusin', show);
  header.addEventListener('focusout', scheduleHide);
  window.addEventListener('pointermove', (event) => {
    if (event.clientY <= Math.max(12, header.offsetHeight)) show();
    else scheduleHide();
  }, { passive: true });
  window.addEventListener('blur', scheduleHide);
  scheduleHide();
}
setupAutoHideHeader();
for (const drawer of drawers) drawer.addEventListener('toggle', () => {
  if (drawer.open) {
    for (const other of drawers) if (other !== drawer) other.open = false;
    if (drawer === trajectoryDrawer && steps.active) stopMovement();
    if (drawer !== trajectoryDrawer && (audio.active || passagePaused)) halt('Passagem interrompida ao abrir outro painel.');
  }
  syncScreen();
});
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
  syncScreen();
  publishPlayerState();
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
    start.textContent = 'Iniciar passagem';
    stop.disabled = false;
    restart.disabled = false;
    status.textContent = 'Ouça a trajetória selecionada.';
    draw();
    publishPlayerState();
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
    publishPlayerState();
  } catch (error) { if (request === passageRequest) halt(`Não foi possível pausar: ${error.message}`); }
}
start.addEventListener('click', () => { void beginPassage(); });
stop.addEventListener('click', () => { void pausePassage(); });
restart.addEventListener('click', () => { void beginPassage(true); });
scene.addEventListener('change', () => renderScene());
hideTrack.addEventListener('change', () => {
  track.hidden = hideTrack.checked;
  trackHiddenNote.hidden = !hideTrack.checked;
});
const volumePercent = (value) => `${Math.round(Number(value) * 100)}%`;
const hasStationaryAmbience = () => !isolateContacts.checked && (
  (worldTraffic.checked && Number(trafficVolume.value) > 0)
  || ambientChoices.some((choice) => choice.checked && Number(ambientVolumes.get(choice.dataset.ambientKind).value) > 0)
);
const stationaryAudioNote = () => hasStationaryAmbience()
  ? 'Parada: passos, encontros e brincos pausados. As camadas de ambiente escolhidas continuam.'
  : 'Parada: nenhuma camada sonora ativa. Ligue um som de ambiente ou escolha Andando.';
stepsVolume.addEventListener('input', () => {
  steps.setChannelVolume('steps', Number(stepsVolume.value));
  stepsVolumeValue.textContent = volumePercent(stepsVolume.value);
  if (steps.active && !isolateContacts.checked) stepStatus.textContent = Number(stepsVolume.value) === 0
    ? 'Passos em volume zero; as outras camadas selecionadas continuam.'
    : 'Passos sintéticos ligados. Ajuste um volume confortável.';
});
for (const [kind, input] of layerVolumes) input.addEventListener('input', () => {
  steps.setChannelVolume(kind, Number(input.value));
  document.querySelector(`#${input.id}-value`).textContent = volumePercent(input.value);
  updateVisualScene();
});
trafficVolume.addEventListener('input', () => {
  steps.setChannelVolume('traffic', Number(trafficVolume.value));
  trafficVolumeValue.textContent = volumePercent(trafficVolume.value);
  updateTrafficAudibility();
});
passageVolume.addEventListener('input', () => {
  audio.setVolume(playerMuted ? 0 : Number(passageVolume.value));
  passageVolumeValue.textContent = volumePercent(passageVolume.value);
});

function movementTime() { return performance.now() / 1000; }
function renderMovementElapsed(time) {
  if (movementStartedAt !== null) movementElapsedSeconds = Math.max(0, time - movementStartedAt);
  const seconds = Math.floor(movementElapsedSeconds);
  movementElapsed.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}${seconds >= 120 ? ' ✓' : ''}`;
}
function renderMovement(snapshot) {
  walkVisual.dataset.moving = String(snapshot.moving);
  walkVisual.dataset.playing = String(steps.active);
  const roomAngle = snapshot.position.z / 1.8;
  walkVisual.style.setProperty('--room-orbit-x', `${(Math.sin(roomAngle) * 30).toFixed(2)}%`);
  walkVisual.style.setProperty('--room-orbit-y', `${(Math.cos(roomAngle) * 23).toFixed(2)}%`);
  const cycle = 2.2 / Math.max(0.2, snapshot.speed);
  const walkDuration = `${cycle.toFixed(2)}s`;
  if (walkVisual.style.getPropertyValue('--walk-duration') !== walkDuration) {
    walkVisual.style.setProperty('--walk-duration', walkDuration);
    walkVisual.style.setProperty('--object-duration', `${(cycle * 5).toFixed(2)}s`);
    walkVisual.style.setProperty('--traffic-duration', `${(cycle * 8).toFixed(2)}s`);
    for (const item of walkVisual.querySelectorAll('.path-object')) item.style.animationDelay = `${(-cycle * 5 * Number(item.dataset.phase)).toFixed(2)}s`;
    for (const car of walkVisual.querySelectorAll('.traffic-car')) car.style.animationDelay = `${(-cycle * 8 * Number(car.dataset.phase)).toFixed(2)}s`;
  }
  movementSpeedValue.textContent = `${snapshot.speed.toFixed(1).replace('.', ',')} m/s`;
  movementDistance.textContent = `${snapshot.position.z.toFixed(2).replace('.', ',')} m`;
  stepCount.textContent = String(steps.scheduledCount);
  flowerCount.textContent = String(steps.interactionCounts.dry_flower);
  leafCount.textContent = String(steps.interactionCounts.dry_leaf);
  pebbleCount.textContent = String(steps.interactionCounts.pebble);
  bodyCount.textContent = String(steps.bodyCount);
  trafficCount.textContent = String(steps.trafficCount);
  const movementMessage = snapshot.moving
    ? environmentType.value === 'indoor' ? 'Caminhando em círculo pelo quarto.' : 'Andando em terreno plano.'
    : steps.active ? 'Parada, ouvindo o ambiente.' : 'Parado.';
  if (movementStatus.textContent !== movementMessage) movementStatus.textContent = movementMessage;
  movementStart.disabled = steps.active || !surfaceReady;
  movementStop.disabled = !steps.active;
}
function drawMovement() {
  const time = movementTime();
  const snapshot = movement.observe(time);
  renderMovement(snapshot);
  renderMovementElapsed(time);
  if (steps.active) movementFrame = requestAnimationFrame(drawMovement);
}
function stopMovement(reason) {
  movementStartRequest++;
  cancelAnimationFrame(movementFrame);
  const time = movementTime();
  steps.stop(time);
  renderMovementElapsed(time);
  movementStartedAt = null;
  renderMovement(movement.stop(time));
  stepStatus.textContent = 'Cena parada. Pronta para reproduzir.';
  if (reason && movementElapsedSeconds > 0) movementStatus.textContent = reason;
  publishPlayerState();
}
isolateContacts.addEventListener('change', () => {
  steps.setFootstepsMuted(isolateContacts.checked);
  stepsVolume.disabled = isolateContacts.checked || movementMode.value === 'stationary';
  updateTrafficAudibility();
  for (const choice of ambientChoices) void updateAmbientChoice(choice);
  updateBodyControls();
  if (steps.active) stepStatus.textContent = movementMode.value === 'stationary'
    ? stationaryAudioNote()
    : isolateContacts.checked
    ? 'Passos silenciados para comparar os encontros.'
    : 'Passos sintéticos ligados. Ajuste um volume confortável.';
});
function updateTrafficAudibility() {
  steps.setTrafficEnabled(worldTraffic.checked && !isolateContacts.checked);
  trafficVolume.disabled = !surfaceReady || !worldTraffic.checked || isolateContacts.checked;
  trafficStatus.textContent = isolateContacts.checked && worldTraffic.checked
    ? 'Trânsito silenciado durante o teste só de encontros.'
    : !worldTraffic.checked ? 'Trânsito desligado.'
      : Number(trafficVolume.value) === 0 ? 'Trânsito em volume zero.'
        : 'Trânsito ligado; o próximo veículo passa ocasionalmente ao longe.';
  if (steps.active && movementMode.value === 'stationary') stepStatus.textContent = stationaryAudioNote();
  updateVisualScene();
}
worldTraffic.addEventListener('change', updateTrafficAudibility);
environmentType.addEventListener('change', () => {
  steps.setEnvironmentMode(environmentType.value);
  syncOutputProfile();
  environmentNote.textContent = environmentType.value === 'indoor'
    ? 'No quarto: sons mais abafados e com reflexões curtas. Perfil de mixagem para fones estéreo.'
    : 'Ao ar livre: sons mais abertos, sem reflexões de sala. Perfil de mixagem para alto-falantes.';
  updateVisualScene();
  renderMovement(movement.observe(movementTime()));
});
async function updateAmbientChoice(choice) {
  const kind = choice.dataset.ambientKind;
  const request = (ambientRequests.get(kind) ?? 0) + 1;
  ambientRequests.set(kind, request);
  const enabled = choice.checked && !isolateContacts.checked;
  ambientVolumes.get(kind).disabled = !surfaceReady || !enabled;
  ambienceStatus.textContent = enabled ? 'Preparando a paisagem sonora…' : 'As camadas escolhidas podem ser combinadas e ajustadas separadamente.';
  try {
    await steps.setAmbientEnabled(kind, enabled);
    if (ambientRequests.get(kind) !== request) return;
    ambienceStatus.textContent = enabled
      ? steps.active ? 'Paisagem sonora ligada. Ajuste o volume enquanto escuta.' : 'Paisagem selecionada. Reproduza a cena para ouvir.'
      : 'As camadas escolhidas podem ser combinadas e ajustadas separadamente.';
  } catch (error) {
    if (ambientRequests.get(kind) !== request) return;
    choice.checked = false;
    ambientVolumes.get(kind).disabled = true;
    await steps.setAmbientEnabled(kind, false);
    ambienceStatus.textContent = `Não foi possível carregar este som: ${error.message}`;
  }
  if (steps.active && movementMode.value === 'stationary') stepStatus.textContent = stationaryAudioNote();
  updateVisualScene();
}
for (const choice of ambientChoices) choice.addEventListener('change', () => { void updateAmbientChoice(choice); });
for (const [kind, input] of ambientVolumes) input.addEventListener('input', () => {
  steps.setChannelVolume(kind, Number(input.value));
  document.querySelector(`#${input.id}-value`).textContent = volumePercent(input.value);
  if (steps.active && movementMode.value === 'stationary') stepStatus.textContent = stationaryAudioNote();
  updateVisualScene();
});
function updateBodyControls() {
  bodyVolume.disabled = !bodyEarrings.checked || isolateContacts.checked;
  bodyStatus.textContent = !bodyEarrings.checked
    ? 'Brincos desligados. Ligue para ajustar o volume.'
    : isolateContacts.checked
      ? 'Brincos silenciados neste teste; volume indisponível.'
      : Number(bodyVolume.value) === 0
        ? 'Brincos ligados, mas volume mudo.'
        : 'Brincos ligados; acompanham os passos.';
}
bodyEarrings.addEventListener('change', () => {
  steps.setBodyEnabled(bodyEarrings.checked);
  updateBodyControls();
});
bodyVolume.addEventListener('input', () => {
  const volume = Number(bodyVolume.value);
  steps.setBodyVolume(volume);
  bodyVolumeValue.textContent = volumePercent(volume);
  updateBodyControls();
});
updateBodyControls();
movementStart.addEventListener('click', async () => {
  if (audio.active || start.disabled || passagePaused) halt('Passagem interrompida para ouvir os passos separadamente.');
  const request = ++movementStartRequest;
  movementStart.disabled = true;
  audioError.hidden = true;
  stepStatus.textContent = 'Iniciando a cena sonora…';
  let time;
  try {
    time = await steps.start(Number(movementSpeed.value), movementMode.value === 'walking');
    stepStatus.textContent = movementMode.value === 'stationary'
      ? stationaryAudioNote()
      : isolateContacts.checked
      ? 'Passos silenciados para comparar os encontros.'
      : Number(stepsVolume.value) === 0 ? 'Passos em volume zero; as outras camadas selecionadas continuam.'
        : 'Passos sintéticos ligados. Ajuste um volume confortável.';
  } catch (error) {
    steps.stop(movementTime());
    if (request !== movementStartRequest) return;
    movementStatus.textContent = 'Não foi possível começar.';
    stepStatus.textContent = 'Áudio indisponível. Tente novamente; se persistir, recarregue a página.';
    audioError.textContent = `Áudio indisponível: ${error.message}`;
    audioError.hidden = false;
    movementStart.disabled = false;
    return;
  }
  if (request !== movementStartRequest) {
    steps.stop(time);
    stepStatus.textContent = 'Cena pronta. Escolha a posição e reproduza.';
    movementStart.disabled = false;
    return;
  }
  movementStartedAt = time;
  movementElapsedSeconds = 0;
  renderMovementElapsed(time);
  renderMovement(movementMode.value === 'walking' ? movement.start(time) : movement.stop(time));
  movementFrame = requestAnimationFrame(drawMovement);
  publishPlayerState();
});
movementStop.addEventListener('click', () => stopMovement());
movementMode.addEventListener('change', () => {
  const walking = movementMode.value === 'walking';
  const time = movementTime();
  movementSpeed.disabled = !walking;
  stepsVolume.disabled = !walking || isolateContacts.checked;
  if (steps.active) steps.setMoving(walking, time);
  const snapshot = walking && steps.active ? movement.start(time) : movement.stop(time);
  renderMovement(snapshot);
  if (steps.active) stepStatus.textContent = walking
    ? 'Caminhada retomada: passos e encontros acompanham o ritmo.'
    : stationaryAudioNote();
  updateVisualScene();
});
function syncOutputProfile() {
  const mode = environmentType.value === 'indoor' ? 'headphones' : 'speakers';
  steps.setOutputMode(mode);
  masterVolume.max = mode === 'speakers' ? '3' : '1';
  if (Number(masterVolume.value) > Number(masterVolume.max)) masterVolume.value = masterVolume.max;
  syncMasterVolume();
}
function syncMasterVolume() {
  steps.setMasterVolume(playerMuted ? 0 : Number(masterVolume.value));
  const percent = `${Math.round(Number(masterVolume.value) * 100)}%`;
  masterVolumeValue.textContent = playerMuted ? 'MUDO' : percent;
  masterVolume.setAttribute('aria-valuetext', playerMuted ? `Mudo; ajuste salvo em ${percent}` : percent);
  masterVolumeControl.style.setProperty('--knob-angle', `${(-135 + 270 * Number(masterVolume.value) / Number(masterVolume.max)).toFixed(1)}deg`);
}
masterVolume.addEventListener('input', syncMasterVolume);
function turnVolumeFromPointer(event) {
  event.preventDefault();
  const box = masterVolumeControl.getBoundingClientRect();
  const dx = event.clientX - box.left - box.width / 2;
  const dy = event.clientY - box.top - box.height / 2;
  if (Math.hypot(dx, dy) < 4) return;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  if (angle > 180) angle -= 360;
  if (angle < -135 || angle > 135) angle = dx < 0 ? -135 : 135;
  const fraction = Math.min(1, Math.max(0, (angle + 135) / 270));
  const step = Number(masterVolume.step);
  masterVolume.value = String(Math.round(fraction * Number(masterVolume.max) / step) * step);
  masterVolume.dispatchEvent(new Event('input', { bubbles: true }));
}
masterVolume.addEventListener('pointerdown', (event) => {
  masterVolume.focus({ preventScroll: true });
  masterVolume.setPointerCapture(event.pointerId);
  turnVolumeFromPointer(event);
});
masterVolume.addEventListener('pointermove', (event) => {
  if (masterVolume.hasPointerCapture(event.pointerId)) turnVolumeFromPointer(event);
});
movementSpeed.addEventListener('input', () => {
  const time = movementTime();
  const speed = Number(movementSpeed.value);
  const snapshot = movement.setSpeed(speed, time);
  updateEncounterRate();
  steps.setSpeed(speed, time);
  renderMovement(snapshot);
});
mediaAudioTest.addEventListener('click', async () => {
  if (steps.active) stopMovement();
  if (audio.active || passagePaused) halt('Passagem interrompida para testar a saída.');
  mediaOutputCheck.pause();
  mediaOutputCheck.currentTime = 0;
  audioTestStatus.textContent = 'Iniciando teste do navegador…';
  try {
    await mediaOutputCheck.play();
    audioTestStatus.textContent = 'Dois tons enviados pelo navegador. Você os ouviu?';
  } catch (error) {
    audioTestStatus.textContent = `Teste do navegador falhou: ${error.message}`;
  }
});
engineAudioTest.addEventListener('click', async () => {
  if (steps.active) stopMovement();
  if (audio.active || passagePaused) halt('Passagem interrompida para testar a saída.');
  audioTestStatus.textContent = 'Iniciando teste do motor…';
  try {
    const state = await steps.previewOutput();
    audioTestStatus.textContent = `Dois tons enviados pelo motor. Contexto: ${state}. Você os ouviu?`;
  } catch (error) {
    audioTestStatus.textContent = `Teste do motor falhou: ${error.message}`;
  }
});
stepsChannelTest.addEventListener('click', async () => {
  if (steps.active) stopMovement();
  if (audio.active || passagePaused) halt('Passagem interrompida para testar a saída.');
  audioTestStatus.textContent = 'Iniciando teste do canal dos passos…';
  try {
    const state = await steps.previewOutput(true);
    audioTestStatus.textContent = `Dois tons enviados pelo canal dos passos. Contexto: ${state}. Você os ouviu?`;
  } catch (error) {
    audioTestStatus.textContent = `Teste do canal falhou: ${error.message}`;
  }
});

function updateEncounterRate() {
  if (!interactionEngine) return;
  const scale = Number(interactionDensity.value);
  const speed = Number(movementSpeed.value);
  interactionEngine.setDensityScale(densityScaleForSpeed(scale, speed));
  steps.interactions.cancelVoices(false, steps.context);
  interactionDensityValue.textContent = scale === 0 ? 'desligados' : scale < 0.8 ? 'raros' : scale > 1.2 ? 'frequentes' : 'normal';
  const estimate = Math.round(interactionEngine.estimatedEncountersPerMinute(speed));
  encounterSpeedNote.textContent = [...materialChoices].some((choice) => choice.checked)
    ? `A ${speed.toFixed(1).replace('.', ',')} m/s: cerca de ${estimate} encontros por minuto. Estimativa; os contatos continuam irregulares.`
    : 'Nenhum material selecionado: só os passos e, se ligados, os brincos.';
}
interactionDensity.addEventListener('input', () => { updateEncounterRate(); updateLayerControls(); updateVisualScene(); });
function selectedMaterials() {
  return Object.fromEntries([...materialChoices].map((choice) => [choice.dataset.materialKind, choice.checked]));
}
function updateLayerControls() {
  for (const choice of materialChoices) layerVolumes.get(choice.dataset.materialKind).disabled = !surfaceReady || !choice.checked || Number(interactionDensity.value) === 0;
}
function updateVisualScene() {
  if (!surfaceReady) {
    visualSummary.textContent = 'Preparando a vista do caminho…';
    return;
  }
  const materialsEnabled = Number(interactionDensity.value) > 0;
  const materials = selectedMaterials();
  const audible = (kind) => materialsEnabled && materials[kind] && Number(layerVolumes.get(kind).value) > 0;
  walkVisual.dataset.flower = String(audible('dry_flower'));
  walkVisual.dataset.leaf = String(audible('dry_leaf'));
  walkVisual.dataset.pebble = String(audible('pebble'));
  walkVisual.dataset.traffic = String(worldTraffic.checked && !isolateContacts.checked && Number(trafficVolume.value) > 0);
  walkVisual.dataset.environment = environmentType.value;
  for (const choice of ambientChoices) {
    const kind = choice.dataset.ambientKind;
    walkVisual.dataset[kind] = String(choice.checked && !isolateContacts.checked && Number(ambientVolumes.get(kind).value) > 0);
  }
  const names = [
    audible('dry_flower') && 'flor seca',
    audible('dry_leaf') && 'folha seca',
    audible('pebble') && 'pedra',
  ].filter(Boolean);
  const ground = names.length ? `Ao caminhar: ${names.join(', ')}` : 'Ao caminhar: só asfalto';
  const world = [
    walkVisual.dataset.traffic === 'true' && 'trânsito ao longe',
    walkVisual.dataset.breeze === 'true' && 'brisa',
    walkVisual.dataset.rain === 'true' && 'chuva',
    walkVisual.dataset.storm === 'true' && 'tempestade',
    walkVisual.dataset.fireplace === 'true' && 'lareira',
  ].filter(Boolean).join(', ') || 'sem sons de ambiente';
  const motion = movementMode.value === 'stationary' ? 'Você está parada' : environmentType.value === 'indoor' ? 'Você circula pelo quarto' : 'Você caminha';
  visualSummary.textContent = `${motion} · ${environmentType.value === 'indoor' ? 'quarto fechado' : 'ar livre'} · ${ground} · ${world}. Vista ilustrativa das escolhas.`;
}
for (const choice of materialChoices) choice.addEventListener('change', () => {
  if (!interactionEngine) return;
  interactionEngine.setEnabledKinds(selectedMaterials());
  updateEncounterRate();
  updateLayerControls();
  updateVisualScene();
});

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
    const sceneConfig = await response.json();
    interactionEngine = new InteractionEngine(sceneConfig);
    if (!sceneConfig.world?.traffic) throw new Error('Configuração de trânsito ausente.');
    steps.setTrafficConfig(sceneConfig.world?.traffic);
    interactionEngine.setEnabledKinds(selectedMaterials());
    steps.setInteractionPlan((step) => interactionEngine.eventsForStep(step, {
      speed: Number(movementSpeed.value),
      position: { x: 0, y: 0, z: movement.positionAt(step.time) },
    }));
    surfaceReady = true;
    interactionDensity.disabled = false;
    for (const choice of materialChoices) choice.disabled = false;
    worldTraffic.disabled = false;
    for (const choice of ambientChoices) choice.disabled = false;
    updateLayerControls();
    updateTrafficAudibility();
    updateEncounterRate();
    interactionStatus.textContent = 'Cena de asfalto pronta. Materiais e frequência mudam os próximos contatos.';
    stepStatus.textContent = 'Cena pronta. Escolha a posição e reproduza.';
    renderMovement(movement.observe(movementTime()));
  } catch {
    interactionStatus.textContent = 'Cena não carregada. Atualize a página para tentar novamente.';
    movementStatus.textContent = 'Cena indisponível.';
    stepStatus.textContent = 'Atualize a página para tentar novamente.';
    visualSummary.textContent = 'Vista indisponível. Atualize a página para tentar novamente.';
  }
}
void loadSurfaceScene();
syncScreen();
