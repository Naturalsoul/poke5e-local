# Pokemon FoundryVTT — Regression Suite v1 · Fase 8

## Estado

- Node regression suite: **114 tests PASS**
- `node --check`: **PASS**
- ESLint en este entorno: no ejecutable (`eslint: not found`)
- Foundry smoke runner: validado por el usuario con **0 FAIL** después de corregir el registro de statuses.

## Base heredada de la fase 7

Agregar fixtures reales y temporales dentro de Foundry VTT para comprobar la integración que un mock Node no puede garantizar.

La fase 7 NO modifica los Pokémon originales.

El runner:

1. selecciona un Pokémon importado;
2. crea un Actor world temporal clonado;
3. elimina ActiveEffects y estado runtime del clon;
4. prueba daño tipado real mediante `Actor5e.applyDamage()`;
5. crea una Scene temporal inactiva;
6. crea en ella un Token no enlazado para comprobar un synthetic Actor;
7. elimina Scene y Actor temporal en `finally`.

## Cobertura Foundry real añadida

### Damage integration

Se compara la tabla canónica `calculatePokemonDefenses()` con el resultado efectivo de D&D5e:

- Resistance: daño base 2 → 1
- Vulnerability: daño base 2 → 4
- Immunity: daño base 2 → 0, si el Pokémon dispone de una inmunidad
- Neutral: daño base 2 → 2
- Direct/typeless: `applyDamage(2)` → 2

Los casos que no existen para el tipo del Pokémon se marcan `SKIP`, no `FAIL`.

### Synthetic Actor

El runner crea una Scene temporal que no se activa y añade un Token con `actorLink: false`.

Se valida:

- `token.actor` existe;
- `token.actor.isToken === true`;
- conserva `flags.poke5e-local.sourceId`.

## Archivos

- `foundry-regression-fixtures.mjs` — nuevo fixture runner.
- `foundry-regression-runner.mjs` — expone `runFixtures()` y `cleanupFixtures()`.
- `eslint.config.mjs` — agrega `Scene` como global Foundry readonly.
- `tests/foundry-regression-fixtures.test.mjs` — 5 regresiones Node nuevas.

## Integración

Copiar a la raíz del módulo:

- `foundry-regression-fixtures.mjs`
- `foundry-regression-runner.mjs`
- `eslint.config.mjs`

`main.mjs` no necesita un nuevo cambio si ya registra `registerFoundryRegressionRunner()` desde la fase 6.

Reiniciar Foundry antes de ejecutar el runner.

## Ejecución

### Smoke

```js
const smoke = await Poke5eRegression.runSmoke();
smoke.summary;
```

### Fixtures reales

```js
const fixtures = await Poke5eRegression.runFixtures();
fixtures.summary;
```

FAIL:

```js
fixtures.checks.filter(
  check => check.status === "fail"
);
```

SKIP:

```js
fixtures.checks.filter(
  check => check.status === "skip"
);
```

### Elegir Actor fuente

```js
const fixtures = await Poke5eRegression.runFixtures({
  actorUuid: "Actor.ID"
});
```

### Cleanup de emergencia

Si Foundry/browser se cierra durante una prueba antes de ejecutar el `finally`:

```js
await Poke5eRegression.cleanupFixtures();
```

Solo elimina documentos marcados con:

`flags.poke5e-local.regressionFixture.kind === "foundry-fixture"`.

## Validación local

```bash
npm run lint
npm test
```

Estado del harness usado para construir esta fase:

```text
1..114
# tests 114
# pass 114
# fail 0
```

## Fase 8 — Foundry Activity Fixtures

Nueva API:

```js
await Poke5eRegression.runActivityFixtures();
```

Ejecuta sobre Actors temporales una Activity `attack` sencilla usando los métodos reales de D&D5e:

1. `AttackActivity.rollAttack()`.
2. `AttackActivity.rollDamage()`.
3. `Actor5e.applyDamage()` con el tipo devuelto por el `DamageRoll`.
4. Compara el daño efectivo con la clasificación Pokémon esperada.
5. Elimina ChatMessages y Actors temporales en `finally`.

### Precondición de seguridad

Antes de ejecutarlo deben existir **0 targets seleccionados** en la escena real. El runner no deselecciona targets del usuario automáticamente; si encuentra alguno devuelve `SKIP`.

Este bloque evita deliberadamente Dynamic Damage, Struggle, Drain, Recoil, Multi-target y Moves con triggers de status para aislar la canalización nativa `Attack → Damage → applyDamage`.
