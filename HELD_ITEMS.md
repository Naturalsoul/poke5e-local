# Objetos equipados: automatización

Se usan las reglas de Pokémon 5e de `data/normalized/items.json`. El objeto debe
estar asignado al Pokémon mediante el sistema de objeto llevado existente.
Los objetos del inventario del entrenador no conceden estos beneficios.
Recarga Foundry como GM después de instalar los cambios.

| Objetos | Automatización |
| --- | --- |
| Black Belt, Black Glasses, Charcoal, Dragon Fang, Fairy Feather, Hard Stone, Magnet, Metal Coat, Miracle Seed, Mystic Water, Never-Melt Ice, Poison Barb, Sharp Beak, Silk Scarf, Silver Powder, Soft Sand, Spell Tag, Twisted Spoon | Añaden la competencia al daño del tipo correspondiente, una vez por movimiento, aunque tenga varias partes. Las tiradas adicionales desde la misma tarjeta de uso reconocen el bono previo. |
| Odd Incense / Rock Incense / Rose Incense / Sea Incense / Wave Incense | Añaden competencia al daño Psíquico / Roca / Planta / Agua / Agua, respectivamente, usando el mismo control de una vez por movimiento. |
| Punching Glove | Añade competencia al daño de movimientos de puñetazo, una vez por movimiento. Evita las reacciones de contacto implementadas de Static, Poison Point, Effect Spore, Flame Body y Gooey. Se usa la [lista de movimientos de puñetazo](https://bulbapedia.bulbagarden.net/wiki/Iron_Fist_(Ability)#Affected_moves); Sucker Punch queda excluido. |
| Expert Belt | Añade competencia al daño contra objetivos vulnerables al aplicar el daño de la tarjeta. Se evalúan las defensas efectivas de cada objetivo y se añade un único bono entre las partes del movimiento. La vulnerabilidad no duplica el bono; aplicar mitad de daño por salvación también reduce el bono a la mitad, redondeando hacia abajo. |
| Muscle Band / Wise Glasses | Añaden la competencia al daño de ataques cuerpo a cuerpo / a distancia. No se aplican a movimientos basados únicamente en salvaciones. |
| Life Orb | Añade competencia al daño. Cuando se aplica daño efectivo de esa tirada, el usuario recibe ese mismo bono como daño sin tipo. Aplicar la misma tirada a varios objetivos cobra el retroceso una sola vez; tiradas de daño diferentes cobran por separado. |
| Shell Bell | Cura la competencia al causar daño efectivo, una vez por activación del movimiento. No supera los PG máximos ni revive automáticamente al usuario. |
| Wide Lens | +1 a las tiradas de ataque de movimientos. |
| Scope Lens | Amplía en uno el rango de crítico, acumulándose con el rango del movimiento. |
| Lucky Punch / Leek | Amplían el rango de crítico para Chansey / Farfetch'd, Farfetch'd de Galar y Sirfetch'd, respectivamente. |
| Quick Claw | +3 a iniciativa mediante un efecto activo. Se sincroniza al equipar, quitar, transferir y cargar el mundo. |
| Flame Orb | Intenta aplicar Quemado al final del turno, respetando las inmunidades, la exclusividad y los periodos de gracia del motor existente. |
| Black Sludge, efecto perjudicial | Un usuario que no sea de tipo Veneno recibe 1d6 de daño Veneno al final de su turno. Pasa por las defensas de tipo habituales. |
| Binding Band | Guarda la competencia del portador al aplicar el atrapamiento. La añade al daño continuado una vez por objetivo y ronda, sin modificar el impacto inicial. |
| Rocky Helmet | Al recibir daño de contacto, inflige al atacante daño sin tipo igual a la competencia del portador, una vez por activación del movimiento. Respeta Protective Pads y Punching Glove. |
| Sticky Barb | Inflige la competencia del portador como daño sin tipo al final del turno. Se transfiere a un atacante de contacto sin objeto; la transferencia no inflige daño adicional. |
| Focus Sash | Una carga impide que daño letal reduzca al portador por debajo de 1 PG. No revive. Recuperación nativa al amanecer. |
| Air Balloon | Anula el daño Tierra hasta que el portador recibe daño efectivo; entonces se guarda como reventado. Se repara al completar un descanso. |
| Leftovers / Black Sludge de tipo Veneno | Actividad «Recuperar PG»: acción adicional, una carga para curar la competencia, diez cargas y recuperación nativa al amanecer. No supera el máximo ni revive. |
| Assault Vest | +1 CA y bloqueo de movimientos sin daño. El bono también funciona con CA plana. |
| Metal Powder | +3 Constitución mediante un efecto activo, únicamente para Ditto. |
| Las 28 bayas del catálogo | Botón «Consumir baya» como reacción con confirmación previa. Publica la tarjeta y consume una unidad mediante D&D5e; elimina el objeto al agotarse. El contador muestra unidades disponibles. Oran tira `2d4 + 2` y Sitrus publica sus 30 PG fijos: curan al portador cuando se renderiza el resultado en el chat. PP, estados y reducción de daño siguen siendo manuales. |

Los bonos de daño respetan la prohibición de amplificación de Struggle.
Life Orb y Shell Bell se activan al **aplicar** el daño de una tarjeta de chat,
no al previsualizarlo. Cambiar manualmente los PG no ejecuta esos disparadores.
La aplicación requiere permisos sobre los actores afectados; usar el GM permite
resolver también los efectos sobre Pokémon enemigos.
Expert Belt no modifica la tirada compartida: su bonificador aparece en el cálculo
del daño de cada objetivo. Las previsualizaciones no consumen ni acumulan bonos.
Protective Pads también evita las cinco reacciones de contacto enumeradas arriba;
Cursed Body y Stench conservan sus disparadores, que no dependen del contacto.

Con competencia +3, Mystic Water convierte `1d6 + 2` de Agua en `1d6 + 2 + 3`.
Expert Belt convierte 12 de daño ya duplicado por vulnerabilidad en 15, no en 18.

## Uso de los nuevos efectos

Los objetos equipados no consumibles, como Leftovers, se prestan desde el
inventario del Trainer: entregar uno reduce su cantidad en una unidad y conserva
el registro aunque quede en **0**. Ese registro y el objeto del Pokémon comparten
las cargas gastadas y recuperadas, también cuando se usa un token. Gastar todas
las cargas no elimina el objeto. Al devolverlo, aumenta la cantidad del mismo
registro del Trainer y conserva las cargas actuales.

Si hay varias unidades iguales, cada unidad prestada tiene su propio registro
de cantidad 0 y su propio contador de cargas; las unidades disponibles siguen en
la pila original. Al recargar como GM también se vinculan los objetos ya
equipados, conservando sus cargas gastadas. Si falta el registro del Trainer, se
crea uno de cantidad 0. Si hay varios registros posibles, devuelve el objeto y
vuelve a entregarlo desde la fila concreta del inventario para vincularlo.

Al arrastrar una baya desde el inventario del Trainer a la hoja de uno de sus
Pokémon, se entrega una sola unidad: una pila de 5 queda en 4 en el Trainer y en
1 en el Pokémon. La última unidad desaparece del inventario del Trainer. El Pokémon
debe tener libre su espacio de objeto equipado. Si falla la entrega, se revierte
la copia creada; el consumo posterior de la baya afecta únicamente al Pokémon.

Al recargar como GM, los objetos equipados existentes reciben sus actividades y
configuración de cargas; se conservan las cargas gastadas. Los movimientos de
atrapamiento existentes reciben únicamente las actividades y plantillas que les
faltan, conservando PP, descripciones y actividades personalizadas.

Después de acertar, usa el botón de aplicar efecto periódico de la tarjeta sobre
el objetivo atrapado. Binding Band guarda entonces la competencia del atacante;
cambiar de objeto o de competencia después no cambia ese efecto.

Los efectos aplicados aparecen en el panel **Efectos de movimientos** de la hoja
del Pokémon afectado, junto al panel de concentración. El GM puede abrir el editor
nativo para modificar sus datos, pausarlos/reactivarlos o eliminarlos.
Los jugadores ven el efecto y su estado, sin estos controles. El panel muestra
los efectos ya aplicados; aplicar el efecto desde la tarjeta sigue siendo necesario.

Growl, Leer, Screech y Mud-Slap aplican sus modificadores automáticamente, con un
GM conectado, después de la animación de Dice So Nice y de mostrar el resultado:

- Growl: al fallar la salvación, −1 a ataques por acumulación, hasta −5.
- Leer / Screech: al fallar la salvación, +1 por acumulación a los ataques de los
  aliados contra ese objetivo, excluyendo al usuario original; máximos +5 / +3.
- Mud-Slap: al acertar, −1 a ataques por acumulación, hasta −5, durante el encuentro.
  El GM puede usar **Limpiar lodo (Acción)** en el panel de efectos para quitar
  todas sus acumulaciones cuando el Pokémon dedica su acción a limpiarse.
  También se elimina al terminar o borrar el combate.

Para los tres movimientos con salvación, usa el botón de salvación de su tarjeta
de chat para vincular cada resultado al movimiento y objetivo correctos. Para
Mud-Slap, selecciona un único objetivo antes de tirar el ataque; sin una CA y un
objetivo identificados no se presupone el impacto. Estos cuatro movimientos ya
no requieren pulsar **Aplicar / acumular efecto**. Las tarjetas antiguas no vuelven
a aplicar efectos al abrir el chat. Recarga como GM para añadir las plantillas
que falten en movimientos existentes, sin sustituir sus descripciones o PP.

Las tiradas de daño periódico, como Leech Seed, Fire Spin e Infestation, esperan
a que termine Dice So Nice y el resultado sea visible en el chat antes de aplicar
el daño. Leech Seed resuelve después la curación por drenaje. La misma espera se
usa en las tiradas automáticas de estados, confusión y daño directo por retroceso
de movimientos. Sin Dice So Nice también se espera a que el chat muestre la tirada.

- Fire Spin e Infestation: daño al final de los tres turnos siguientes del objetivo,
  con los dados correspondientes al nivel. Requieren concentración y el efecto
  depende de la concentración nativa: perderla termina el atrapamiento.
- Bind, Wrap y Clamp: actividad «Continuar atrapamiento» como acción adicional.
  Clamp termina también al cumplirse un minuto de tiempo del mundo.
- Sand Tomb, Whirlpool y Thunder Cage: continuación como acción.
- Las continuaciones no consumen PP ni repiten el ataque inicial. Selecciona el
  objetivo que sigue atrapado. Las salvaciones de escape se resuelven con el GM;
  cuando escape, elimina su efecto de atrapamiento para impedir continuaciones.
- Snap Trap no causa daño continuado y Magma Storm es un área; no se les aplica
  este bono por sus nombres o por su comportamiento en los videojuegos.

Las cargas usan el sistema nativo de D&D5e: su recuperación al amanecer se
procesa cuando Foundry resuelve un nuevo día en el descanso. En la hoja del Pokémon,
el panel del objeto equipado muestra un pequeño botón con un ícono junto al nombre
por cada actividad disponible; las cargas restantes aparecen a su derecha. Al pasar
el cursor se muestra el nombre de la actividad y su tipo de acción. Leftovers y
Black Sludge ofrecen «Recuperar PG — Acción adicional» y curan a su propio portador. Se usa la actividad
nativa de D&D5e para resolver sus efectos y consumo. Sin cargas o sin permisos,
el botón queda desactivado. Los objetos pasivos no muestran botones de uso.
Las bayas piden confirmación antes de gastarse: cancelar o cerrar la ventana
conserva la cantidad. Las bayas curativas publican su resultado después del uso y
curan al Pokémon que las consumió cuando se muestra esa tirada en el chat.
Esperan a que termine Dice So Nice si hay una animación y a que el resultado deje
de estar oculto. El chat pinta el resultado antes de cambiar los PG, incluso
si ya se eliminó la última unidad del inventario. No superan los PG máximos ni
reviven al Pokémon. Volver a renderizar el resultado no repite la curación; cada
uso queda registrado junto con el cambio de PG. Las otras bayas no generan tiradas
de curación: sus efectos de PP, estados o reducción de daño se resuelven manualmente.
El contacto sigue la clasificación cuerpo a cuerpo usada por el módulo.

## Pendiente

Continúan manuales los Choice items, los efectos no curativos de las bayas, cambios de forma,
objetos de evolución y otros objetos que no figuran en la tabla de cobertura.
Toxic Orb necesita implementar primero el estado Gravemente envenenado: el
motor actual reconoce su identificador, pero no construye ni procesa ese estado.
De las 61 descripciones caseras añadidas, los cinco inciensos, Punching Glove,
Expert Belt, Binding Band, Rocky Helmet y Sticky Barb tienen automatización.
Las otras 51 siguen siendo manuales, salvo la protección parcial de Protective
Pads descrita arriba. El inventario de objetos,
sus fuentes y los criterios están en [ITEM_DESCRIPTION_ADAPTATIONS.md](ITEM_DESCRIPTION_ADAPTATIONS.md).

## Verificación

Ejecutar `node --test tests/held-item-engine.test.mjs tests/held-item-contact.test.mjs tests/binding-items.test.mjs tests/periodic-engine.integration.test.mjs`.
Las pruebas cubren correspondencia con el catálogo, tipos, alcance, críticos,
varios objetivos, varias tiradas, concurrencia, inmunidad/daño cero, PG temporales,
límites de curación, estados y eliminación de efectos.
También se comprueba que todos los objetos del catálogo que añaden competencia
al daño de un tipo estén registrados, incluidos los inciensos y Metal Coat.
Las pruebas Node usan simulaciones de Foundry; queda por verificar la interfaz
y los documentos reales dentro de una sesión de Foundry.
