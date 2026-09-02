/* ================================================================
   RENOSTTER — VISUALIZADOR 3D DE PINTURA
   ----------------------------------------------------------------
   Substitui o SVG plano do #pinturaModal por um ar-condicionado 3D
   com 34 cores em 4 familias e acabamento brilhante/acetinado.

   Carregado sob demanda (import dinamico) quando o cliente abre o
   modal. A home nao paga o custo do three.js (~700 KB) so por
   existir esta funcionalidade.

   Se WebGL nao existir ou o CDN falhar, o SVG antigo volta a
   aparecer e continua funcionando. Isto e um canal de captacao de
   cliente: ele nunca pode ficar em branco.
   ================================================================ */

let ctx = null;        /* contexto da cena, montado uma unica vez */
let booting = null;    /* trava contra cliques repetidos no botao  */

/* ─── Paleta ───
   Cada familia tem um acabamento sugerido: metalicas e vibrantes
   pedem brilho, neutras e pastel ficam melhores acetinadas. */
const FAMILIES = [
  ['Neutras', 'satin', [
    ['Preto Fosco', '#1c1f24'], ['Preto Piano', '#0c0e11'], ['Grafite', '#3b4148'],
    ['Cinza Nardo', '#7d848c'], ['Prata Polar', '#b9c0c6'], ['Branco Pérola', '#eceff2'],
    ['Branco Gelo', '#dfe4e2'], ['Off-white Linho', '#e2dbcd'],
  ]],
  ['Vibrantes', 'gloss', [
    ['Vermelho Corrida', '#c62828'], ['Vinho Bordeaux', '#7c1f2b'], ['Laranja Renostter', '#e8641a'],
    ['Amarelo Solar', '#e8b224'], ['Verde Lima', '#7fb52a'], ['Verde Britânico', '#1f5c46'],
    ['Azul Cobalto', '#1b4f9c'], ['Azul Petróleo', '#1c4a52'], ['Roxo Ametista', '#5b3a86'],
    ['Rosa Pink', '#c2306e'],
  ]],
  ['Metálicas', 'gloss', [
    ['Grafite Metálico', '#4a5058'], ['Chumbo Metálico', '#5e6670'], ['Champagne', '#c3a674'],
    ['Bronze', '#8a6a44'], ['Cobre Escovado', '#9c5a34'], ['Titânio', '#8d8f8a'],
    ['Azul Aurora', '#3a6ea8'], ['Verde Esmeralda', '#2b7a63'],
  ]],
  ['Decor / Pastel', 'satin', [
    ['Areia Deserto', '#c2a878'], ['Terracota', '#b06a4c'], ['Rosa Quartzo', '#c2758a'],
    ['Verde Sage', '#9aab8e'], ['Azul Serenity', '#93aec6'], ['Lavanda', '#a99bc0'],
    ['Nude', '#d3b7a3'], ['Caramelo', '#a97b45'],
  ]],
];

const COR_INICIAL = { nome: 'Branco Pérola', hex: '#eceff2', acabamento: 'satin' };

/* ─── Deteccao de WebGL ───
   Feita antes de baixar 700 KB de three.js: se o aparelho nao
   renderiza, nao faz sentido gastar a banda do cliente. */
function temWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/* ════════════════════════════════════════════════
   MODELO — split hi-wall, medidas reais em metros
   ════════════════════════════════════════════════ */
function retanguloArredondado(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function construirAC(THREE, corInicial) {
  const W = 0.92, H = 0.30, D = 0.19;   /* largura, altura, profundidade */
  const grupo = new THREE.Group();

  /* Material da pintura: e este objeto que muda de cor e acabamento.
     A referencia sai desta funcao e vive enquanto a cena existir. */
  const pintura = new THREE.MeshStandardMaterial({
    color: new THREE.Color(corInicial),
    roughness: 0.28, metalness: 0.30,
  });
  const plastico = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.85, metalness: 0.05 });
  const vao      = new THREE.MeshStandardMaterial({ color: 0x080a0c, roughness: 1.0,  metalness: 0.0  });
  const led      = new THREE.MeshStandardMaterial({
    color: 0x2bd67b, emissive: 0x2bd67b, emissiveIntensity: 1.6, roughness: 0.4,
  });

  /* Corpo: perfil arredondado extrudado, com bisel para as quinas
     nao ficarem duras sob a luz. */
  const perfil = retanguloArredondado(THREE, W, H, 0.055);
  const geoCorpo = new THREE.ExtrudeGeometry(perfil, {
    depth: D - 0.03, bevelEnabled: true,
    bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 4, curveSegments: 24,
  });
  geoCorpo.center();
  const corpo = new THREE.Mesh(geoCorpo, pintura);
  corpo.name = 'corpo-pintado';
  corpo.castShadow = corpo.receiveShadow = true;
  grupo.add(corpo);

  /* A face frontal fica exatamente em z = D/2 (o bisel recua em X/Y, nao
     em Z). Todo detalhe precisa ficar À FRENTE desse plano, senao some
     dentro do corpo. Foi o erro que quase entregou uma caixa lisa. */
  const zFrente = D / 2;

  /* Grelha de entrada de ar: ripas horizontais no terco superior. */
  const grelha = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const ripa = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.006, 0.004), plastico);
    ripa.position.set(0, H * 0.30 - i * 0.016, zFrente + 0.001);
    grelha.add(ripa);
  }
  grupo.add(grelha);

  /* Saida de ar: rasgo escuro embaixo, com a aleta inclinada dentro.
     E o detalhe que faz o objeto ler como ar-condicionado e nao como
     uma caixa colorida. */
  const rasgo = new THREE.Mesh(new THREE.BoxGeometry(W * 0.80, 0.045, 0.012), vao);
  rasgo.position.set(0, -H * 0.26, zFrente + 0.001);
  grupo.add(rasgo);

  const aleta = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.030, 0.008), plastico);
  aleta.position.set(0, -H * 0.26, zFrente + 0.008);
  aleta.rotation.x = -0.42;
  aleta.castShadow = true;
  grupo.add(aleta);

  /* Visor e LED de operacao. */
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.026, 0.004), plastico);
  visor.position.set(W * 0.30, -H * 0.06, zFrente + 0.001);
  grupo.add(visor);

  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), led);
  luz.position.set(W * 0.36, -H * 0.06, zFrente + 0.006);
  grupo.add(luz);

  return { objeto: grupo, pintura, dimensoes: { W, H, D } };
}

/* ════════════════════════════════════════════════
   CENA
   ════════════════════════════════════════════════ */
async function montarCena(host) {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171b21);

  /* Ambiente: sem environment map, metalness alto renderiza quase
     preto. Como 8 das 34 cores sao metalicas, isso nao e opcional. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
  camera.position.set(0.70, 0.34, 1.26);

  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20242b, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(1.4, 2.0, 1.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 7;
  key.shadow.camera.left = -1.2; key.shadow.camera.right = 1.2;
  key.shadow.camera.top = 1.2;   key.shadow.camera.bottom = -1.2;
  key.shadow.bias = -0.0012;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbdd2ff, 0.55);
  fill.position.set(-1.6, 0.7, -1.1);
  scene.add(fill);

  const { objeto, pintura } = construirAC(THREE, COR_INICIAL.hex);
  scene.add(objeto);

  /* Sombra de contato: da peso ao objeto sem desenhar um chao. */
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShadowMaterial({ opacity: 0.34 })
  );
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.28;
  chao.receiveShadow = true;
  scene.add(chao);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;          /* produto: girar e aproximar bastam */
  controls.minDistance = 0.65;
  controls.maxDistance = 2.2;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI / 1.85;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;
  controls.target.set(0, 0, 0);
  /* O giro automatico e um convite, nao uma teimosia: para no
     primeiro toque do cliente e nao volta. */
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  function ajustar() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  ajustar();
  const ro = new ResizeObserver(ajustar);
  ro.observe(host);

  let rodando = false, raf = 0;
  function loop() {
    if (!rodando) return;
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    THREE, pintura, controls, renderer,
    iniciar() { if (!rodando) { rodando = true; ajustar(); loop(); } },
    /* Com o modal fechado o loop para: sem isso a GPU do celular
       fica desenhando um objeto invisivel e o aparelho esquenta. */
    parar() { rodando = false; cancelAnimationFrame(raf); },
  };
}

/* ════════════════════════════════════════════════
   PALETA (interface)
   ════════════════════════════════════════════════ */
function montarPaleta(ctx) {
  const alvo   = document.getElementById('p3dPalette');
  const nomeEl = document.getElementById('p3dColorName');
  const hexEl  = document.getElementById('p3dColorHex');
  const acabEl = document.getElementById('p3dFinish');
  if (!alvo) return;

  alvo.innerHTML = '';

  function aplicarAcabamento(tipo) {
    acabEl?.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.finish === tipo)));
    const brilhante = tipo === 'gloss';
    ctx.pintura.roughness = brilhante ? 0.20 : 0.55;
    ctx.pintura.metalness = brilhante ? 0.34 : 0.16;
    ctx.pintura.needsUpdate = true;
  }

  function selecionar(nome, hex, acabamento, botao) {
    ctx.pintura.color.set(hex);
    if (nomeEl) nomeEl.textContent = nome;
    if (hexEl)  hexEl.textContent  = hex.toUpperCase();
    alvo.querySelectorAll('.p3d-sw').forEach(b => b.setAttribute('aria-pressed', 'false'));
    botao?.setAttribute('aria-pressed', 'true');
    aplicarAcabamento(acabamento);
    /* Repassa para o site: libera o cupom, dispara o gtag e guarda a
       cor escolhida para entrar na mensagem do WhatsApp. */
    window.__pinturaCorEscolhida?.(nome, hex);
  }

  FAMILIES.forEach(([familia, acabamento, cores]) => {
    const linha = document.createElement('div');
    linha.className = 'p3d-fam';

    const rotulo = document.createElement('span');
    rotulo.className = 'p3d-fam-label';
    rotulo.textContent = familia;

    const caixa = document.createElement('div');
    caixa.className = 'p3d-swatches';

    cores.forEach(([nome, hex]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'p3d-sw';
      b.style.background = hex;
      b.title = `${nome} · ${hex.toUpperCase()}`;
      b.setAttribute('aria-label', `Aplicar cor ${nome}`);
      b.setAttribute('aria-pressed', String(hex === COR_INICIAL.hex));
      b.addEventListener('click', () => selecionar(nome, hex, acabamento, b));
      caixa.appendChild(b);
    });

    linha.append(rotulo, caixa);
    alvo.appendChild(linha);
  });

  acabEl?.addEventListener('click', e => {
    const b = e.target.closest('button[data-finish]');
    if (b) aplicarAcabamento(b.dataset.finish);
  });

  aplicarAcabamento(COR_INICIAL.acabamento);
}

/* ════════════════════════════════════════════════
   API PUBLICA
   ════════════════════════════════════════════════ */
function cairParaSVG(motivo) {
  console.warn('[Pintura3D] usando o simulador 2D:', motivo);
  document.getElementById('p3dStage')?.classList.add('p3d-oculto');
  document.getElementById('p3dPanel')?.classList.add('p3d-oculto');
  document.getElementById('p3dFallback')?.classList.remove('p3d-oculto');
  document.getElementById('pmSwatches')?.classList.remove('p3d-oculto');
}

export async function abrirPintura3D() {
  const host = document.getElementById('p3dStage');
  if (!host) return;

  if (ctx) { ctx.iniciar(); return; }
  if (booting) return booting;

  if (!temWebGL()) { cairParaSVG('sem suporte a WebGL'); return; }

  host.classList.add('p3d-carregando');
  booting = (async () => {
    try {
      ctx = await montarCena(host);
      montarPaleta(ctx);
      ctx.iniciar();
    } catch (err) {
      ctx = null;
      cairParaSVG(err?.message || String(err));
    } finally {
      host.classList.remove('p3d-carregando');
      booting = null;
    }
  })();
  return booting;
}

export function fecharPintura3D() {
  ctx?.parar();
}
