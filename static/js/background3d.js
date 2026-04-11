/**
 * background3d.js - Three.js particle + floating geometry background
 */

(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 30;

  // ─── SVG Gradient for Ring ─────────────────────────────────────────────────
  // (inject into DOM for the score ring SVG)
  const svgNS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(svgNS, 'svg');
  defs.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  defs.innerHTML = `
    <defs>
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00d4ff"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>`;
  document.body.prepend(defs);

  // ─── PARTICLES ─────────────────────────────────────────────────────────────
  const PARTICLE_COUNT = 1200;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  const colorPalette = [
    new THREE.Color(0x00d4ff),
    new THREE.Color(0x7c3aed),
    new THREE.Color(0xe879f9),
    new THREE.Color(0x10b981),
    new THREE.Color(0x1e40af),
  ];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 100;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

    const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particleMat = new THREE.PointsMaterial({
    size: 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ─── FLOATING GEOMETRIC SHAPES ─────────────────────────────────────────────
  const shapes = [];
  const geometries = [
    new THREE.OctahedronGeometry(1.2, 0),
    new THREE.TetrahedronGeometry(1.0, 0),
    new THREE.IcosahedronGeometry(0.9, 0),
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
  ];

  const wireframeMat = (color) => new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });

  const shapeColors = [0x00d4ff, 0x7c3aed, 0xe879f9, 0x10b981, 0x0ea5e9];

  for (let i = 0; i < 14; i++) {
    const geo = geometries[i % geometries.length];
    const mat = wireframeMat(shapeColors[i % shapeColors.length]);
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 20 - 5
    );

    const scale = 0.8 + Math.random() * 2;
    mesh.scale.set(scale, scale, scale);

    mesh.userData = {
      rotX: (Math.random() - 0.5) * 0.008,
      rotY: (Math.random() - 0.5) * 0.008,
      rotZ: (Math.random() - 0.5) * 0.006,
      floatSpeed: 0.0003 + Math.random() * 0.0005,
      floatOffset: Math.random() * Math.PI * 2,
      originY: mesh.position.y,
    };

    scene.add(mesh);
    shapes.push(mesh);
  }

  // ─── MOUSE PARALLAX ────────────────────────────────────────────────────────
  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 0.4;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 0.3;
  });

  // ─── RESIZE ────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── ANIMATION LOOP ────────────────────────────────────────────────────────
  let clock = 0;
  function animate() {
    requestAnimationFrame(animate);
    clock += 0.01;

    // Slowly rotate particle system
    particles.rotation.y = clock * 0.03;
    particles.rotation.x = Math.sin(clock * 0.02) * 0.05;

    // Camera parallax
    camera.position.x += (mouseX * 3 - camera.position.x) * 0.04;
    camera.position.y += (-mouseY * 2 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    // Animate shapes
    shapes.forEach((shape) => {
      const ud = shape.userData;
      shape.rotation.x += ud.rotX;
      shape.rotation.y += ud.rotY;
      shape.rotation.z += ud.rotZ;
      shape.position.y = ud.originY + Math.sin(clock * ud.floatSpeed * 100 + ud.floatOffset) * 2;
    });

    renderer.render(scene, camera);
  }

  animate();
})();

