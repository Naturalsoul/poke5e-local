// Only one client may run automation: the active GM, or any GM when none is marked active.
export function isAuthority() {
  const activeGM = game.users?.activeGM;
  return activeGM ? activeGM.id === game.user.id : game.user.isGM;
}

// Accepts an Actor or a Token/Item UUID; anything else or a bad UUID gives null.
export function actorFromUuid(uuid) {
  if (!uuid) {
    return null;
  }
  try {
    const document = fromUuidSync(uuid, { strict: false });
    return document?.documentName === "Actor" ? document : document?.actor ?? null;
  } catch {
    return null;
  }
}
