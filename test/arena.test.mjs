/**
 * Banco de la arena curva y de la conducción sobre superficies.
 *
 * Igual que physics.test.mjs: no duplica el código, extrae de index.html las funciones
 * reales — aquí también carArena/alignSurface/stepCar — y conduce un coche de verdad.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as THREE from 'three';

const here = dirname(fileURLToPath(import.meta.url));
const game = readFileSync(join(here, '..', 'index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g, '');

function cut(from, to) {
  const i = game.indexOf(from);
  if (i < 0) throw new Error(`marcador no encontrado: ${from}`);
  const j = game.indexOf(to, i);
  if (j < 0) throw new Error(`marcador de cierre no encontrado: ${to}`);
  return game.slice(i, j);
}

const source = [
  cut('const S=1/50;', 'const TEAM=['),                                 // A, BALL, CAR
  cut('const WALLS=[];{', 'const inMouth='),                            // planos, temporales, fillet
  cut('const inMouth=', '/* predicción compartida'),                    // inMouth, ballStep…
  cut('const _gn=new V3(0,1,0);', '/* ═══════════════ COCHE ↔ BALÓN'),   // carArena, alignSurface, stepCar
].join('\n');

// Lo que el motor espera del navegador y del resto del juego.
const preamble = `
const V3=THREE.Vector3,Q=THREE.Quaternion;
const clamp=(v,a,b)=>(v<a?a:v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>a+Math.random()*(b-a);
const Snd={wall(){},jump(){},flip(){},pad(){}};
const pads=[];
const state={mode:1,infBoost:false};
function spawnP(){}
function respawn(){}
`;

const { A, BALL, CAR, ballStep, fillet, stepCar } = new Function('THREE', `
  ${preamble}
  ${source}
  return { A, BALL, CAR, ballStep, fillet, stepCar };
`)(THREE);

/* ── utilidades ── */
let failures = 0;
function check(condition, label, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}
const STEP = 1 / 120;
const { Vector3, Quaternion } = THREE;

function makeCar(x, y, z) {
  return { team: 0, isAI: false,
    mesh: { visible: true, position: new Vector3(), quaternion: new Quaternion(),
            userData: { wheels: [], flames: [], light: { intensity: 0 } } },
    pos: new Vector3(x, y, z), vel: new Vector3(), quat: new Quaternion(), ang: new Vector3(),
    boost: 100, onSurf: false, onGround: false, surfN: new Vector3(0, 1, 0),
    jumps: 0, canFlip: false, jumpT: 0, holdJ: 0, flipT: 0, flipDir: new Vector3(),
    dead: 0, sonic: false, prevJump: false, uprightT: 0,
    stats: { goals: 0, shots: 0, saves: 0, boost: 0, demos: 0 },
    in: { th: 0, st: 0, boost: false, jump: false, drift: false, pitch: 0, yaw: 0, roll: 0 } };
}
const drive = (c, secs, input) => {
  for (let i = Math.round(secs / STEP); i > 0; i--) { Object.assign(c.in, input); stepCar(c, STEP); }
};
const carUp = c => new Vector3(0, 1, 0).applyQuaternion(c.quat);

console.log(`curva ${A.fill.toFixed(2)} u · pared ${A.ceil.toFixed(2)} u · ` +
  `engancha a ${CAR.stickOn} u/s, suelta a ${CAR.stickOff} u/s\n`);

/* ── 1. la curva es tangente al suelo y a la pared: sin escalón ── */
{
  const w = { n: new Vector3(0, 0, 1), d: A.hz };
  const arriba = fillet(new Vector3(0, A.fill, A.hz - BALL.r), w, A.fill, -1);
  const abajo = fillet(new Vector3(0, BALL.r, A.hz - A.fill), w, A.fill, -1);
  check(Math.abs(arriba + BALL.r - A.fill) < 1e-9, 'la curva empalma con la pared sin escalón',
    `penetración ${(arriba + BALL.r - A.fill).toExponential(1)}`);
  check(Math.abs(abajo + BALL.r - A.fill) < 1e-9, 'y con el suelo sin escalón',
    `penetración ${(abajo + BALL.r - A.fill).toExponential(1)}`);
}

/* ── 2. el balón sube por la curva y vuelve a la cancha ── */
{
  const p = new Vector3(0, BALL.r, A.hz - A.fill - 4), v = new Vector3(0, 0, 13), w = new Vector3();
  let maxY = 0;
  for (let i = 0; i < 240; i++) { ballStep(p, v, w, STEP, false); maxY = Math.max(maxY, p.y); }
  check(maxY > BALL.r + 1.5, 'el balón sube por la curva en vez de rebotar en seco',
    `altura máx ${maxY.toFixed(2)} u`);

  p.set(0, A.fill * .5, A.hz - A.fill * .5); v.set(0, 0, 0); w.set(0, 0, 0);
  for (let i = 0; i < 1800; i++) ballStep(p, v, w, STEP, false);
  check(Math.abs(p.y - BALL.r) < .05 && p.z < A.hz - A.fill,
    'soltado en la curva rueda hasta la cancha', `y = ${p.y.toFixed(3)}, z = ${p.z.toFixed(2)}`);
}

/* ── 3. un tiro raso sigue entrando: la curva no tapa la boca ── */
{
  const p = new Vector3(A.hx - 22, BALL.r, 0), v = new Vector3(75, 0, 0), w = new Vector3();
  let gol = false;
  for (let i = 0; i < 400 && !gol; i++) { ballStep(p, v, w, STEP, false); gol = p.x - BALL.r > A.hx; }
  check(gol, 'la curva no tapa la boca de la portería', `x final ${p.x.toFixed(2)}`);
}

/* ── 4. el coche sube la curva y conduce por la pared ── */
{
  const c = makeCar(0, CAR.hh, A.hz - 60);           // quat identidad = mirando a +Z
  drive(c, 2.4, { th: 1, boost: true });
  check(c.pos.y > A.fill && c.pos.y < A.ceil - A.fill, 'el coche sube la curva y sigue por la pared',
    `y = ${c.pos.y.toFixed(2)} u`);
  check(c.onSurf && Math.abs(c.surfN.y) < .1, 'va pegado, con la normal de la pared',
    `surfN.y = ${c.surfN.y.toFixed(2)}`);
  check(carUp(c).z < -.9, 'y tumbado contra ella', `arriba·z = ${carUp(c).z.toFixed(2)}`);
}

/* ── 5. techo: se aguanta con gas y la gravedad acaba tirándolo ── */
{
  const c = makeCar(0, CAR.hh, A.hz - 60);
  drive(c, 6.0, { th: 1, boost: true });
  const enTecho = c.onSurf && c.surfN.y < -.5;
  check(enTecho, 'llega al techo conduciendo y se queda pegado',
    `y = ${c.pos.y.toFixed(2)} / ${A.ceil.toFixed(2)}, surfN.y = ${c.surfN.y.toFixed(2)}`);

  const yTecho = c.pos.y;
  let vSuelta = null;
  for (let t = 0; t < 6 && vSuelta === null; t += .1) {
    drive(c, .1, { th: 0, boost: false });
    if (!c.onSurf && c.pos.y < yTecho - 1) vSuelta = c.vel.length();
  }
  check(vSuelta !== null, 'al frenar, la gravedad lo despega del techo',
    vSuelta === null ? `sigue arriba a ${c.vel.length().toFixed(1)} u/s` : `se suelta a ${vSuelta.toFixed(1)} u/s`);
  drive(c, 3, { th: 0 });
  check(c.pos.y < 5, 'y cae hasta la cancha', `y = ${c.pos.y.toFixed(2)} u`);
}

/* ── 6. en campo abierto el suelo sigue siendo suelo ── */
{
  const c = makeCar(0, 30, 0);
  drive(c, 3, { th: 0 });
  check(Math.abs(c.pos.y - CAR.hh) < .05 && c.onSurf && c.surfN.y > .99,
    'en campo abierto cae y reposa plano', `y = ${c.pos.y.toFixed(3)}`);
}

/* ── 7. la holgura de suspensión no puede tragarse el salto ── */
{
  const c = makeCar(0, CAR.hh, 0);
  drive(c, .5, { th: 1 });
  drive(c, .1, { th: 1, jump: true });
  let alto = 0;
  for (let i = 0; i < 90; i++) { Object.assign(c.in, { th: 1, jump: false }); stepCar(c, STEP); alto = Math.max(alto, c.pos.y); }
  check(alto > CAR.hh + 1.2, 'el salto sigue despegando del suelo', `altura máx ${alto.toFixed(2)} u`);
  drive(c, 2, { th: 1 });
  check(Math.abs(c.pos.y - CAR.hh) < .05 && c.onSurf, 'y vuelve a aterrizar', `y = ${c.pos.y.toFixed(3)}`);
}

/* ── 8. el volante gira hacia donde toca ── */
{
  const giro = (st) => {
    const c = makeCar(0, CAR.hh, 0);
    drive(c, 1, { th: 1 });
    const h1 = c.vel.clone().normalize();
    drive(c, .8, { th: 1, st });
    const h2 = c.vel.clone().normalize();
    return h1.z * h2.x - h1.x * h2.z;                // > 0 = gira a la izquierda
  };
  check(giro(-1) < -.05, 'D (st = -1 al salir de readInput) gira a la derecha', `cruz = ${giro(-1).toFixed(3)}`);
  check(giro(1) > .05, 'A (st = +1) gira a la izquierda', `cruz = ${giro(1).toFixed(3)}`);
}

console.log(failures === 0 ? '\n🟢 ARENA Y CONDUCCIÓN VERIFICADAS' : `\n🔴 ${failures} PRUEBA(S) FALLIDA(S)`);
process.exit(failures === 0 ? 0 : 1);
