/* ============================================================
 * TEAM ROCKET RANK
 *
 * The line under the trainer's name ("TEAM ROCKET // RECLUTA").
 * The GM picks the rank from a select; players only see it, and
 * a change from anyone but a GM is rejected.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const FLAG = "rocketRank";
const RANK_CLASS = "poke5e-trainer-rocket-rank";

export const ROCKET_RANKS = Object.freeze([
  { id: "grunt", es: "Recluta", en: "Grunt" },
  { id: "senior-grunt", es: "Alto Rango Recluta", en: "Senior Grunt" },
  { id: "executive", es: "Ejecutivo", en: "Executive" },
  { id: "admin", es: "Administrador", en: "Admin" },
  { id: "chief-admin", es: "Administrador Jefe", en: "Chief Admin" }
]);

const language = () => (game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es");

// Its rank, Recluta when the GM has not picked one.
export function getRocketRank(trainer) {
  const id = trainer?.getFlag?.(MODULE_ID, FLAG);
  return ROCKET_RANKS.find(rank => rank.id === id) ?? ROCKET_RANKS[0];
}

// Only a GM changes the rank, even on an actor its player owns.
export function rejectsRocketRankChange(changes, user) {
  return !user?.isGM && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG}`);
}

export function renderRocketRank(element, trainer) {
  const host = element.querySelector(".sheet-header > .left");
  if (!host) {return;}
  host.querySelector(`.${RANK_CLASS}`)?.remove();
  const lang = language();
  const current = getRocketRank(trainer);
  const line = document.createElement("div");
  line.className = RANK_CLASS;
  line.append("TEAM ROCKET // ");
  if (!game.user.isGM) {
    line.append(current[lang]);
    host.append(line);
    return;
  }
  const select = document.createElement("select");
  select.setAttribute("aria-label", lang === "en" ? "Team Rocket rank" : "Rango en el Team Rocket");
  for (const rank of ROCKET_RANKS) {
    select.append(new Option(rank[lang], rank.id, false, rank.id === current.id));
  }
  select.addEventListener("change", () => { void trainer.setFlag(MODULE_ID, FLAG, select.value); });
  line.append(select);
  host.append(line);
}

export function registerTrainerRocketRank() {
  Hooks.on("preUpdateActor", (_actor, changes, _options, userId) =>
    (rejectsRocketRankChange(changes, game.users.get(userId)) ? false : undefined));
}
