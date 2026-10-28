import { playerTeams, pokemonLevel } from "./encounter-difficulty.mjs";
import { encounterShare, getEncounterXpRules, poolExpShare } from "./encounter-xp-service.mjs";
import { addPokemonExperience, getPokemonExperienceState } from "./pokemon-experience-service.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { showExperienceGain, withoutLevel } from "./xp-gain-animation.mjs";

/* ============================================================
 * ENCOUNTER REWARD
 *
 * After the fight the GM ticks the players' Pokémon that took part and publishes a card in the chat with each one's
 * share. Each player gives it to their own Pokémon with "Recibir" (the level-ups feel theirs), which plays the
 * animated EXP bar. Only XP: money and loot are the GM's. Who already received it is kept on the Pokémon, so it
 * can't be given twice.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const CLAIMED = "claimedRewards";

const LABELS = {
  es: { speaker: "Recompensa", subtitle: "Experiencia del combate", claim: "Recibir", received: "Recibida", expShare: "Repartir Experiencia",
    gone: "Ese Pokémon ya no existe.", already: name => `${name} ya recibió esta experiencia.` },
  en: { speaker: "Reward", subtitle: "Battle experience", claim: "Receive", received: "Received", expShare: "Exp. Share",
    gone: "That Pokémon no longer exists.", already: name => `${name} already received this experience.` }
};
const labels = () => LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"];

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

const holdsExpShare = actor => {
  try {
    return getPokemonHeldItem(actor)?.getFlag(MODULE_ID, "sourceId") === "exp-share";
  } catch {
    return false;
  }
};

const isClaimed = (actor, messageId) => (actor?.getFlag(MODULE_ID, CLAIMED) ?? []).includes(messageId);

// The players' Pokémon by trainer, as cards to tick, each with its XP.
function renderContent(teams, expShareTrainerOnly) {
  return `
    <p class="poke5e-xp-award__hint">
      Marca los Pokémon que participaron y siguen en pie: la XP se divide entre ellos. Cada jugador la recibe desde
      el chat.
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
                  <strong>${escape(withoutLevel(actor.name))}</strong>
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

function renderCard(name, entries) {
  const text = labels();
  return `
    <div class="poke5e-xp-reward">
      <header class="poke5e-xp-reward__header">
        <i class="fa-solid fa-star" aria-hidden="true"></i>
        <span>
          <strong>${escape(name)}</strong>
          <small>${escape(text.subtitle)}</small>
        </span>
      </header>
      <ul class="poke5e-xp-reward__list">
        ${entries.map(entry => `
          <li class="poke5e-xp-reward__entry">
            <img src="${escape(entry.img)}" alt="">
            <span class="poke5e-xp-reward__name">
              <strong>${escape(entry.name)}</strong>
              <small>+${entry.xp.toLocaleString()} XP${entry.expShare ? ` · ${escape(text.expShare)}` : ""}</small>
            </span>
            <button type="button" data-action="poke5e-claim-xp" data-uuid="${entry.uuid}">
              <i class="fa-solid fa-hand-sparkles" aria-hidden="true"></i>
              ${escape(text.claim)}
            </button>
          </li>`).join("")}
      </ul>
    </div>`;
}

/**
 * The GM ticks the Pokémon that took part (shares editable before publishing) and the card goes to the chat.
 *
 * @param {{ rows: { level: number, sr: any, quantity: number }[], context: object | null, name: string }} encounter
 */
export async function publishEncounterReward({ rows, context, name }) {
  const teams = playerTeams().filter(({ pokemon }) => pokemon.length);
  const { expShareTrainerOnly } = getEncounterXpRules();
  if (!teams.length) {
    ui.notifications.warn("No hay Pokémon de jugadores a los que dar XP.");
    return;
  }

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
      xp: encounterShare(rows, Number(box.dataset.level), participants, { context }) }));
    const xps = expShareTrainerOnly ? poolExpShare(shares) : shares.map(share => share.xp);
    for (const box of boxes) {
      const input = element.querySelector(`[data-share="${box.dataset.uuid}"]`);
      const index = shares.findIndex(share => share.box === box);
      input.disabled = index < 0;
      input.value = index < 0 ? 0 : xps[index];
    }
    summarize(element);
  };

  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: `Publicar recompensa · ${name}`, icon: "fa-solid fa-star" },
    classes: ["poke5e-xp-award"],
    position: { width: 560 },
    content: renderContent(teams, expShareTrainerOnly),
    render: (event, dialog) => {
      const element = dialog.element;
      element.querySelectorAll("input[type=checkbox]").forEach(box => box.addEventListener("change", () => refresh(element)));
      // A share edited by hand stays as typed.
      element.querySelectorAll("[data-share]").forEach(input => input.addEventListener("input", () => summarize(element)));
    },
    buttons: [
      {
        action: "publish",
        label: "Publicar en el chat",
        icon: "fa-solid fa-star",
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
  if (!Array.isArray(chosen)) {return;}

  const entries = chosen.filter(entry => entry.xp > 0).map(entry => {
    const actor = fromUuidSync(entry.uuid);
    return actor && { ...entry, name: actor.name, img: actor.img };
  }).filter(Boolean);
  if (!entries.length) {return;}

  await ChatMessage.create({
    // Not the GM's assigned character.
    speaker: { alias: labels().speaker },
    content: renderCard(name, entries),
    flags: { [MODULE_ID]: { reward: { name, entries } } }
  });
}

/**
 * Gives a Pokémon its share of a reward card, once. Marked before the XP goes in, so a double click can't give it
 * twice. What the trainer's level cap cuts off comes back as lost.
 */
export async function claimReward(message, uuid) {
  const entry = message.getFlag(MODULE_ID, "reward")?.entries?.find(each => each.uuid === uuid);
  const actor = entry ? fromUuidSync(uuid, { strict: false }) : null;
  if (!actor) {throw new Error(labels().gone);}
  if (isClaimed(actor, message.id)) {throw new Error(labels().already(actor.name));}
  const before = getPokemonExperienceState(actor);
  await actor.setFlag(MODULE_ID, CLAIMED, [...(actor.getFlag(MODULE_ID, CLAIMED) ?? []), message.id]);
  const after = await addPokemonExperience(actor, entry.xp);
  const gained = after.total - before.total;
  return { actor, before, after, gained, lost: entry.xp - gained };
}

function onRenderChatMessage(message, html) {
  if (!message.getFlag?.(MODULE_ID, "reward")) {return;}
  for (const button of html.querySelectorAll('[data-action="poke5e-claim-xp"]')) {
    const actor = fromUuidSync(button.dataset.uuid, { strict: false });
    if (isClaimed(actor, message.id)) {
      const badge = document.createElement("span");
      badge.className = "poke5e-xp-reward__received";
      badge.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> ${escape(labels().received)}`;
      button.replaceWith(badge);
      continue;
    }
    // Its owner gives it (the GM too, for an absent player).
    button.disabled = !actor?.isOwner;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        showExperienceGain(await claimReward(message, button.dataset.uuid));
      } catch (error) {
        ui.notifications.warn(error.message);
        button.disabled = false;
      }
    });
  }
}

// Everyone's card shows who already received it.
function onUpdateActor(actor, changes) {
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${CLAIMED}`)) {return;}
  for (const message of game.messages ?? []) {
    if (message.getFlag(MODULE_ID, "reward")?.entries?.some(entry => entry.uuid === actor.uuid)) {
      ui.chat?.updateMessage?.(message);
    }
  }
}

export function registerEncounterReward() {
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  Hooks.on("updateActor", onUpdateActor);
}
