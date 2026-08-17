/**
 * Banco de pruebas del motor de física de TURBO GOL.
 *
 * No duplica el código: extrae las funciones reales de index.html y las ejecuta.
 * Si el motor cambia, la prueba prueba el motor nuevo — nunca una copia obsoleta.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as THREE from 'three';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const game = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g, '');

/** Recorta un tramo del código fuente entre dos marcadores literales. */
function cut(from, to) {
  const i = game.indexOf(from);
  if (i < 0) throw new Error(`marcador no encontrado: ${from}`);
  const j = game.indexOf(to, i);
  if (j < 0) throw new Error(`marcador de cierre no encontrado: ${to}`);
  return game.slice(i, j);
}

const source = [
  cut('const S=1/50;', 'const CAR={'),              // A, BALL
  cut('const WALLS=[];{', 'const inMouth='),        // planos + vectores de trabajo
  cut('const inMouth=', '/* predicción compartida') // inMouth, segCollide, contactSpin, ballStep
].join('\n');

// Dependencias que el motor espera del entorno del navegador.
const preamble = `
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const Snd = { wall() {} };
function spawnP() {}
`;

const { A, BALL, ballStep } = new Function('THREE', `
  ${preamble}
  ${source}
  return { A, BALL, ballStep };
`)(THREE);

/* ── utilidades de aserción ── */
let failures = 0;
function check(condition, label, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const STEP = 1 / 120;
const { Vector3 } = THREE;

/* ── 1. contención, estabilidad y goles ── */
{
  const TRIALS = 6000, MAX_STEPS = 700;
  const pos = new Vector3(), vel = new Vector3(), spin = new Vector3();
  let escapes = 0, nonFinite = 0, goals = 0, worstBreach = 0, peakSpin = 0, steps = 0;

  for (let t = 0; t < TRIALS; t++) {
    pos.set((Math.random() * 2 - 1) * 95, BALL.r + Math.random() * 32, (Math.random() * 2 - 1) * 74);
    vel.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
       .normalize().multiplyScalar(55 + Math.random() * 65);
    spin.set(0, 0, 0);

    for (let i = 0; i < MAX_STEPS; i++) {
      ballStep(pos, vel, spin, STEP, false);
      steps++;

      if (!Number.isFinite(pos.x + pos.y + pos.z + vel.x + spin.x)) { nonFinite++; break; }
      peakSpin = Math.max(peakSpin, spin.length());

      // Distancia fuera del octágono: paredes largas, cortas y chaflanes.
      const breach = Math.max(
        Math.abs(pos.x) - A.hx,
        Math.abs(pos.z) - A.hz,
        (Math.abs(pos.x) + Math.abs(pos.z)) * Math.SQRT1_2 - A.diag
      );
      const insideGoal = Math.abs(pos.x) > A.hx
        && Math.abs(pos.z) < A.goalW + 0.1
        && pos.y < A.goalH + 0.1;

      if (!insideGoal && breach > 0.6) { escapes++; worstBreach = Math.max(worstBreach, breach); break; }
      if (pos.y < -1 || pos.y > A.ceil + 1) { escapes++; break; }
      if (Math.abs(pos.x) - BALL.r > A.hx && Math.abs(pos.z) < A.goalW && pos.y < A.goalH) { goals++; break; }
    }
  }

  check(escapes === 0, 'el balón nunca escapa de la arena',
    `${TRIALS} trayectorias, invasión máxima ${worstBreach.toFixed(3)} u`);
  check(nonFinite === 0, 'sin NaN ni Infinity', `${(steps / 1e6).toFixed(2)} M de pasos integrados`);
  check(peakSpin <= BALL.spinMax + 1e-6, 'el giro respeta su tope',
    `pico ${peakSpin.toFixed(3)} / ${BALL.spinMax} rad/s`);
  check(goals > 0, 'la línea de gol registra', `${goals} goles entre disparos aleatorios`);
}

/* ── 2. efecto Magnus ── */
{
  const shoot = (spinY) => {
    const p = new Vector3(-60, BALL.r + 6, 0);
    const v = new Vector3(70, 4, 0);
    const w = new Vector3(0, spinY, 0);
    for (let i = 0; i < 180; i++) ballStep(p, v, w, STEP, false);
    return p.z;
  };
  const straight = shoot(0);
  const curved = shoot(BALL.spinMax);
  const drift = Math.abs(curved - straight);

  check(Math.abs(straight) < 0.01, 'sin giro el tiro va recto', `desvío ${straight.toFixed(4)} u`);
  check(drift > 3, 'el giro curva la trayectoria', `desvío ${drift.toFixed(2)} u con giro máximo`);
}

/* ── 3. reposo: el balón se asienta sobre el suelo ── */
{
  const p = new Vector3(0, 40, 0), v = new Vector3(), w = new Vector3();
  for (let i = 0; i < 1200; i++) ballStep(p, v, w, STEP, false);
  check(Math.abs(p.y - BALL.r) < 0.05, 'el balón reposa a su radio del suelo',
    `y = ${p.y.toFixed(4)}, radio = ${BALL.r.toFixed(4)}`);
  check(Math.abs(v.y) < 1.5, 'el rebote converge', `vy = ${v.y.toFixed(3)}`);
}

console.log(failures === 0 ? '\n🟢 MOTOR DE FÍSICA VERIFICADO' : `\n🔴 ${failures} PRUEBA(S) FALLIDA(S)`);
process.exit(failures === 0 ? 0 : 1);
