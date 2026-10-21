import { playerTeams, pokemonLevel } from "./encounter-difficulty.mjs";
import { encounterShare, getEncounterXpRules, poolExpShare } from "./encounter-xp-service.mjs";
import { addPokemonExperience } from "./pokemon-experience-service.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

const holdsExpShare = actor => {
  try {
    return getPokemonHeldItem(actor)?.getFlag("poke5e-local", "sourceId") === "exp-share";
  } catch {
    return false;
  }
};

// The players' Pokémon by trainer, as cards to tick, each with its XP.
function renderContent(teams, optional, expShareTrainerOnly) {
  return `
    <p class="poke5e-xp-award__hint">
      Marca los Pokémon que participaron y siguen en pie: la XP se divide entre ellos${
        optional ? ". Encuentro opcional: los más débiles reciben más (XP de recuperación)" : ""}.
    </p>
    ${teams.some(({ pokemon }) => pokemon.some(holdsExpShare)) ? `
    <p class="poke5e-xp-award__hint">
      <i class="fa-solid fa-share-nodes" aria-hidden="true"></i>
      Repartir Experiencia: aunque no combata, cuenta como un participante más ${expShareTrainerOnly
        ? "entre los Pokémon de su Entrenador (regla casera)"
        : "del combate"}. Si combatió, márcalo: recibe su parte normal.
    </p>` : ""}
    <div class="poke5e-xp-award__list">
      ${teams.map(({ trainer, pokemon }) => `
        <section class="poke5e-xp-award__trainer">
          <h4>${escape(trainer.name)}</h4>
          <div class="poke5e-xp-award__grid">
            ${pokemon.map(actor => `
              <label class="poke5e-xp-award__pokemon${holdsExpShare(actor) ? " is-exp-share" : ""}">
                <input type="checkbox" data-uuid="${actor.uuid}" data-level="${pokemonLevel(actor)}"
                  data-trainer="${trainer.id}"${holdsExpShare(actor) ? " data-exp-share" : ""}>
                <img src="${escape(actor.img)}" alt="">
                <span class="poke5e-xp-award__name">
                  <strong>${escape(actor.name)}</strong>
                  <small>Nv. ${pokemonLevel(actor)}${holdsExpShare(actor)
                    ? ' · <i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Repartir Experiencia'
                    : ""}</small>
                </span>
                <span class="poke5e-xp-award__share">
                  <input type="number" data-share="${actor.uuid}" min="0" step="1" value="0" disabled
                    aria-label="XP para ${escape(actor.name)}">
                  <small>XP</small>
                </span>
              </label>`).join("")}
          </div>
        </section>`).join("")}
    </div>
    <p class="poke5e-xp-award__summary" data-role="summary">Ningún Pokémon marcado.</p>`;
}

/**
 * After the fight: the GM ticks the players' Pokémon that took part and are still standing, each gets its share
 * (catch-up XP in an optional encounter, so the weaker get more), editable before it's given. A chat message (to the
 * GM) sums up the XP, the money of a trainer battle (poke5e: highest level d4 × 100 per trainer) and any loot.
 *
 * @param {{ rows: { level: number, sr: any, quantity: number }[], context: object | null, optional: boolean,
 *   name: string, trainers: number, loot: string[] }} encounter
 */
export async function awardEncounterXp({ rows, context, optional, name, trainers, loot }) {
  const teams = playerTeams().filter(({ pokemon }) => pokemon.length);
  const { expShareTrainerOnly } = getEncounterXpRules();
  if (!teams.length) {
    ui.notifications.warn("No hay Pokémon de jugadores a los que repartir XP.");
    return;
  }

  const content = renderContent(teams, optional, expShareTrainerOnly);

  const summarize = element => {
    const given = [...element.querySelectorAll("[data-share]")].filter(input => !input.disabled && Number(input.value) > 0);
    element.querySelector('[data-role="summary"]').textContent = given.length
      ? `${given.length} Pokémon · ${given.reduce((sum, input) => sum + Number(input.value), 0).toLocaleString()} XP en total`
      : "Ningún Pokémon marcado.";
  };

  // Every share from zero: the fighters, and the Exp. Share holders that didn't fight as one more participant.
  const refresh = element => {
    const boxes = [...element.querySelectorAll("input[type=checkbox]")];
    const fighters = boxes.filter(box => box.checked);
    const idle = fighters.length ? boxes.filter(box => !box.checked && box.hasAttribute("data-exp-share")) : [];
    const participants = fighters.length + (expShareTrainerOnly ? 0 : idle.length);
    const shares = [...fighters, ...idle].map(box => ({ box, trainer: box.dataset.trainer, holder: !box.checked,
      xp: encounterShare(rows, Number(box.dataset.level), participants, { context, optional }) }));
    const xps = expShareTrainerOnly ? poolExpShare(shares) : shares.map(share => share.xp);
    for (const box of boxes) {
      const input = element.querySelector(`[data-share="${box.dataset.uuid}"]`);
      const index = shares.findIndex(share => share.box === box);
      input.disabled = index < 0;
      input.value = index < 0 ? 0 : xps[index];
    }
    summarize(element);
  };

  const awarded = await foundry.applications.api.DialogV2.wait({
    window: { title: `Repartir XP · ${name}`, icon: "fa-solid fa-gift" },
    classes: ["poke5e-xp-award"],
    position: { width: 560 },
    content,
    render: (event, dialog) => {
      const element = dialog.element;
      element.querySelectorAll("input[type=checkbox]").forEach(box => box.addEventListener("change", () => refresh(element)));
      // A share edited by hand stays as typed.
      element.querySelectorAll("[data-share]").forEach(input => input.addEventListener("input", () => summarize(element)));
    },
    buttons: [
      {
        action: "award",
        label: "Entregar",
        icon: "fa-solid fa-gift",
        default: true,
        // Those ticked, and the Exp. Share holders that didn't fight.
        callback: (event, button) => [...button.form.querySelectorAll("input[type=checkbox]")]
          .filter(box => !button.form.querySelector(`[data-share="${box.dataset.uuid}"]`).disabled)
          .map(box => ({
            uuid: box.dataset.uuid,
            expShare: !box.checked,
            xp: Math.max(0, Math.trunc(Number(button.form.querySelector(`[data-share="${box.dataset.uuid}"]`).value) || 0))
          }))
      },
      { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!Array.isArray(awarded) || !awarded.length) {return;}

  const lines = [];
  for (const { uuid, xp, expShare } of awarded) {
    const actor = fromUuidSync(uuid);
    if (!actor || !xp) {continue;}
    const before = pokemonLevel(actor);
    await addPokemonExperience(actor, xp);
    const after = pokemonLevel(actor);
    lines.push(`<li>${escape(actor.name)}: +${xp} XP${expShare ? " (Repartir Experiencia)" : ""}${after > before ? ` → <strong>Nv. ${after}</strong>` : ""}</li>`);
  }

  let money = "";
  if (trainers > 0) {
    const highest = Math.max(1, ...rows.map(row => row.level));
    const roll = await new Roll(`${trainers * highest}d4 * 100`).evaluate();
    money = `<p>Dinero (${trainers} × ${highest}d4 × 100): <strong>${roll.total} ₽</strong></p>`;
  }

  await ChatMessage.create({
    content: `<h3>${escape(name)}${optional ? " (opcional)" : ""}</h3><ul>${lines.join("")}</ul>${money}${
      loot.length ? `<p>Botín sugerido:</p><ul>${loot.map(each => `<li>${escape(each)}</li>`).join("")}</ul>` : ""}`,
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}
