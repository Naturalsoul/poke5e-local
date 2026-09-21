const MODULE_ID =
  "poke5e-local";

const SFX_ASSET_ROOT =
  `modules/${MODULE_ID}/assets/audio/sfx`;

const SFX_VOLUME =
  0.10;

const SFX_PATHS = {
  deploy:
    `${SFX_ASSET_ROOT}/pokeball-deploy.mp3`,

  recall:
    `${SFX_ASSET_ROOT}/pokeball-recall.mp3`
};


export async function playTrainerBattleSfx(
  reason
) {

  const src =
    SFX_PATHS[
      reason
    ];


  if (!src) {
    return false;
  }


  try {

    await foundry.audio
      .AudioHelper
      .preloadSound(
        src
      );


    foundry.audio
      .AudioHelper
      .play(
        {
          src,

          autoplay:
            true,

          loop:
            false,

          channel:
            "interface",

          volume:
            SFX_VOLUME
        },

        true
      );


    return true;

  } catch {

    /*
     * Un archivo de audio ausente
     * nunca debe bloquear una acción
     * Trainer.
     */

    return false;
  }
}