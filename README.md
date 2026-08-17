# TURBO GOL — Arena Juárez

Fútbol de cohetes en 3D. Un archivo HTML, cero build, cero dependencias locales.
Motor de física arcade escrito desde cero y renderizado con Three.js.

![estado](https://img.shields.io/badge/build-single%20file-00e5c7)
![licencia](https://img.shields.io/badge/licencia-MIT-blue)

---

## Cómo se juega

Abre `index.html` en cualquier navegador. No hay servidor, ni instalación, ni paso de compilación.

```bash
# opcional, si prefieres servirlo
npx serve .
```

### Controles

| Acción | Teclado | Mando |
|---|---|---|
| Acelerar / frenar | `W` · `S` | `RT` · `LT` |
| Volante | `A` · `D` | Stick izquierdo |
| Turbo | `SHIFT` | `B` |
| Saltar · flip | `ESPACIO` ×2 | `A` ×2 |
| Derrape / air roll | `CTRL` | `X` · `LB` · `RB` |
| Cámara de balón | `C` | `Y` |
| Mirar atrás | `Q` | `L3` |
| Predicción del balón | `T` | — |
| Chat rápido | `1` – `8` | — |
| Reiniciar balón (entrenamiento) | `R` | — |
| Pausa | `ESC` | `Start` |

En el aire: `W`/`S` cabeceo, `A`/`D` guiñada, `CTRL`+`A`/`D` alabeo.
Doble salto con dirección = flip. A velocidad supersónica, el contacto demuele al rival.

---

## Decisiones técnicas

### Escala: 1 unidad = 50 "uu" de Rocket League

Todas las constantes derivan de la física real del juego original en lugar de números
inventados. Esto hace que el *feeling* sea fiel y no una aproximación:

| Constante | Valor RL | En el juego |
|---|---|---|
| Radio del balón | 92.75 uu | 1.855 u |
| Gravedad | 650 uu/s² | 13 u/s² |
| Velocidad máxima | 2300 uu/s | 46 u/s |
| Umbral supersónico | 2200 uu/s | 44 u/s |
| Aceleración de turbo | 991 uu/s² | 19.8 u/s² |
| Consumo de turbo | 33.3 %/s | igual |
| Impulso de salto | 292 uu/s | 5.84 u/s |
| Semicampo | 5120 × 4096 uu | 102.4 × 81.92 u |

### Física propia, no un motor de terceros

Rocket League **no** usa física rígida realista: usa un modelo arcade afinado a mano.
Meter Cannon, Rapier o Ammo daría un coche que se siente mal, así que el motor es propio:

- **Paso fijo de 120 Hz** con sub-stepping y tope de 8 pasos por frame.
- **Coche ↔ balón**: punto más cercano de una caja orientada (OBB) a la esfera, más un
  impulso direccional extra con sesgo hacia arriba — el equivalente al *psyonix impulse*.
- **Coche ↔ arena**: proyección del soporte del OBB sobre cada plano. La arena es un
  octágono con chaflanes, igual que la original, más suelo y techo.
- **Postes y travesaño**: colisión contra segmentos (cápsulas), no contra planos.
- **Conducción sobre superficies**: la base local se reconstruye contra la normal de
  contacto, así que conducir por paredes y techo usa exactamente el mismo código que
  conducir por el suelo.
- **Curvas de unión**: suelo y techo empalman con las paredes mediante un cilindro
  cóncavo (`A.fill`), no un ángulo recto. Se sube rodando en lugar de estrellarse, y la
  curva es tangente a las dos superficies, así que el relevo no tiene escalón. La boca de
  la portería interrumpe la curva de abajo, igual en la física que en la geometría.
- **Pegado a superficies**: una holgura de suspensión asienta el coche a ras de la
  superficie que roza — sin ella sale tangente de la curva y sube junto a la pared sin
  llegar a tocarla. La fuerza de pegado se desvanece al frenar: engancharse exige
  velocidad, quedarse pegado exige mucha menos, y en el techo la gravedad acaba ganando.
- **Momento angular del balón**: fricción de contacto que convierte velocidad tangencial
  en giro usando el tensor de inercia de una esfera (`I = ⅖mr²`), más **fuerza de Magnus**
  (`F ∝ ω × v`). Los golpes descentrados imprimen efecto y los tiros curvan de verdad.

### IA con predicción de trayectoria

La IA no extrapola en línea recta: **simula el balón 3 segundos hacia adelante usando la
misma función de física del juego**, rebotes incluidos. Sobre ese buffer resuelve el punto
de intercepción comparando tiempo-de-llegada contra tiempo-de-vuelo.

De ahí salen los roles: `attack`, `mid`, `back` y `save`. El rol de portero se activa
cuando la trayectoria predicha entra en el marco propio. Cuatro niveles ajustan error,
tiempo de reacción, gestión de turbo y agresividad en aéreos.

El mismo buffer alimenta la línea de predicción visible con `T`.

### Renderizado

- **Three.js r128** desde CDN. Sin bundler.
- **Post-proceso escrito a mano** (el bundle CDN de r128 no trae `EffectComposer`):
  render a target → bright-pass con umbral suave → dos octavas de desenfoque gaussiano
  separable → composición con viñeta, aberración cromática y desenfoque radial
  proporcional a la velocidad.
- **Texturas procedurales**: la cancha, el balón y el público se dibujan con Canvas 2D
  en tiempo de carga. Cero assets binarios en el repo.
- **Partículas** con `ShaderMaterial` propio y tamaño por partícula, blending aditivo.
- **Audio 100 % sintetizado** con Web Audio API: motor, turbo, impactos, demoliciones,
  ambiente de gradas y fanfarria. Cero KB de audio, cero problemas de licencias.

### Repetición instantánea

Búfer circular de 4.3 s a 60 Hz con posición y rotación de todas las entidades.
En cada gol entra a cámara lenta 0.55× con cambio de plano y barras cinematográficas.

---

## Verificación

El motor de física se prueba de forma automática. El test **extrae las funciones reales
del `index.html`** en lugar de duplicarlas, así que no puede desincronizarse del juego.

```bash
npm install
npm test
```

Comprueba el balón (`test/physics.test.mjs`):

1. **Contención** — 6 000 trayectorias aleatorias a velocidad máxima con giro aleatorio.
   El balón nunca debe salir de la arena por ningún plano, chaflán o esquina.
2. **Estabilidad numérica** — ningún `NaN` ni `Infinity` en 4.2 millones de pasos.
3. **Tope de giro** — el momento angular respeta `BALL.spinMax`.
4. **Efecto Magnus** — un tiro con giro debe desviarse de forma medible respecto al
   mismo tiro sin giro.
5. **Detección de gol** — la línea de gol registra correctamente.

Y la arena curva con el coche encima (`test/arena.test.mjs`), que conduce un coche real
extraído del HTML:

6. **Empalme sin escalón** — la curva es tangente al suelo y a la pared.
7. **El balón sube la curva** y vuelve rodando a la cancha, y un tiro raso sigue entrando.
8. **Subir la pared** — el coche trepa la curva y conduce tumbado contra la pared.
9. **Techo** — llega arriba, aguanta con gas y la gravedad lo despega al frenar.
10. **Sin efectos colaterales** — el salto sigue despegando y el volante gira a su lado.

---

## Estructura

```
index.html                  el juego completo
test/physics.test.mjs       banco del balón (extrae del HTML)
test/arena.test.mjs         banco de la arena curva y la conducción (extrae del HTML)
.github/workflows/ci.yml    CI en cada push
vercel.json                 despliegue estático
```

## Despliegue

Es estático puro; funciona en cualquier hosting.

```bash
vercel --prod
```

---

## Licencia

MIT. Ver [LICENSE](LICENSE).

Juego original inspirado en el género de *car soccer*. No contiene assets, marcas,
código ni material con derechos de terceros: la geometría, texturas, audio y física
se generan por completo desde este archivo.
