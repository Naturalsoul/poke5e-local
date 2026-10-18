import { adaptedItemSource } from "./item-description-format.mjs";

const MODULE_ID = "poke5e-local";
let registered = false;

export function hideAdaptedItemSource(sheet, html) {
  const item = sheet.document;
  if (game.user.isGM || item?.documentName !== "Item" ||
    item.getFlag(MODULE_ID, "rulesOrigin")?.kind !== "homebrew-adaptation") {
    return;
  }
  if (![adaptedItemSource("en"), adaptedItemSource("es")].includes(item.system?.source?.custom)) {
    return;
  }
  const root = html?.querySelectorAll ? html : html?.[0];
  for (const element of root?.querySelectorAll(".source-book, [data-config='source']") ?? []) {
    element.remove();
  }
}

export function registerAdaptedItemSourceUi() {
  if (registered) {
    return;
  }
  registered = true;
  Hooks.on("renderApplicationV2", hideAdaptedItemSource);
  Hooks.on("renderItemSheet", hideAdaptedItemSource);
}
