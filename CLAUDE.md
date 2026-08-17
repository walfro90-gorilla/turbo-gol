# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install          # solo instala `three` (0.128.0) para el test; el juego no lo necesita
npm test             # node test/physics.test.mjs — banco de física, exit 1 si falla
npm start            # npx serve . (opcional: index.html abre directo con file://)
vercel --prod        # despliegue estático
```

No hay build, bundler, linter ni formateador. No hay runner de tests: `test/physics.test.mjs`
es un script suelto con bloques numerados. Para correr un solo bloque, comentar los otros
bloques `{ ... }` del archivo.

## Arquitectura

Todo el juego vive en `index.html` (~1735 líneas): `<style>` (7–139), DOM de la UI (139–239),
`<script src>` de Three.js r128 desde CDN (global `THREE`, **no** módulo ES), y un único
IIFE `'use strict'` desde la línea 241 hasta el final.

El script está dividido por comentarios banner `/* ═══ NOMBRE ═══ */`. Úsalos para navegar:
CONSTANTES · AUDIO SINTETIZADO · RENDERER + ESCENA · PARTÍCULAS · BALÓN · COCHES · PADS ·
COLISIÓN CON LA ARENA · FÍSICA DEL COCHE · COCHE ↔ BALÓN · IA CON PREDICCIÓN · ESTADO · UI ·
REPETICIÓN · PARTIDO · ENTRADA · CÁMARA · MINIMAPA · POST-PROCESO · BUCLE · RESIZE.

### Escala y constantes

`const S=1/50` — 1 unidad = 50 uu de Rocket League. Toda constante de `A` (arena), `BALL` y
`CAR` deriva de un valor real del juego original multiplicado por `S`. Al tocar física,
derivar de uu reales, no inventar números; el README documenta la tabla de equivalencias.

### Bucle

`tick(now)` (rAF) hace input, lógica de reloj, cámara y UI a framerate variable, y llama a
`physics(FIXED)` en un acumulador de paso fijo **120 Hz con tope de 8 sub-pasos**
(desborde ⇒ `acc=0`). Orden dentro de `physics`: `ballStep` → `aiStep`/`stepCar` por coche →
`carBall` → `carCar` pares → detección de atajadas → detección de gol.

`state.phase` es la máquina de estados: `menu` · `count` · `play` · `goal` · `replay` ·
`paused` · `over`. Cada fase corta distinto en `tick` (en `goal` solo integra el balón; en
`replay` solo reproduce el búfer y sale temprano).

### Física propia

Motor arcade escrito a mano, sin librería de física. Puntos que se rompen fácil:

- `ballStep(pos,vel,spin,dt,fx)` es la **única** integración del balón, y la usa tanto el
  juego como `computePrediction()` (3 s hacia adelante para IA y línea `T`) como el test.
  Cualquier cambio ahí afecta las tres cosas.
- `stepCar` reconstruye la base local contra la normal de contacto, así que conducir por
  paredes/techo comparte código con conducir por suelo — no bifurcar por superficie.
- Postes/travesaño usan `segCollide` (cápsulas), no planos. `inMouth(p,margin)` decide qué
  cuenta como boca de portería y por eso el balón puede salir del octágono ahí sin ser fuga.
- `contactSpin` convierte velocidad tangencial en giro con `I=⅖mr²`; el efecto Magnus está
  acoplado a `BALL.magnus` y `BALL.spinMax`.

### Post-proceso

El bundle CDN de r128 no trae `EffectComposer`, así que `Post` (línea ~1491) implementa a
mano render-target → bright-pass → dos octavas de blur separable → composición. No importar
addons de Three; no existen en ese bundle.

### Sin assets binarios

Cancha, balón y público son texturas Canvas 2D generadas en carga (`fieldTexture`,
`ballTex`, `crowdTexture`). Audio 100 % sintetizado con Web Audio en el IIFE `Snd`. No
agregar archivos binarios al repo.

## El test lee `index.html` por marcadores literales

`test/physics.test.mjs` no duplica el motor: recorta el `<script>` con `cut(from,to)` usando
estas cadenas **exactas**. Renombrar o reformatear cualquiera rompe el test con
`marcador no encontrado`:

```
'const S=1/50;'  →  'const CAR={'
'const WALLS=[];{'  →  'const inMouth='
'const inMouth='  →  '/* predicción compartida'
```

El código recortado se evalúa con `new Function` fuera del navegador, con solo este preámbulo
stub: `V3`, `Q`, `clamp`, `rnd`, `Snd.wall()`, `spawnP()`. Si el código de física dentro de
esos tramos empieza a usar otro global del navegador (`document`, `performance`, otro método
de `Snd`, `lerp`), hay que añadir el stub al `preamble` del test.

## Convenciones

- Estilo denso a propósito: sin espacios alrededor de `=`, sentencias en una línea,
  nombres cortos (`_d`, `_ax`, `_ay` son vectores de trabajo reutilizados — no reasignar ni
  usarlos anidados entre funciones).
- UI, comentarios y mensajes en español. Mantener el idioma.
- CI (`.github/workflows/ci.yml`) solo corre `npm install --no-package-lock && npm test`.
