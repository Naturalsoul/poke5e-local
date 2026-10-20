# Poke5e Local

## Créditos

**Todo el contenido de juego de este módulo viene de [Pokémon 5e (poke5e.app)](https://poke5e.app).** Las reglas,
los Pokémon, los Moves, las Abilities, los objetos, los caminos de entrenador y los suplementos son trabajo de sus
autores, y el mérito es suyo. Este módulo solo los lleva a Foundry VTT y automatiza lo que se puede. Para las
reglas y las fichas, la referencia es siempre [poke5e.app](https://poke5e.app). Si te gusta jugar así, apoya y
consulta su trabajo allí.

También usa:
- [Foundry VTT](https://foundryvtt.com) y el sistema [D&D5e](https://github.com/foundryvtt/dnd5e), sobre los que corre;
- los sprites y los gritos de [Pokémon Showdown](https://play.pokemonshowdown.com);
- las animaciones gratuitas de [JB2A](https://jb2a.com) (licencia CC BY-NC-SA), reproducidas con
  [Sequencer](https://github.com/fantasycalendar/FoundryVTT-Sequencer).

**Es un proyecto de fans, sin fines de lucro.** Nació porque quería jugar Pokémon con D&D con mis amigos. No se
vende ni se cobra por él. Pokémon y sus nombres son marcas de Nintendo, Game Freak, Creatures Inc. y The Pokémon
Company; Dungeons & Dragons es de Wizards of the Coast. Este proyecto no está afiliado a ninguno de ellos ni
cuenta con su respaldo.

## Qué es

Módulo de Foundry VTT para jugar **Pokémon 5e** ([poke5e.app](https://poke5e.app)) sobre el sistema **D&D5e**.
Importa Pokémon, Moves, Abilities y objetos, da hojas propias a Pokémon y entrenadores, y automatiza la mayor
parte de las reglas de combate: tipos, STAB, estados, Abilities, rasgos de entrenador, capturas y más.

- **Versión:** 0.20.0
- **Requisitos:** Foundry VTT 13 (13.351 o superior) y D&D5e 5.3.3 o superior.
- **Idiomas:** español e inglés (ajuste del módulo `language`).

Los cambios están en el [CHANGELOG](CHANGELOG.md).

## Instalación

1. Copia la carpeta `poke5e-local` en `Data/modules/` de Foundry.
2. Activa el módulo en un mundo de D&D5e.
3. Recarga el mundo. Al cargar, el módulo migra los Pokémon existentes (velocidad de vuelo estacionario,
   género) y añade a sus Moves las automatizaciones nuevas.

### Módulos opcionales

| Módulo | Para qué |
|---|---|
| Dice So Nice | Los efectos que dependen de una tirada esperan a que el dado termine y el resultado se vea en el chat. |
| FXMaster | Clima visible (lluvia, nieve, sol, tormenta de arena). |
| Sequencer + JB2A (gratis) | Animación de cada Move al usarlo, y al crear un terreno. |

Sin ellos, el módulo funciona igual; solo se pierde la parte visual.

## Qué incluye

### Base de datos e importación
- **1151 Pokémon, 830 Moves, 330 Abilities y 366 objetos** normalizados en `data/normalized/`.
- **Importador Pokémon** (botón de Poké Ball en los controles de token, solo DM): crea Pokémon con su nivel,
  Moves, Ability, naturaleza, género, shiny, sprites animados y grito.
- Catálogo de objetos sincronizado con un compendio y descripciones adaptadas.

### Pokémon
- Hoja propia: tipos y su tabla de debilidades, PP de cada Move, objeto equipado, Ability, estados y
  modificadores de stats.
- Subida de nivel, experiencia, evolución, aprendizaje de Moves, Centro Pokémon y descanso.
- **Barra de combate:** al seleccionar un Pokémon, la página 1 de la barra de macros muestra sus Moves (con los PP
  que quedan), su Ability activable y las acciones de su entrenador. Con un Pokémon salvaje, el DM ve sus Moves.

### Entrenadores
- Hoja de entrenador, equipo y PC, despliegue, retirada y cambio de Pokémon, y centro de mando.
- **Todos los caminos de entrenador están automatizados** salvo Pokémon Breeder, que está aparcado (ver
  `tasks/backlog.md`). Incluye las reacciones de combate (Battle Die, Sabotage, Raise Your Defenses…).
- Suplemento de Bonds (básico) y el camino Commander.
- Los entrenadores no entran en la iniciativa: las reglas de "su próximo turno" usan los turnos de sus Pokémon.
- **Captura:** lanzar una Poké Ball tira la captura, gasta la ball y mueve el Pokémon capturado al equipo o al PC.

### Combate automatizado
- **Daño:** efectividad de tipos, STAB, MOVE y LEVEL en las fórmulas, críticos, daño dinámico, drenaje,
  retroceso, autodaño, multiobjetivo y Struggle.
- **Estados:** Poisoned, Badly Poisoned, Burned, Frozen, Paralysis, Asleep, Confused y Flinched, con sus tiradas,
  inmunidades por tipo, el límite de un estado no volátil, el periodo de gracia y el fin de los volátiles al
  cambiar de Pokémon o terminar el combate.
- **Moves:** 303 de 830 están automatizados (`scripts/move-coverage.mjs` lleva la cuenta de todos). Entre ellos:
  - modificadores de stats, de CA, de salvaciones, de velocidad y de modos de tirada;
  - estados al acertar, con natural N+ o por salvación fallida (o fallida por 5), y tablas d6 de estado;
  - daño que depende de un estado (Facade, Venoshock…) y Moves que cambian el estado de su usuario (Rest, Thrash…);
  - áreas que duran (Poison Gas, Smog, Sludge Bomb), Uproar, Safeguard, Sing, Yawn y Sleep Talk;
  - la familia Protect como reacción al recibir un golpe.
- **Abilities:** las 311 del registro `scripts/ability-coverage.mjs` están automatizadas (255) o marcadas como
  manuales con su motivo (56). Incluye auras, cambios de forma, bayas, clima, terreno y entorno.
- **Animaciones de Moves:** cada Move tiene una animación de JB2A según su tipo y su forma (proyectil, golpe,
  explosión alrededor, cono o línea, mejora o perjuicio). Los ataques la reproducen al verse la tirada y, si fallan,
  la desvían. Se apaga por jugador con el ajuste "Animaciones de Moves".
- **Clima y terreno** por combate, con su panel en el registro de combate.
- **Objetos equipados** y bayas.

Lo que un Move automatizado aún deja al DM está en la nota de su entrada en `scripts/move-coverage.mjs`.

### Otras herramientas del DM
- **Planificador de encuentros:** encuentros salvajes y de entrenadores con aleatorizado y XP.
- **Fakemon Studio:** crea Pokémon propios con asistente, evoluciones, Moves y copia de seguridad.
- Transiciones de batalla con sonido.

## API

Desde la consola, en `game.modules.get("poke5e-local").api`:

| Función | Qué hace |
|---|---|
| `loadDatabase()` | Carga la base de datos normalizada. |
| `syncItemCatalog()` | Sincroniza el compendio de objetos. |
| `migratePokemonHoverMovement()` | Repite la migración del vuelo estacionario. |
| `openFakemonStudio()` | Abre Fakemon Studio. |
| `playBattleTransition()` | Reproduce la transición de batalla. |

### Pruebas dentro de Foundry

`Poke5eRegression` prueba la integración real con D&D5e sobre actores, escenas y mensajes temporales, que borra
al terminar:

```js
(await Poke5eRegression.runSmoke()).summary;
(await Poke5eRegression.runFixtures()).summary;          // daño tipado y actores sintéticos
(await Poke5eRegression.runActivityFixtures()).summary;  // Attack → Damage → applyDamage (sin targets seleccionados)
(await Poke5eRegression.runSaveFixtures()).summary;
await Poke5eRegression.cleanupFixtures();                // si Foundry se cerró a mitad de una prueba
```

## Desarrollo

```bash
npm install
node --test tests/        # en Windows; `npm test` usa un glob que allí no funciona
npx eslint scripts/x.mjs
```

- `scripts/main.mjs` registra todo; cada motor (`*-engine.mjs`, `*-moves.mjs`) se registra con sus hooks.
- Las reglas viven en tablas (`MOVE_STATUS_EFFECTS` en `status-effects.mjs`, `ACTIVE_ABILITIES`…) y los motores
  las aplican.
- Los tests (`tests/`, 430 en este momento) usan los mocks de Foundry de `tests/helpers/foundry-mocks.mjs`.
- Los registros de cobertura (`move-coverage.mjs`, `ability-coverage.mjs`) tienen sus tests: un Move que un
  motor automatiza tiene que estar marcado como automatizado.
- Documentos de diseño: `SPEC-move-coverage.md`, `SPEC-stat-modifiers.md`, `CAPABILITY-MAP-moves.md`,
  `HELD_ITEMS.md`.
- `tasks/backlog.md` guarda el trabajo aparcado.

## Límites conocidos

- 440 Moves siguen pendientes (421) o manuales (19); otros 87 son solo daño. Los grupos pendientes más grandes son
  mecánicas especiales, efectos de campo y efectos de ataque.
- El camino Pokémon Breeder y el suplemento de crianza no están (faltan grupos huevo y proporción de géneros).
- Varias reacciones se resuelven en el cliente de quien ataca, que necesita permisos sobre el defensor.
- Las automatizaciones están probadas con mocks; conviene probar en una partida antes de confiar en una nueva.
