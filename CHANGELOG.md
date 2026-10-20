# Changelog

Los cambios del módulo por versión, de la más reciente a la más antigua. La versión es la de `module.json`:
se sube el número **menor** (0.19.0 → 0.20.0) cuando se añade algo y el de **parche** (0.19.0 → 0.19.1) cuando
solo se corrige algo.

## [0.21.0] — 2026-10-20

- **Sonidos de Moves:** cada Move suena junto a su animación con su sonido de los juegos, de la Pokemon SFX
  Attack Moves Collection de BellBlitzKing: 671 Moves, de la generación más reciente que lo tenga (658 de Sol y
  Luna). Los de Gen 8 y 9, que la colección no tiene, usan el sonido de su animación en el Gen 9 Move Animation
  Project (Pokémon Essentials): 150 más. Los 9 restantes suenan como un Move de su tipo, y Growl, Roar, Howl,
  Hyper Voice, Disarming Voice y Halo Song usan el grito del Pokémon.
- Los sonidos van por el canal de interfaz de Foundry, como los gritos: cada jugador regula su volumen ahí.
- `tools/build-move-sounds.py` busca cada Move por su nombre en la colección (o, si no está, el sonido de su
  animación en el pack de Essentials), lo convierte a .ogg (46 MB en total) y escribe `data/move-sounds.json`. Los
  archivos de la colección que están dañados se saltan y se usa otra generación.
- README: créditos a BellBlitzKing, Celebi MM8BDM y el Gen 9 Move Animation Project.

## [0.20.1] — 2026-10-20

- README: requisitos para Foundry 14 (probado en 14.365) y sus límites conocidos: las plantillas son Regions, las
  áreas que duran usan la compatibilidad de v14 y algunos módulos de terceros aún no funcionan en v14.
- `module.json`: verificado en Foundry 14.365.

## [0.20.0] — 2026-10-20

- **Animaciones de Moves** con Sequencer y JB2A (gratis). Cada Move tiene una según su tipo y su forma:
  - los ataques a distancia lanzan un proyectil al objetivo; se reproducen cuando se ve la tirada y, si fallan,
    pasan de largo;
  - los cuerpo a cuerpo golpean como dice su nombre o, si no, su descripción: mordisco, garra, pinza, puño, patada,
    tajo, cuerno o pico, martillo o hueso, látigo o cola, y giro (Feint Attack, "a sucker punch", es un puñetazo).
    Los de Fuego, Agua, Eléctrico, Planta, Hielo, Veneno y Hada añaden su elemento al impactar (Fire Punch: puño y
    luego fuego). Sin palabra que lo diga, usan el golpe de su tipo;
  - los Moves que colocan plantilla se animan sobre ella, haya o no objetivos marcados: el cono o la línea de su
    tipo a lo largo de conos y líneas, y su explosión sobre círculos y cuadrados (y sobre los conos de tipos sin
    cono propio). La animación se dibuja algo más grande que la plantilla y se recorta a su forma, así que la
    llena entera sin salirse;
  - sin plantilla, los de área hacen una explosión alrededor del usuario y los conos y líneas salen hacia el
    objetivo;
  - los que no hacen daño muestran una mejora en el usuario, un perjuicio en el objetivo o una curación.
- Funciona en Foundry 13 y 14. En Foundry 14 una plantilla colocada es una Region y ya no avisa como plantilla, así
  que la animación también escucha la creación de Regions de plantilla.
- Con tokens grandes, el radio de las explosiones cuenta desde el borde del usuario y los golpes cuerpo a cuerpo
  llegan al borde del objetivo, no a su centro. Lo que se muestra sobre el objetivo escala con su token.
- Ajuste por jugador "Animaciones de Moves" para apagarlas. Sin Sequencer o sin JB2A no se reproduce nada.
- Funciona con todos los Moves, también los importados antes (incluso con la definición antigua, sin área): la
  animación se calcula de los datos del propio Move, sin migrar nada.
- README: créditos a JB2A y Sequencer.

## [0.19.1] — 2026-10-20

- README: sección de créditos al principio. Reconoce a poke5e.app como origen de todo el contenido de juego,
  menciona Foundry VTT, D&D5e y Pokémon Showdown (sprites y gritos), y aclara que es un proyecto de fans sin fines de lucro.

## [0.19.0] — 2026-10-20

Todo lo hecho desde 0.18.8, agrupado por día.

### 2026-10-20

#### Barra de combate
- Los Pokémon salvajes muestran sus Moves en la barra a su dueño (el DM). Antes la barra solo aparecía con el
  Pokémon desplegado de un entrenador, así que el DM nunca la veía con los salvajes. Los tokens que no son Pokémon
  no tocan la barra.

#### Estados
- **Badly Poisoned:** como Poisoned, pero con el doble de daño al final del turno. Toxic, Poison Fang, Malignant
  Chain y Toxic Spikes (al fallar por 5) lo aplican.
- Asleep dura como máximo tres turnos.
- La CD de Frozen usa la competencia actual de quien congeló.
- Confused y Flinched terminan al retirar o cambiar al Pokémon; Flinched también al terminar el combate.
- Shields Down impide la Parálisis (el id del estado estaba mal escrito).
- Un estado volátil que el Pokémon ya tiene no se aplica dos veces.

#### Moves con estados (10 lotes)
1. **101 Moves aplican su estado** solos: con natural N+ (Bite, Thunderbolt, Fire Fang…), al acertar (Confuse Ray,
   Fake Out…), al acertar y fallar la salvación (Nuzzle, Poison Fang…), al fallar la salvación (Hypnosis,
   Supersonic…) o al fallarla por 5 (Flamethrower, Ice Beam, Thunder…). Los estados por salvación, que antes eran
   un botón de dnd5e, se aplican después de que el resultado se vea en el chat. Los Moves que ya estaban en las
   hojas reciben sus plantillas al cargar el mundo.
2. **Daño que depende de un estado:** Facade, Smelling Salts y Venoshock doblan sus dados; Wake-Up Slap, Barb
   Barrage e Infernal Parade suman MOVE otra vez. Wake-Up Slap despierta al objetivo.
3. **Moves que cambian el estado de su usuario:** Refresh lo cura; Flame Wheel y Fusion Flare lo descongelan; Rest
   lo duerme y Thrash lo confunde al final de su turno, igual que Petal Dance dos rondas seguidas; Raging Fury lo
   confunde al terminar su concentración. Sparkling Aria cura la quemadura de quien recibe su daño.
4. Ember, Signal Beam e Inferno. **Yawn** duerme al objetivo al final de su siguiente turno si sigue en combate.
   **Venom Drench** convierte el veneno en Badly Poisoned.
5. **Tablas d6:** Secret Power, Tri Attack y Dire Claw tiran el d6 en el chat y aplican el estado de esa cara.
6. **Áreas que duran:** quien empieza su turno dentro de Poison Gas, Smog o Sludge Bomb recibe su daño y su
   salvación. Sludge Bomb coloca su área al acertar. Toxic Spikes envenena o, al fallar por 5, envenena gravemente.
7. **Uproar** impide dormir a 30 pies y hace daño al empezar el turno ahí; **Electric Terrain** despierta a los
   Pokémon en el suelo; **Safeguard** protege de estados nuevos a su usuario y a sus aliados durante 3 rondas.
8. **Sing** (5d8 PG de criaturas, de menos a más), **Nightmare** (daño a los que duermen), **Snore** y **Sleep
   Talk** (solo dormido; Sleep Talk tira qué Move usa).
9. **Familia Protect** (Protect, Detect, Obstruct, Baneful Bunker, King's Shield y Spiky Shield): al recibir un
   golpe se ofrece como reacción, gasta 1 PP y convierte el acierto en fallo. A partir del segundo uso en el combate
   hace falta más de 15 en un d20. Castiga a los atacantes cuerpo a cuerpo según el Move.
10. **Take Heart** (reacción a recibir un estado o quedar asustado) y **Psycho Shift** (pasa el estado del usuario
    al objetivo).

#### Abilities
- Lote 8: Download, Healer, Curious Medicine, Sheer Force, Gorilla Tactics, Skill Link, Receiver y Power of
  Alchemy. Con esto todas las Abilities están automatizadas o marcadas como manuales.

#### Tests
- La suite vuelve a funcionar entera: los tests importaban rutas antiguas y algunos actores de prueba no estaban
  marcados como Pokémon. Pasó de 29 fallos a 0, y ahora son 430 tests.

### 2026-10-19

#### Abilities (lotes 1 a 7)
- Registro de cobertura de Abilities y Abilities pasivas por tabla.
- Abilities de una vez por descanso que se activan desde la hoja o la barra de combate, con su botón en la tarjeta.
- Volver a tirar el daño (Adaptability, Iron Fist…), Prism Armor, Sturdy y Filter.
- Bayas: Ripen, Cheek Pouch, Gluttony, Harvest, Cud Chew y Unnerve.
- Efectos sobre Moves, eventos al golpear y al debilitarse, protección de stats, estados, turnos, cambios y
  descansos.
- Clima, terreno y entorno por combate, con sus Abilities; clima visible con FXMaster y animación de terreno con
  JB2A.
- Auras (Victory Star, Plus/Minus, Battery, veils, Ruin, Neutralizing Gas…), cambios de forma (Schooling, Zen
  Mode, Shields Down, Disguise, Stance Change…) y Magic Guard, Protean, Libero, Magic Bounce, Mirror Armor, Unaware…
- Iconos pintados para las Abilities.

#### Entrenadores
- Rasgos de camino de niveles 5, 9 y 15, con iconos pintados: Versatile, Partners, Cheerleader, Nurse, Tactician…
- Reacciones de combate: Battle Die, Sabotage, Raise Your Defenses, Not This Time, Directed Strike, Dark
  Advantage, Sinister Dodge y Nefarious Stagger.
- Guru y Nurse (Mind, Body, Spirit, Pokéchef, Field Medic, Tip-Top Shape), Researcher y Collector (Analyst,
  Professor, Disciplined Strikes, Expert Tracker) y rasgos de nivel alto (Master Trainer…).
- Suplemento de Bonds (básico) y el camino Commander.
- El camino Pokémon Breeder queda aparcado; lo que sigue siendo manual está en `tasks/backlog.md`.

#### Captura
- Lanzar una Poké Ball tira la captura (sin mostrar la CD), espera a Dice So Nice, gasta la ball y mueve el
  Pokémon capturado al equipo o al PC si el equipo está lleno.

#### Barra de combate
- La página 1 de la barra muestra los Moves del Pokémon en combate y las acciones de su entrenador, con los PP y
  los usos que quedan.

#### Pokémon
- La velocidad de vuelo estacionario se importa como vuelo + hover, y se reparan los Pokémon existentes.
- La migración de género se ejecuta al cargar el mundo.
- Storing Power se muestra en la tabla de tipos.

### 2026-10-18

#### Modificadores de stats
- Registro de cobertura de Moves con su test.
- MOVE, LEVEL y STAB se resuelven en las fórmulas de daño.
- Modificadores automáticos: Leer, Tail Whip, Growl… y mejoras propias al usar el Move, ligadas a la
  concentración (Agility, Amnesia, Acid Armor, Aqua Ring, Defend Order…).
- Disparadores "natural N+" (Bubble Beam, Mud Shot) y "acierto + salvación fallida" (Acid Spray).
- Lotes 5a a 5f: modificadores de CA (26 Moves), de ataque (11), de salvaciones (7), de velocidad (7), restantes
  (6) y modos de tirada (43).
- graphify para explorar el código.

### 2026-10-17

- Versión estable: auditoría de Moves y automatización de objetos y de algunos Moves.

## [0.18.8] — 2026-09-21

- Primera versión estable.
