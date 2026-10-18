# Descripciones y reglas caseras añadidas

Auditoría del 17 de octubre de 2026: se encontraron 61 objetos sin descripción en
español ni inglés: 51 equipables y 10 medicinas. Se completaron los dos idiomas
en `data/normalized/items.json`; los otros 305 objetos conservaron sus reglas.

Estas son **adaptaciones locales**, no reglas oficiales de Pokémon 5e ni copias
literales de los videojuegos. Los cinco inciensos, Punching Glove, Expert Belt,
Binding Band, Rocky Helmet y Sticky Barb tienen automatización; los otros 51
objetos siguen siendo manuales, con protección
parcial para Protective Pads. La cobertura está en [HELD_ITEMS.md](HELD_ITEMS.md).
La ficha del objeto muestra
la procedencia en el apartado Source: «Poke5e Local — Regla casera adaptada de los
videojuegos». Ese bloque se oculta en las fichas de los jugadores; la descripción
contiene únicamente el texto del objeto.

La segunda revisión presenta los 61 objetos con una redacción de reglas más breve,
similar a la de los objetos existentes. Al cargar el mundo se actualizan los textos
generados anteriores y se retira su aviso de la descripción. Las descripciones
editadas por el GM conservan su contenido.

## Criterios de adaptación

- Bonos por tipo: competencia una vez por movimiento, como Charcoal o Mystic Water.
- Mejoras consumibles: +2 a ataques o CD, +1 a CA o salvaciones, y velocidades en
  pies; duración de 1 minuto o hasta salir del combate, sin acumular el mismo objeto.
- Los disparadores por recibir daño requieren daño positivo y se resuelven después
  del movimiento. Se especifica cuándo se consume cada objeto.
- Las plumas necesitan diez unidades, equivalentes a una vitamina; comparten el
  límite de tres vitaminas y el máximo de 20 del catálogo existente. Las equivalencias
  STR/DEX/CON/WIS/CHA heredan Protein/Iron/Calcium/Zinc/Carbos de este módulo,
  aunque no sean equivalencias directas de estadísticas de los videojuegos.
- Max Honey usa la recuperación de Max Revive de este catálogo (4d12 + 10), no
  curación ilimitada. Las recetas de Gigamax requieren reglas de campaña existentes.
- Loaded Dice mejora una comprobación de continuación del combo; no garantiza cuatro
  impactos porque los combos de este catálogo usan dados de continuación propios.
- Light Clay prolonga una ronda las barreras de la versión 5e, incluidas Reflejo y
  Pantalla Luz que aquí terminan al inicio del siguiente turno; no importa ocho turnos
  desde los videojuegos. Room Service usa la inversión de iniciativa local.
- Booster Energy activa los beneficios ambientales de Paleosíntesis o Carga Cuark
  según sus descripciones de Pokémon 5e; no introduce las etapas de estadísticas.
- Red Card expulsa al atacante. Protective Pads protege al usar contacto; no protege
  contra cualquier ataque entrante. Sticky Barb no causa daño extra al transferirse.
  Sus referencias internas se corrigieron tras consultar las fuentes indicadas.

## Objetos identificados y procedencia

La referencia interna es el texto preexistente de `referenceEffect`, usado como
base cuando estaba disponible. «Consulta» enlaza una página revisada en esta
auditoría. Las decisiones de conversión a 5e son propias de este módulo.

| ID | Categoría | Base del efecto en videojuegos |
| --- | --- | --- |
| `ability-patch` | Medicina | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Ability_Patch) |
| `ability-shield` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Ability_Shield) |
| `absorb-bulb` | Equipable | Referencia interna (`referenceEffect`) |
| `adrenaline-orb` | Equipable | Referencia interna (`referenceEffect`) |
| `binding-band` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Binding_Band) |
| `blunder-policy` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Blunder_Policy) |
| `booster-energy` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Booster_Energy) |
| `bright-powder` | Equipable | Referencia interna (`referenceEffect`) |
| `cell-battery` | Equipable | Referencia interna (`referenceEffect`) |
| `clear-amulet` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Clear_Amulet) |
| `clever-wing` | Medicina | Referencia interna (`referenceEffect`) |
| `covert-cloak` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Covert_Cloak) |
| `destiny-knot` | Equipable | Referencia interna (`referenceEffect`) |
| `eject-pack` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Eject_Pack) |
| `electric-seed` | Equipable | Referencia interna (`referenceEffect`) |
| `expert-belt` | Equipable | Referencia interna (`referenceEffect`) |
| `float-stone` | Equipable | Referencia interna (`referenceEffect`) |
| `full-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `genius-wing` | Medicina | Referencia interna (`referenceEffect`) |
| `grassy-seed` | Equipable | Referencia interna (`referenceEffect`) |
| `grip-claw` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Grip_Claw) |
| `health-wing` | Medicina | Referencia interna (`referenceEffect`) |
| `heavy-duty-boots` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Heavy-Duty_Boots) |
| `iron-ball` | Equipable | Referencia interna (`referenceEffect`) |
| `lagging-tail` | Equipable | Referencia interna (`referenceEffect`) |
| `lax-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `light-clay` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Light_Clay) |
| `loaded-dice` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Loaded_Dice) |
| `luminous-moss` | Equipable | Referencia interna (`referenceEffect`) |
| `max-honey` | Medicina | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Max_Honey) |
| `max-mushrooms` | Medicina | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Max_Mushrooms) |
| `mental-herb` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Mental_Herb) |
| `metronome` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Metronome_(item)) |
| `misty-seed` | Equipable | Referencia interna (`referenceEffect`) |
| `muscle-wing` | Medicina | Referencia interna (`referenceEffect`) |
| `odd-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `pewter-crunchies` | Medicina | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Pewter_Crunchies) |
| `power-herb` | Equipable | Referencia interna (`referenceEffect`) |
| `protective-pads` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Protective_Pads) |
| `psychic-seed` | Equipable | Referencia interna (`referenceEffect`) |
| `punching-glove` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Punching_Glove) |
| `red-card` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Red_Card) |
| `resist-wing` | Medicina | Referencia interna (`referenceEffect`) |
| `ring-target` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Ring_Target) |
| `rock-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `rocky-helmet` | Equipable | Referencia interna (`referenceEffect`) |
| `room-service` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Room_Service) |
| `rose-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `safety-goggles` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Safety_Goggles) |
| `sea-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `shed-shell` | Equipable | Referencia interna (`referenceEffect`) |
| `snowball` | Equipable | Referencia interna (`referenceEffect`) |
| `sticky-barb` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Sticky_Barb) |
| `swift-wing` | Medicina | Referencia interna (`referenceEffect`) |
| `terrain-extender` | Equipable | Referencia interna (`referenceEffect`) |
| `throat-spray` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Throat_Spray) |
| `utility-umbrella` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Utility_Umbrella) |
| `wave-incense` | Equipable | Referencia interna (`referenceEffect`) |
| `weakness-policy` | Equipable | Referencia interna (`referenceEffect`) |
| `white-herb` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/White_Herb) |
| `zoom-lens` | Equipable | [Consulta](https://bulbapedia.bulbagarden.net/wiki/Zoom_Lens) |
