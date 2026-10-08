/* Heartbeat 2.0 — cinematic particles, with bounded per-frame allocations. */
(function () {
  "use strict";

  const root = document.documentElement;
  const status = document.getElementById("status");
  const fallback = document.getElementById("fallback");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const quality = window.HeartbeatQuality;
  let profile = quality.profile(quality.initialTier());

  if (!window.WebGLRenderingContext || !window.THREE || !window.SimplexNoise) {
    fail("Your browser does not support the 3D experience.");
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 2.55);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(profile.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.className = "experience";
  document.body.appendChild(renderer.domElement);

  const group = new THREE.Group();
  scene.add(group);

  const controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.noPan = true;
  controls.noZoom = false;
  controls.minDistance = 1.55;
  controls.maxDistance = 4;
  controls.rotateSpeed = 1.25;
  controls.zoomSpeed = 0.7;
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.12;

  const simplex = new SimplexNoise();
  const MAX_SAMPLES = 10000;
  const MAX_POINTS = MAX_SAMPLES * 2;
  const bufferPositions = new Float32Array(MAX_POINTS * 3);
  const bufferColors = new Float32Array(MAX_POINTS * 3);
  const base = new Float32Array(MAX_SAMPLES * 3);
  const primaryNoise = new Float32Array(MAX_SAMPLES);
  const secondaryNoise = new Float32Array(MAX_SAMPLES);
  const tolerance = new Float32Array(MAX_SAMPLES);
  const sampleColors = new Float32Array(MAX_SAMPLES * 3);
  const temp = new THREE.Vector3();
  const palette = ["#ffe0f0", "#ff83be", "#f24ba3", "#cb47ca"].map(c => new THREE.Color(c));
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(bufferPositions, 3);
  const colorAttribute = new THREE.BufferAttribute(bufferColors, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setDrawRange(0, 0);

  const uniforms = {
    uPixelRatio: { value: profile.dpr },
    uSize: { value: profile.pointSize },
    uGlow: { value: profile.glow }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader: [
      "attribute vec3 color;",
      "varying vec3 vColor;",
      "uniform float uPixelRatio;",
      "uniform float uSize;",
      "void main() {",
      "  vColor = color;",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  gl_Position = projectionMatrix * mv;",
      "  gl_PointSize = min(24.0, uSize * uPixelRatio * (2.35 / max(0.7, -mv.z)));",
      "}"
    ].join("\n"),
    fragmentShader: [
      "precision mediump float;",
      "varying vec3 vColor;",
      "uniform float uGlow;",
      "void main() {",
      "  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;",
      "  float core = exp(-d*d*30.0);",
      "  float halo = exp(-d*d*5.0);",
      "  float alpha = (core * 0.86 + halo * 0.32 * uGlow) * smoothstep(1.0, 0.4, d);",
      "  if (alpha < 0.008) discard;",
      "  gl_FragColor = vec4(vColor, alpha);",
      "}"
    ].join("\n")
  });
  group.add(new THREE.Points(geometry, material));

  const beat = { a: 0.0 };
  let timeline = null;
  let sampleCount = 0;
  let ready = false;
  let rendering = false;
  let lastFrame = 0;
  let frameId = null;
  const monitor = quality.createMonitor(next => {
    profile = next;
    sampleCount = Math.min(MAX_SAMPLES, next.samples);
    uniforms.uSize.value = next.pointSize;
    uniforms.uGlow.value = next.glow;
    resize();
  });

  function fail(message) {
    if (status) status.textContent = message;
    if (fallback) fallback.hidden = false;
    root.classList.add("failed");
  }

  function initialize(mesh) {
    // The original mesh only supplies points; do not render or deform it each frame.
    mesh.geometry.rotateX(-Math.PI * 0.5);
    mesh.geometry.scale(0.04, 0.04, 0.04);
    mesh.geometry.translate(0, -0.4, 0);
    const sampler = new THREE.MeshSurfaceSampler(mesh).build();

    for (let i = 0; i < MAX_SAMPLES; i++) {
      sampler.sample(temp);
      const k = i * 3;
      base[k] = temp.x;
      base[k + 1] = temp.y;
      base[k + 2] = temp.z;
      primaryNoise[i] = simplex.noise4D(temp.x, temp.y, temp.z, 0.1) + 1.5;
      secondaryNoise[i] = simplex.noise4D(temp.x * 500, temp.y * 500, temp.z * 500, 1) + 1;
      tolerance[i] = Math.random() * 0.03;
      const color = palette[Math.floor(Math.random() * palette.length)];
      sampleColors[k] = color.r;
      sampleColors[k + 1] = color.g;
      sampleColors[k + 2] = color.b;
    }

    // No hardcoded outer mesh draw, so there is no vertex allocation in the render loop.
    sampleCount = profile.samples;
    ready = true;
    root.classList.add("ready");
    if (status) status.textContent = "";
    startHeartbeat();
    start();
  }

  function startHeartbeat() {
    if (timeline) { timeline.kill(); timeline = null; }
    if (reducedMotion.matches) {
      beat.a = 0.13;
      return;
    }
    timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.35 })
      .to(beat, { a: 0.48, duration: 0.23, ease: "power2.out" })
      .to(beat, { a: 0.13, duration: 0.27, ease: "power3.out" })
      .to(beat, { a: 0.36, duration: 0.18, ease: "power2.out" })
      .to(beat, { a: 0, duration: 0.7, ease: "power3.out" });
  }

  function updateParticles() {
    let count = 0;
    // Initial shape uses the same cross-section clipping as the original artwork.
    for (let i = 0; i < sampleCount; i++) {
      const k = i * 3;
      const x = base[k], y = base[k + 1], z = base[k + 2];
      const displacement1 = 1.01 + primaryNoise[i] * 0.15 * beat.a;
      const z1 = z * displacement1;
      const fuzz = tolerance[i];
      if (Math.abs(z1) < 0.115 + fuzz) {
        const j = count * 3;
        bufferPositions[j] = x * displacement1;
        bufferPositions[j + 1] = y * displacement1;
        bufferPositions[j + 2] = z1;
        bufferColors[j] = sampleColors[k];
        bufferColors[j + 1] = sampleColors[k + 1];
        bufferColors[j + 2] = sampleColors[k + 2];
        count++;
      }
      if (Math.abs(z1) < 0.115 + fuzz * 2) {
        const displacement2 = 1 + secondaryNoise[i] * (beat.a + 0.3) - beat.a * 1.2;
        const j = count * 3;
        bufferPositions[j] = x * displacement2;
        bufferPositions[j + 1] = y * displacement2;
        bufferPositions[j + 2] = z * displacement2;
        bufferColors[j] = sampleColors[k] * 0.58;
        bufferColors[j + 1] = sampleColors[k + 1] * 0.68;
        bufferColors[j + 2] = sampleColors[k + 2] * 0.95;
        count++;
      }
    }
    geometry.setDrawRange(0, count);
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  }

  function render(now) {
    if (!rendering) return;
    if (reducedMotion.matches && now - lastFrame < 66) {
      frameId = requestAnimationFrame(render);
      return;
    }
    lastFrame = now;
    if (ready) {
      updateParticles();
      controls.update();
      renderer.render(scene, camera);
      if (!reducedMotion.matches) monitor.tick(now);
    }
    frameId = requestAnimationFrame(render);
  }

  function start() {
    if (rendering || document.hidden) return;
    rendering = true;
    monitor.reset();
    frameId = requestAnimationFrame(render);
  }

  function stop() {
    rendering = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    monitor.reset();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    // Maintain comfortable framing on portrait devices.
    camera.fov = w < h ? 59 : 48;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(profile.dpr);
    renderer.setSize(w, h);
    uniforms.uPixelRatio.value = profile.dpr;
    controls.handleResize();
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
      if (timeline) timeline.pause();
    } else {
      if (timeline && !reducedMotion.matches) timeline.resume();
      start();
    }
  });
  const motionChanged = () => { startHeartbeat(); monitor.reset(); };
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", motionChanged);
  else if (reducedMotion.addListener) reducedMotion.addListener(motionChanged);

  resize();
  new THREE.OBJLoader().load(
    "https://assets.codepen.io/127738/heart_2.obj",
    obj => {
      const mesh = obj.children && obj.children.find(child => child.geometry);
      if (!mesh) { fail("The heart model could not be read."); return; }
      initialize(mesh);
    },
    undefined,
    () => fail("The 3D model could not be loaded. Please try again.")
  );
})();
