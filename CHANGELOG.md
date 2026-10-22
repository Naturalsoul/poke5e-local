# Changelog

Los cambios del módulo por versión, de la más reciente a la más antigua. La versión es la de `module.json`:
se sube el número **menor** (0.19.0 → 0.20.0) cuando se añade algo y el de **parche** (0.19.0 → 0.19.1) cuando
solo se corrige algo.

## [0.28.1] — 2026-10-22

- Recompensa: la tarjeta del chat sale a nombre de "Recompensa", no del personaje asignado al DM. La ventana de
  experiencia y el diálogo de publicar ya no repiten el nivel de los Pokémon llamados "Toxel (Lv. 5)", así que los
  nombres caben; en el diálogo, las casillas se ven (casilla nativa en dorado) y el campo de XP es más estrecho.

## [0.28.0] — 2026-10-22

- **Los jugadores reciben la experiencia.** Nuevo botón **"Publicar recompensa"** en el planificador: el DM marca
  los Pokémon que participaron (con la regla de Repartir Experiencia; cada parte se puede editar) y sale una tarjeta
  en el chat con la XP de cada uno. Cada jugador pulsa **"Recibir"** en sus Pokémon (el DM también puede, por un
  jugador ausente); queda anotado en el Pokémon, así que no se cobra dos veces, y la tarjeta muestra "Recibida" a
  todos.
- **Animación de la barra de EXP**, como en los juegos: se llena mientras el número cuenta, con un "tic" y, si el
  Pokémon puede subir de nivel, destella, suena una fanfarria y su grito, y ofrece "Subir de nivel". Al tope del
  Entrenador dice cuánta XP se pierde. Los sonidos se generan en el navegador (sin archivos) con el volumen de la
  interfaz; con "reducir movimiento" la barra salta al final.
- **Solo experiencia:** se quitan el dinero de los Entrenadores y el botín sugerido, que inventa el DM, y la "XP de
  recuperación" de los encuentros opcionales (no es de poke5e). Un encuentro opcional sigue contando aparte en el
  resumen de la ruta.

## [0.27.0] — 2026-10-22

- **Vuelve la experiencia de poke5e.** El planificador calcula siempre con la regla tal cual: 200 × Nivel × SR por
  Pokémon derrotado (un quinto si se captura), dividida entre los Pokémon que participan. Se quitan la regla de
  "ritmo" y sus dos ajustes (Experiencia de los encuentros, Encuentros de dificultad Media por nivel); el power creep
  lo frena ahora el tope de nivel por Entrenador. Siguen el escalado opcional por nivel (5.ª generación), la regla
  casera de Repartir Experiencia y el indicador de avance.
- **Fuera el botón "Repartir XP"** del planificador: los jugadores darán la experiencia a sus Pokémon (próxima
  versión).

## [0.26.0] — 2026-10-22

- **Tope de nivel por Entrenador** (regla de mesa contra el power creep). Un Pokémon con Entrenador solo sube de
  nivel hasta el nivel de su Entrenador: al llegar, la ficha y el centro de mando dicen "Al nivel de su
  Entrenador" y la subida de nivel se bloquea con un aviso. La XP que pase del umbral del nivel siguiente se pierde
  (la barra se queda llena y sube en cuanto sube el Entrenador). Los Pokémon salvajes y de rivales no tienen tope.
- **Control por nivel, no por SR.** El Entrenador puede desplegar o cambiar a Pokémon de hasta su nivel; si el
  Pokémon es de nivel mayor, se bloquea con un mensaje. La senda **Guru** pasa de "+1 al SR máximo" a controlar
  Pokémon de hasta 1 nivel más que el suyo. El SR máximo sale de la progresión del Entrenador: la hoja muestra
  **NV. MÁX.** en su lugar, igual que la creación y la subida de nivel del Entrenador, y "Mejora de Control" habla
  de nivel. El SR queda solo para la experiencia y la captura.

## [0.25.0] — 2026-10-21

- **Diseño de las hojas.** Nuevo ajuste "Poke5e - Diseño de las hojas" (Configuración, por jugador), pensado
  para cambiar el estilo si cambia el tono de la campaña. Dos diseños: **Team Rocket** (el de siempre: ficha de
  Pokémon en pizarra y hoja de Entrenador en rojo Rocket) y **D&D 5e**: la hoja de Entrenador vuelve al aspecto
  de la hoja de personaje de dnd5e (cabecera, barra lateral y pestañas) y los paneles del módulo (centro de
  mando, ficha de Pokémon, planificador, Fakemon Studio) toman sus colores: pergamino en el modo claro de
  Foundry y azul vaquero en el oscuro. Todo sigue funcionando igual en los dos; solo cambia el aspecto.
- Para que el modo claro se lea bien, 131 colores fijos pensados para fondos oscuros pasan a los colores comunes:
  fondos oscuros de botones y buscadores (Desplegar, acciones de movimiento, buscador del planificador), texto
  claro (PS de la party) y los verdes, azules, rojos y dorados pastel de los estados. En el diseño Team Rocket se
  ven casi igual. Nuevo color común `--poke5e-ui-on-accent` para el texto sobre botones rojos; el rango del Team
  Rocket se lee sobre la cabecera de dnd5e.

## [0.24.0] — 2026-10-21

- **Rango en el Team Rocket.** La línea bajo el nombre del entrenador ("TEAM ROCKET // RECLUTA") ya no es fija: el DM
  elige el rango en un desplegable de la propia línea (Recluta, Alto Rango Recluta, Ejecutivo, Administrador o
  Administrador Jefe), y el jugador solo ve el texto. El cambio se rechaza si no viene de un DM, aunque el jugador sea
  dueño del actor. Sin elegir, sigue siendo Recluta.

## [0.23.3] — 2026-10-21

- **Colores escritos a mano, a la base común.** En la ficha de Pokémon, la hoja de Entrenador y su gestor, el
  planificador y Fakemon Studio, 626 colores fijos (fondos, degradados, bordes, brillos rojos, crema y dorados) usan
  ahora los colores de `styles/theme.css`; los transparentes, con `color-mix()`. Se ve igual: los tonos que estaban
  a 1–6 unidades de un color común se igualan a él, y las ventanas de Entrenador conservan su paleta Rocket. Quedan
  como estaban las sombras y brillos neutros (negro y blanco), los colores de tipo y de PS, y los colores propios
  de algunos diálogos (el rojo de los diálogos de Entrenador, el morado de Fakemon Studio).

## [0.23.2] — 2026-10-21

- **Texto más legible.** Las ventanas usaban etiquetas de 6 a 11 px (los botones Check/Save, la naturaleza, los
  estados, la EXP del equipo, la potencia de los Moves…). Ahora el texto pequeño mide de 10 a 12 px: lo que era de
  6–7,5 px pasa a 10, el de 8 a 11, el de 9 a 11,5 y el de 10–11 a 12. Cada tamaño sale de una escala en
  `styles/theme.css` (`--poke5e-ui-text-*`), así que se ajusta en un solo sitio. Se mantiene la micro-etiqueta
  "MOD" de 4 px del modificador, que no cabría en su píldora.
- Con el texto más grande, el resumen inferior del planificador va siempre en su propia fila, con "Repartir XP" y
  "Generar" debajo, para que sus etiquetas se lean enteras; la estrella de la característica principal de la ficha
  de Pokémon vuelve a ser pequeña para no pisar el valor.
- En el gestor del Entrenador, el nombre de cada Pokémon con su nivel pasa a una segunda línea en vez de cortarse
  ("Megabyte (Lv.…").

## [0.23.1] — 2026-10-21

- **Base común de colores para los temas.** `styles/theme.css` reúne los colores de todas las ventanas (fondo,
  paneles, bordes, texto, acento…) y las paletas propias de la ficha de Pokémon, el planificador, Fakemon Studio, la
  hoja de Entrenador y su gestor apuntan a ella. Se ve igual que antes (las ventanas de Entrenador conservan sus
  colores Team Rocket; algunos tonos cambian en 1–4 unidades al unificarse). Es el paso previo a poder elegir un
  tema en la configuración.
- Se borra `styles/trainer.backup-pre-refactor.css` (11.000 líneas que no se cargaban).

## [0.23.0] — 2026-10-21

- **Aviso en la tarjeta de los Moves sin automatizar.** Al usar uno de los 421 Moves pendientes o los 19 manuales,
  su tarjeta dice "Su efecto especial no está automatizado: lo resuelve el DM". Los 99 automatizados en parte dicen
  "Automatizado en parte: el resto lo resuelve el DM", y el DM ve también la nota de qué falta (en inglés).
- **Estados en el chat.** Cuando un Pokémon recibe un estado, el chat lo dice ("Pikachu queda Envenenado"), venga
  de donde venga: Flame Orb, Baneful Bunker, el fin de Thrash o Petal Dance, Magic Bounce, Psycho Shift, la tarjeta
  del Move… Antes solo cambiaba el icono del token. No se repite con las Abilities de contacto ni con Outrage, que
  ya lo anunciaban, y Burned mantiene su recordatorio. Las curas que eran silenciosas también se anuncian: Refresh,
  Flame Wheel, Fusion Flare, Wake-Up Slap, Sparkling Aria, Take Heart y despertar por Uproar o Terreno Eléctrico.
- **Objetos equipados en el chat:** Life Orb (PG perdidos), Shell Bell (PG recuperados), Rocky Helmet, Sticky
  Barb (daño y cambio de portador), Focus Sash (aguanta con 1 PG) y Air Balloon (explota).
- **Corregido:** Black Sludge tiraba su 1d6 sin mostrarlo; ahora la tirada sale en el chat y el daño espera a
  Dice So Nice.
- **Corregido:** los botones de tirada de los objetos (por ejemplo, la curación de una Poción) no aparecían en el
  chat por un error de JavaScript.
- **Corregido:** `npm test` no encontraba los tests en Windows.

## [0.22.0] — 2026-10-20

- **Repartir XP: Repartir Experiencia sin XP de más.** Su portador, si no combatió, cuenta como un participante más
  (con la regla casera, solo entre los Pokémon de su Entrenador): la XP de los demás baja en lo que él recibe. Si
  combatió y se marca, recibe solo su parte normal, calculada desde cero.
- **Planificador: revisión visual.** El resumen inferior muestra cada etiqueta entera (arriba) y su valor (abajo),
  sin cortes; el pie ya no se encoge con un encuentro largo, así que "Repartir XP" y "Generar" siempre se ven; la
  tarjeta de Entrenador no se desborda; las mejoras del rival van en tres cajas parejas; los selectores de SR del
  generador salvaje tienen espacio. El diseño responde al ancho de la ventana del planificador (no al de la
  pantalla), los textos mínimos pasan de 6–7 px a 8 px, los controles muestran el foco del teclado y se respeta
  "reducir movimiento" del sistema.
- **Mejores Moves** para los rivales: en vez de 4 Moves al azar de su nivel, su mejor combinación entre los de
  nivel, huevo y (en un paso aparte) MT: su ataque STAB más fuerte, uno súper eficaz contra el equipo de los
  jugadores si puede, los más fuertes de otros tipos (uno por tipo) y uno de estado. Cada Move se valora por sus
  dados al nivel del Pokémon, STAB, área y si lo potencia una de sus mejores características; curar no es daño.
  En "Ajustar paso a paso" son dos pasos: "Mejores Moves" (nivel y huevo) y, después, "Moves de MT" (los más
  fuertes: Trueno, Hidrobomba o Terremoto a nivel 8). Los Moves se eligen al aplicar el paso (también la cobertura
  súper eficaz) y se ven ya en cada Pokémon de la composición; al crear las hojas se usan esos mismos, si la
  especie puede aprenderlos.
- **Ajustar paso a paso** (encuentros de Entrenador, bajo el generador): sobre el encuentro tal como está, sin
  regenerarlo. "Subir a <dificultad>" aplica los cambios más suaves hasta la siguiente dificultad y "Bajar" deshace
  el último. Cada cambio también se puede aplicar solo y muestra a qué dificultad lleva y cuánto suma: +1 Pokémon en
  campo, características +1/+2, cobertura súper eficaz, objetos garantizados, +1 Pokémon al equipo (de su
  arquetipo, al Entrenador con el equipo más corto), +1 Entrenador de apoyo (de ruta, del mismo arquetipo), y al final, porque inflan la campaña, el As +1
  nivel (al Entrenador con el As más bajo, así que rota) y +1 nivel a todos. Se parte de un Entrenador de ruta, que es Fácil.
  La composición lo refleja al momento: Pokémon y Entrenadores nuevos, niveles, "N en campo" en cada Entrenador,
  los objetos garantizados ya elegidos en cada Pokémon, y las mejoras que se aplican al crear las hojas
  (características y cobertura) como etiquetas sobre los Entrenadores.
- **Planificador de encuentros: dificultad.** poke5e no tiene tabla de dificultad y su SR no es un CR ("Pokémon del
  mismo nivel son igual de fuertes"). Como su combate es el de D&D 5e, la base es la de D&D:
  - cada Pokémon pesa según su nivel con la curva de D&D (el umbral Medio por personaje de la DMG), que coincide con
    PV × daño de poke5e (los dados de los Moves suben en 5, 10 y 17);
  - el grupo es un Pokémon por jugador, al nivel de su Pokémon más fuerte, y en los combates de entrenador su equipo
    entero. Se detecta de los entrenadores de los jugadores (su equipo o, si no tienen, todos sus Pokémon, con sus
    tipos y Moves) y se puede cambiar a mano, o volver a detectar;
  - un encuentro salvaje suma sus Pokémon y, si superan en número al grupo, se multiplica (2 contra 1 es ×1,5). Una
    pelea pareja es Media;
  - un combate de entrenador suma todos los Pokémon de todos los equipos, un 20 % más fuertes que los salvajes, por
    (Pokémon rivales en campo ÷ Pokémon de los jugadores en campo)^0,6: los multiplicadores de D&D en los dos
    sentidos (2 contra 1 ×1,5, 1 contra 4 ×0,43). Un combate parejo es Difícil;
  - **y por los tipos**, como en los juegos: cada Pokémon rival compara sus tipos con los del equipo de los
    jugadores, y los Moves de daño de ellos con sus tipos. La ventaja sube su peso hasta ×2 y la desventaja lo baja
    hasta ×0,5;
  - Fácil, Difícil y Mortal siguen las proporciones de D&D (½, 1½ y 2,2 veces Media).
- El resumen del encuentro muestra su dificultad con su color (Fácil verde, Media dorado, Difícil naranja, Mortal
  rojo) y, al pasar el ratón, la fuerza del encuentro, la del grupo y el factor de tipos.
- El generador salvaje tiene una franja "Dificultad y grupo": la dificultad buscada, los jugadores, su nivel y
  "Detectar grupo". Repite la tirada hasta que el encuentro caiga en ella y, si los filtros no lo permiten, deja el
  más cercano y avisa.
- **El generador de entrenadores elige por el rango del rival, como en los juegos,** y ya no pide niveles ni SR. El
  rango fija el estilo y la dificultad a la que apunta; cuántos Pokémon trae y saca a la vez se adapta al grupo,
  porque los juegos calibran un rival para un jugador y la mesa tiene varios. Los niveles quedan cerca de los del
  grupo (N) para no inflar una campaña que sube por XP:

  | Rango | Apunta a | Niveles | Ace del jefe | Extras |
  |---|---|---|---|---|
  | Entrenador de ruta | Fácil | N−3 a N−1 | — | — |
  | Entrenador Guay | Media | N−2 a N | — | +1, cobertura |
  | Líder de Gimnasio | Difícil | N−1 a N, de un tipo | N+1 | +1, cobertura, objetos |
  | Alto Mando | Difícil | N a N+1, de un tipo | N+1 | +2, cobertura, objetos |
  | Campeón | Mortal | N a N+1 | N+1 a N+2 | +2, cobertura, objetos |
  | Pokémon Dominante | Difícil | N−1 a N (aliados) | N+1 a N+2 | +2, objetos |

  En los rangos jefe, el rival empieza solo y suma ayudantes del gimnasio (con su mismo tipo) solo si solo no llega
  a su dificultad; el Ace es siempre del jefe. "Entrenadores", "Pokémon / Entrenador" y "En campo / Entrenador"
  pueden fijarse a mano, y los extras del rango se pueden cambiar. Si no llega, avisa. El arquetipo da el tema del
  equipo. Las especies se limitan al SR máximo de poke5e para un entrenador de ese nivel. Volver a tirar un equipo
  mantiene sus niveles.
- **Extras de los rivales**, que también cuentan en la dificultad:
  - "Características" +1 o +2 a todas las de los Pokémon creados (×1,1 / ×1,2), con su servicio de puntuaciones,
    así que PV y Moves se ajustan; al regenerar no se suma dos veces y quitarlo lo devuelve;
  - "Cobertura súper eficaz": un Move de daño súper eficaz contra algún Pokémon del equipo detectado de los
    jugadores, si lo aprende a su nivel (×1,1);
  - "Objetos garantizados": cada Pokémon sin objeto recibe un objeto equipado o una baya (×1,05).
  Los pesos son estimaciones, para ajustar en partida.
- Cada entrenador del encuentro tiene "En campo" (1 a 6) en su tarjeta: cuántos Pokémon saca a la vez el DM.
- **Experiencia contra el power creep, por defecto: "Ritmo: N encuentros Medios por nivel"** (8 por defecto, en la
  configuración del mundo). La regla de poke5e (200 × Nivel × SR por Pokémon derrotado) da casi un nivel por cada
  Pokémon de nivel parecido derrotado, y paga por SR, que poke5e dice que no mide la fuerza. Con el ritmo, la XP
  total del encuentro, dividida entre los Pokémon de los jugadores que participan y siguen en pie, da a cada uno
  1/N de nivel en una pelea Media a su nivel; cada rival aporta su parte de la fuerza del encuentro (las peleas más
  difíciles dan más) sin mirar el SR. Con 8 y un grupo de nivel 10, un rival parejo da 2.500 XP en vez de 16.000.
  La regla de poke5e sigue disponible.
- **Avance del Pokémon más fuerte**, en el resumen del encuentro: la XP total si se derrota a todos, dividida entre
  "Pokémon que participan" (los de los jugadores que participan y siguen en pie; uno por jugador por defecto), como
  % del nivel del Pokémon más fuerte de los jugadores (detectado con su XP actual). Al pasar el ratón, dónde queda y
  cuántos encuentros así le faltan para subir: para planear rutas y mazmorras. La regla de poke5e (200 × Nivel × SR
  por Pokémon derrotado) da casi un nivel por cada Pokémon de nivel parecido derrotado, y el avance lo hace visible.
- **Encuentros obligatorios y opcionales:** botón "Obligatorio / Opcional" arriba del encuentro; en uno ya
  guardado se guarda al momento, sin regenerarlo. En "Encuentros guardados", los opcionales se marcan y, con solo
  elegir la ubicación, se muestra su ruta: cuántos obligatorios y
  opcionales, lo que da cada grupo al Pokémon más fuerte y en qué nivel termina si hace todos.
- **XP de recuperación en los opcionales:** cada Pokémon recibe su parte escalada por su propio nivel (Gen V), así
  que los más débiles ganan más y el más fuerte menos: los opcionales sirven para ponerse al día, no para farmear.
- **"Repartir XP"**, junto a Generar: marcas los Pokémon de los jugadores que participaron y siguen en pie, ves la
  parte de cada uno (editable) y se entrega. Un mensaje al GM resume la XP, las subidas de nivel, el dinero de los
  combates contra Entrenadores (poke5e: nivel más alto d4 × 100 por Entrenador) y, en los opcionales, un botín
  sugerido (un objeto o baya y una MT que aprende alguna de las especies rivales).
- **Repartir Experiencia** en "Repartir XP": el Pokémon que lo lleva recibe, aunque no combata, la mitad de la XP
  ganada en el combate (poke5e), además de su parte si combatió. Opción del mundo "Repartir Experiencia: regla casera": solo la
  mitad de la XP que ganaron los demás Pokémon de su mismo Entrenador.
- **"Experiencia según la diferencia de nivel"** (Gen V), opcional en la configuración del mundo: ((2 × rival + 10) ÷ (rival +
  grupo + 10))^2,5; dos niveles por debajo es ×0,83 y cinco, ×0,57. En el avance se mide contra el nivel del Pokémon
  más fuerte, que es quien recibe la XP.

## [0.21.0] — 2026-10-20

- **Sonidos de Moves:** cada Move suena junto a su animación con su sonido de los juegos, de la Pokemon SFX
  Attack Moves Collection de BellBlitzKing: 671 Moves, de la generación más reciente que lo tenga (658 de Sol y
  Luna). Los de Gen 8 y 9, que la colección no tiene, usan el sonido de su animación en el Gen 9 Move Animation
  Project (Pokémon Essentials): 150 más. Los 9 restantes suenan como un Move de su tipo, y Growl, Roar, Howl,
  Hyper Voice, Disarming Voice y Halo Song usan el grito del Pokémon.
- Los sonidos van por el canal de interfaz de Foundry, como los gritos: cada jugador regula su volumen ahí.
- Ajuste por jugador "Sonidos de Moves" para silenciarlos solo para uno mismo; los demás los siguen oyendo. Cada
  sonido llega a los demás por el socket del módulo, que solo acepta sonidos del propio módulo.
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
