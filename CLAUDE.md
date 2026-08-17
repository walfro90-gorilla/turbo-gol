# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm install                     # solo instala `three` (0.128.0) para los tests; el juego no lo necesita
npm test                        # physics (balón) + arena (curvas y conducción), exit 1 si falla
node test/arena.test.mjs        # un solo banco
npm start                       # npx serve . (opcional: index.html abre directo con file://)
vercel --prod                   # despliegue estático
```

No hay build, bundler, linter ni formateador. No hay runner de tests: cada banco es un
script suelto con bloques numerados. Para correr un solo bloque, comentar los otros
bloques `{ ... }` del archivo.

## Arquitectura

Todo el juego vive en `index.html` (~1830 líneas): `<style>` (7–139), DOM de la UI (139–239),
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
- `fillet()` sustituye las esquinas suelo↔pared y techo↔pared por un cilindro cóncavo de
  radio `A.fill`, tangente a ambas superficies (por eso el relevo no tiene escalón). La
  usan coche y balón, y la geometría de `addWalls` barre exactamente la misma curva: si
  cambias `A.fill` o la ecuación, cambian las tres cosas a la vez.
- `touch()` da holgura de suspensión (`CAR.skin`): rozar una superficie asienta el coche
  a ras de ella. Sin eso el coche sale tangente de la curva y sube junto a la pared sin
  tocarla nunca. El guardia `sep<.5` es lo único que impide que se trague el salto.
- Pegado a pared/techo: `CAR.stickOn`/`stickOff` son histéresis (enganchar cuesta,
  soltarse cuesta menos) y `stickFull` la rampa de la fuerza. En el techo `CAR.stick`
  debe superar la gravedad o no se aguanta; al frenar deja de superarla y cae, que es el
  comportamiento buscado.
- El motor gira a la **izquierda** con `st>0`; `readInput` niega la entrada para que D sea
  derecha. Si tocas una de las dos partes, `test/arena.test.mjs` bloque 8 lo detecta.
- Postes/travesaño usan `segCollide` (cápsulas), no planos. `inMouth(p,margin)` decide qué
  cuenta como boca de portería y por eso el balón puede salir del octágono ahí sin ser fuga.
- `contactSpin` convierte velocidad tangencial en giro con `I=⅖mr²`; el efecto Magnus está
  acoplado a `BALL.magnus` y `BALL.spinMax`.

### Post-proceso

El bundle CDN de r128 no trae `EffectComposer`, así que `Post` (línea ~1589) implementa a
mano render-target → bright-pass → dos octavas de blur separable → composición. No importar
addons de Three; no existen en ese bundle.

### Sin assets binarios

Cancha, balón y público son texturas Canvas 2D generadas en carga (`fieldTexture`,
`ballTex`, `crowdTexture`). Audio 100 % sintetizado con Web Audio en el IIFE `Snd`. No
agregar archivos binarios al repo.

## Los tests leen `index.html` por marcadores literales

Ningún banco duplica el motor: recortan el `<script>` con `cut(from,to)` usando estas
cadenas **exactas**. Renombrar o reformatear cualquiera rompe el test con
`marcador no encontrado`:

```
physics:  'const S=1/50;'          →  'const CAR={'
          'const WALLS=[];{'       →  'const inMouth='
          'const inMouth='         →  '/* predicción compartida'
arena:    'const S=1/50;'          →  'const TEAM=['                     (incluye CAR)
          'const WALLS=[];{'       →  'const inMouth='
          'const inMouth='         →  '/* predicción compartida'
          'const _gn=new V3(0,1,0);' →  '/* ═══════════════ COCHE ↔ BALÓN'
```

El código recortado se evalúa con `new Function` fuera del navegador, con un preámbulo stub:
`V3`, `Q`, `clamp`, `rnd`, `lerp`, `Snd`, `spawnP()`, y en arena además `pads`, `state` y
`respawn()`. Si el código de física dentro de esos tramos empieza a usar otro global del
navegador (`document`, `performance`, una malla, otro método de `Snd`), hay que añadir el
stub al `preamble` del banco correspondiente.

## Convenciones

- Estilo denso a propósito: sin espacios alrededor de `=`, sentencias en una línea,
  nombres cortos (`_d`, `_ax`, `_ay` son vectores de trabajo reutilizados — no reasignar ni
  usarlos anidados entre funciones).
- UI, comentarios y mensajes en español. Mantener el idioma.
- CI (`.github/workflows/ci.yml`) solo corre `npm install --no-package-lock && npm test`.
