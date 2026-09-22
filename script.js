// THREE is loaded globally via index.html

const EARTH_RADIUS_KM = 6371;
const EARTH_MU = 398600.4418;
const PLANETS = {
  Earth: { gravity: 9.81, muScale: 1, color: 0x2e86de, atmosphere: 0x50d8ff },
  Moon: { gravity: 1.62, muScale: 0.0123, color: 0xb8beca, atmosphere: 0xcfd8e8 },
  Mars: { gravity: 3.71, muScale: 0.107, color: 0xd46a3c, atmosphere: 0xff9b6b },
  Jupiter: { gravity: 24.79, muScale: 317.8, color: 0xd8a86a, atmosphere: 0xffd166 }
};

const state = {
  planet: 'Earth',
  running: true,
  sound: false,
  elapsed: 0,
  lastOutcome: ''
};

const el = {
  container: document.getElementById('canvas-container'),
  velocity: document.getElementById('velocitySlider'),
  angle: document.getElementById('angleSlider'),
  mass: document.getElementById('massSlider'),
  gravity: document.getElementById('gravitySlider'),
  velocityValue: document.getElementById('velocityValue'),
  angleValue: document.getElementById('angleValue'),
  massValue: document.getElementById('massValue'),
  gravityValue: document.getElementById('gravityValue'),
  orbitState: document.getElementById('orbitState'),
  liveVelocity: document.getElementById('liveVelocity'),
  liveAltitude: document.getElementById('liveAltitude'),
  liveAcceleration: document.getElementById('liveAcceleration'),
  liveForce: document.getElementById('liveForce'),
  liveTime: document.getElementById('liveTime'),
  circular: document.getElementById('circularNumber'),
  escape: document.getElementById('escapeNumber'),
  energy: document.getElementById('energyNumber'),
  lesson: document.getElementById('lessonText'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  play: document.getElementById('playBtn'),
  reset: document.getElementById('resetBtn'),
  screenshot: document.getElementById('screenshotBtn'),
  sound: document.getElementById('soundToggle'),
  theme: document.getElementById('themeToggle'),
  save: document.getElementById('saveBtn'),
  planetPicker: document.getElementById('planetPicker'),
  planetGravity: document.getElementById('planetGravity'),
  jumpHeight: document.getElementById('jumpHeight'),
  fallSpeed: document.getElementById('fallSpeed'),
  projectileRange: document.getElementById('projectileRange')
};

if (localStorage.getItem('gml-theme') === 'light') document.body.classList.add('light');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x060817, 18, 42);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
camera.position.set(0, 8.4, 13.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
el.container.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const ambient = new THREE.AmbientLight(0x8fb3ff, 0.62);
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(9, 10, 7);
scene.add(ambient, sun);

const planetMaterial = new THREE.MeshStandardMaterial({
  color: PLANETS.Earth.color,
  roughness: 0.72,
  metalness: 0.05,
  emissive: 0x061d36,
  emissiveIntensity: 0.2
});
const planet = new THREE.Mesh(new THREE.SphereGeometry(2.2, 96, 96), planetMaterial);
scene.add(planet);

const atmosphereMaterial = new THREE.MeshBasicMaterial({
  color: PLANETS.Earth.atmosphere,
  transparent: true,
  opacity: 0.13
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.32, 96, 96), atmosphereMaterial);
scene.add(atmosphere);

const satellite = new THREE.Group();
satellite.add(new THREE.Mesh(
  new THREE.SphereGeometry(0.13, 28, 28),
  new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.28, metalness: 0.42, emissive: 0x192746, emissiveIntensity: 0.3 })
));
const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x78f2a8, roughness: 0.42, metalness: 0.22, emissive: 0x133822, emissiveIntensity: 0.25 });
const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.18), panelMaterial);
const rightPanel = leftPanel.clone();
leftPanel.position.x = -0.4;
rightPanel.position.x = 0.4;
satellite.add(leftPanel, rightPanel);
scene.add(satellite);

const pathMaterial = new THREE.LineBasicMaterial({ color: 0x50d8ff, transparent: true, opacity: 0.86 });
const pathGeometry = new THREE.BufferGeometry();
const pathLine = new THREE.Line(pathGeometry, pathMaterial);
scene.add(pathLine);

const trailMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 });
const trailGeometry = new THREE.BufferGeometry();
const trailLine = new THREE.Line(trailGeometry, trailMaterial);
scene.add(trailLine);

const stars = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 760; i += 1) {
  const radius = 18 + Math.random() * 28;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos((Math.random() * 2) - 1);
  starPositions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
}
stars.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.78 })));

let orbitPoints = [];
let trailPoints = [];
let angle = 0;
let audioContext;

function getPhysics() {
  const planetData = PLANETS[state.planet];
  const velocity = Number(el.velocity.value);
  const launchAngle = Number(el.angle.value);
  const objectMass = Number(el.mass.value);
  const gravityScale = Number(el.gravity.value);
  const altitude = 400;
  const radius = EARTH_RADIUS_KM + altitude;
  const mu = EARTH_MU * planetData.muScale * gravityScale;
  const circular = Math.sqrt(mu / radius);
  const escape = Math.sqrt(2 * mu / radius);
  const gravityAccel = planetData.gravity * gravityScale * (EARTH_RADIUS_KM / radius) ** 2;
  const ratio = circular > 0 ? velocity / circular : 99;
  const energyPerKg = (velocity ** 2 / 2) - (mu / radius);
  const kineticGJ = 0.5 * objectMass * (velocity * 1000) ** 2 / 1e9;
  const force = objectMass * gravityAccel;

  return { planetData, velocity, launchAngle, objectMass, gravityScale, altitude, radius, mu, circular, escape, gravityAccel, ratio, energyPerKg, kineticGJ, force };
}

function classifyOrbit(p) {
  const anglePenalty = Math.abs(p.launchAngle) / 80;
  if (p.gravityScale < 0.08) {
    return { state: 'Drifting', type: 'Weak gravity', color: 0xa78bfa, lesson: 'Gravity is very weak, so velocity dominates and the probe drifts with only a gentle curve.' };
  }
  if (p.velocity >= p.escape) {
    return { state: 'Escape', type: 'Hyperbola', color: 0xffd166, lesson: 'Velocity exceeds escape velocity. Gravity still bends the path, but the probe has enough energy to leave the planet.' };
  }
  if (p.velocity < p.circular * (0.68 + anglePenalty)) {
    return { state: 'Crash / fall back', type: 'Sub-orbital', color: 0xff6b6b, lesson: 'The velocity is too low, so gravity pulls the object back toward the planet before it can keep missing the surface.' };
  }
  if (Math.abs(p.ratio - 1) < 0.09 && Math.abs(p.launchAngle) < 12) {
    return { state: 'Stable orbit', type: 'Circle', color: 0x78f2a8, lesson: 'The sideways velocity is near orbital velocity. Gravity provides inward acceleration while the probe keeps falling around the planet.' };
  }
  return { state: p.ratio > 1 ? 'High ellipse' : 'Low ellipse', type: 'Ellipse', color: 0x50d8ff, lesson: 'The probe is captured, but the speed is not perfectly circular. The result is an elliptical orbit.' };
}

function orbitPosition(theta, physics, outcome) {
  const tilt = THREE.MathUtils.degToRad(physics.launchAngle);
  const base = 3.35;
  if (outcome.type === 'Hyperbola' || outcome.type === 'Weak gravity') {
    const t = (theta % (Math.PI * 2)) - Math.PI;
    const bend = outcome.type === 'Weak gravity' ? 0.06 : 0.22;
    const x = t * (1.55 + physics.velocity / 16);
    const z = bend * (t ** 2) + base * 0.55;
    return new THREE.Vector3(x * Math.cos(tilt) - z * Math.sin(tilt), 0, x * Math.sin(tilt) + z * Math.cos(tilt));
  }
  if (outcome.type === 'Sub-orbital') {
    const t = theta % Math.PI;
    const height = THREE.MathUtils.clamp(physics.velocity / Math.max(physics.circular, 0.1), 0.25, 1.1);
    const r = 2.24 + Math.sin(t) * (base * height - 2.08);
    const x = Math.cos(t + Math.PI * 0.08) * r;
    const z = Math.sin(t + Math.PI * 0.08) * r;
    return new THREE.Vector3(x * Math.cos(tilt) - z * Math.sin(tilt), 0, x * Math.sin(tilt) + z * Math.cos(tilt));
  }
  const stretch = THREE.MathUtils.clamp(Math.abs(physics.ratio - 1) * 1.55 + Math.abs(physics.launchAngle) / 115, 0, 0.94);
  const a = base * (1 + stretch);
  const b = base * (1 - stretch * 0.36);
  const offset = physics.ratio > 1 ? stretch * 1.2 : -stretch * 0.9;
  const x = Math.cos(theta) * a + offset;
  const z = Math.sin(theta) * b;
  return new THREE.Vector3(x * Math.cos(tilt) - z * Math.sin(tilt), 0, x * Math.sin(tilt) + z * Math.cos(tilt));
}

function buildPath() {
  const physics = getPhysics();
  const outcome = classifyOrbit(physics);
  orbitPoints = [];
  const steps = outcome.type === 'Sub-orbital' ? 88 : 210;
  const span = outcome.type === 'Sub-orbital' ? Math.PI : Math.PI * 2;
  for (let i = 0; i <= steps; i += 1) orbitPoints.push(orbitPosition((i / steps) * span, physics, outcome));
  pathGeometry.setFromPoints(orbitPoints);
  pathMaterial.color.setHex(outcome.color);
  trailPoints = [];
  angle = 0;
  state.elapsed = 0;
}

function updateReadouts() {
  const p = getPhysics();
  const outcome = classifyOrbit(p);
  const altitudeLive = Math.max(0, (satellite.position.length() - 2.2) * 900);
  el.velocityValue.textContent = `${p.velocity.toFixed(1)} km/s`;
  el.angleValue.textContent = `${p.launchAngle.toFixed(0)}°`;
  el.massValue.textContent = `${p.objectMass.toLocaleString()} kg`;
  el.gravityValue.textContent = `${p.gravityScale.toFixed(2)}x`;
  el.orbitState.textContent = outcome.state;
  el.liveVelocity.textContent = `${p.velocity.toFixed(2)} km/s`;
  el.liveAltitude.textContent = `${altitudeLive.toFixed(0)} km`;
  el.liveAcceleration.textContent = `${p.gravityAccel.toFixed(2)} m/s2`;
  el.liveForce.textContent = `${(p.force / 1000).toFixed(2)} kN`;
  el.liveTime.textContent = `${state.elapsed.toFixed(1)} s`;
  el.circular.textContent = Number.isFinite(p.circular) ? `${p.circular.toFixed(2)} km/s` : '0.00 km/s';
  el.escape.textContent = Number.isFinite(p.escape) ? `${p.escape.toFixed(2)} km/s` : '0.00 km/s';
  el.energy.textContent = `${p.kineticGJ.toFixed(1)} GJ`;
  el.lesson.textContent = outcome.lesson;

  if (outcome.state !== state.lastOutcome) {
    state.lastOutcome = outcome.state;
  }

  window.gravityLabState = { ...p, ...outcome, planet: state.planet, altitude: altitudeLive };
  updateProgress();
}

function updatePlanetLab() {
  const g = PLANETS[state.planet].gravity * Number(el.gravity.value);
  el.planetGravity.textContent = `${g.toFixed(2)} m/s2`;
  el.jumpHeight.textContent = `${(5 / g).toFixed(2)} m`;
  el.fallSpeed.textContent = `${(g * 3).toFixed(1)} m/s`;
  el.projectileRange.textContent = `${((20 * 20) / g).toFixed(1)} m`;
}

function renderPlanets() {
  el.planetPicker.innerHTML = '';
  Object.keys(PLANETS).forEach((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.className = name === state.planet ? 'active' : '';
    button.addEventListener('click', () => {
      state.planet = name;
      const data = PLANETS[name];
      planetMaterial.color.setHex(data.color);
      atmosphereMaterial.color.setHex(data.atmosphere);
      sessionStorage.setItem('used-planet-lab', '1');
      renderPlanets();
      buildPath();
      updateReadouts();
      updatePlanetLab();
      playTone(420);
    });
    el.planetPicker.appendChild(button);
  });
}

function updateProgress() {
  const sim = Number(sessionStorage.getItem('used-sim') || 0);
  const tutor = Number(sessionStorage.getItem('asked-tutor') || 0);
  const planetLab = Number(sessionStorage.getItem('used-planet-lab') || 0);
  const quizDone = window.gravityQuizAnswered || 0;
  const score = Math.min(100, sim * 30 + tutor * 25 + planetLab * 20 + Math.min(25, quizDone * 6));
  el.progressFill.style.width = `${score}%`;
  el.progressText.textContent = `${score}% complete`;
  syncProgressWhenModulesChange(score);
}

function persistProgress() {
  localStorage.setItem('gml-progress', el.progressFill.style.width || '0%');
  if (window.GravityFirestore) window.GravityFirestore.saveProgress(Number.parseInt(el.progressFill.style.width, 10) || 0);
}

let lastSyncedModules = '';

function syncProgressWhenModulesChange(score) {
  if (!window.GravityFirestore) return;
  const completedModules = window.GravityFirestore.getCompletedModules();
  const nextModules = completedModules.join('|');
  if (nextModules === lastSyncedModules) return;
  lastSyncedModules = nextModules;
  window.GravityFirestore.saveProgress(score);
}

function playTone(frequency = 260) {
  if (!state.sound) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.24);
}

function resize() {
  const width = el.container.clientWidth;
  const height = el.container.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const p = getPhysics();
  const outcome = classifyOrbit(p);

  if (state.running) {
    angle += delta * THREE.MathUtils.clamp(p.ratio || 0.6, 0.18, 2.6) * 0.78;
    state.elapsed += delta * 12;
    const position = orbitPosition(angle, p, outcome);
    satellite.position.copy(position);
    satellite.lookAt(0, 0, 0);
    satellite.rotateY(Math.PI / 2);
    planet.rotation.y += delta * 0.13;
    atmosphere.rotation.y -= delta * 0.04;
    trailPoints.push(position.clone());
    if (trailPoints.length > 86) trailPoints.shift();
    trailGeometry.setFromPoints(trailPoints);
  }

  const zoom = outcome.type === 'Hyperbola' ? 14.8 : 13.2;
  camera.position.z += (zoom - camera.position.z) * 0.02;
  updateReadouts();
  renderer.render(scene, camera);
}

function drawParticles() {
  const canvas = document.getElementById('particleField');
  const context = canvas.getContext('2d');
  const particles = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.8 + 0.3, v: Math.random() * 0.18 + 0.04 }));
  function fit() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }
  function frame() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.y += p.v / 1000;
      if (p.y > 1) p.y = 0;
      context.beginPath();
      context.fillStyle = `rgba(80, 216, 255, ${0.22 + p.s / 5})`;
      context.arc(p.x * canvas.width, p.y * canvas.height, p.s * devicePixelRatio, 0, Math.PI * 2);
      context.fill();
    });
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', fit);
  fit();
  frame();
}

  Object.values({ velocity: el.velocity, angle: el.angle, mass: el.mass, gravity: el.gravity }).forEach((control) => {
  control.addEventListener('input', () => {
    sessionStorage.setItem('used-sim', '1');
    buildPath();
    updateReadouts();
    updatePlanetLab();
    playTone(220 + Number(el.velocity.value) * 18);
  });
});

el.play.addEventListener('click', () => {
  state.running = !state.running;
  el.play.textContent = state.running ? 'Pause' : 'Play';
});

el.reset.addEventListener('click', () => {
  el.velocity.value = 7.9;
  el.angle.value = 0;
  el.mass.value = 1000;
  el.gravity.value = 1;
  state.running = true;
  el.play.textContent = 'Pause';
  buildPath();
  updateReadouts();
  updatePlanetLab();
});

el.screenshot.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'gravity-motion-lab.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
});

el.sound.addEventListener('click', () => {
  state.sound = !state.sound;
  el.sound.textContent = state.sound ? '♫' : '♪';
  playTone(520);
});

el.theme.addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('gml-theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

el.save.addEventListener('click', () => {
  persistProgress();
  el.save.textContent = 'Saved';
  setTimeout(() => { el.save.textContent = 'Save Progress'; }, 1100);
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.querySelectorAll('.label-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const answer = document.getElementById('basicAnswer');
    answer.innerHTML = `<b>${chip.dataset.title}</b>${chip.dataset.summary}`;
    sessionStorage.setItem('completed-basics', '1');
    updateProgress();
  });
});

window.addEventListener('resize', resize);
window.updateGravityProgress = updateProgress;
window.addEventListener('gravity-progress-loaded', updateProgress);

renderPlanets();
drawParticles();
resize();
buildPath();
updateReadouts();
updatePlanetLab();
animate();
