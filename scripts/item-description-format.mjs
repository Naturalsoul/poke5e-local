export const ADAPTED_ITEM_NOTICES = [
  "House rule adapted from the video games.",
  "Regla casera adaptada de los videojuegos."
];

export function adaptedItemSource(language = "es") {
  const notice = ADAPTED_ITEM_NOTICES[language === "en" ? 0 : 1];
  return `Poke5e Local — ${notice}`;
}

export function stripAdaptedItemNotice(html) {
  let result = html;
  for (const notice of ADAPTED_ITEM_NOTICES) {
    result = result.replace(`<p><em>${notice}</em></p>`, "");
  }
  return result === html ? html : result.trim();
}

// Identifica el texto generado anterior para conservar las ediciones del GM.
// Solo se usa para migración de contenido, no para seguridad.
export function itemDescriptionFingerprint(text) {
  let hash = 0xcbf29ce484222325n;
  for (const character of text) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0))) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
