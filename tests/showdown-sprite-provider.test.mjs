import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpriteCatalogFromNames,
  buildSpriteCandidateNames,
  parseSpriteCatalogHtml,
  resolveShowdownSprite
} from "../scripts/media/showdown-sprite-provider.mjs";


test(
  "parsea solo enlaces GIF del índice",
  () => {

    const catalog =
      parseSpriteCatalogHtml(`
        <a href="pikachu.gif">pikachu.gif</a>
        <a href="charizard-megax.gif">charizard-megax.gif</a>
        <a href="readme.txt">readme.txt</a>
      `);


    assert.equal(
      catalog.byName.has(
        "pikachu"
      ),
      true
    );


    assert.equal(
      catalog.byName.has(
        "charizard-megax"
      ),
      true
    );


    assert.equal(
      catalog.byName.has(
        "readme"
      ),
      false
    );
  }
);


test(
  "resuelve un ID canónico directo",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "pikachu.gif"
      ]);


    const result =
      resolveShowdownSprite(
        {
          id:
            "pikachu",

          name:
            "Pikachu"
        },
        catalog
      );


    assert.equal(
      result.status,
      "resolved"
    );


    assert.equal(
      result.filename,
      "pikachu.gif"
    );
  }
);


test(
  "normaliza separadores repetidos de formas",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "meloetta-pirouette.gif"
      ]);


    const result =
      resolveShowdownSprite(
        {
          id:
            "meloetta---pirouette",

          name:
            "Meloetta Pirouette"
        },
        catalog
      );


    assert.equal(
      result.status,
      "resolved"
    );


    assert.equal(
      result.filename,
      "meloetta-pirouette.gif"
    );
  }
);


test(
  "adapta nombres regionales y sufijo breed",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "tauros-paldea-combat.gif"
      ]);


    const result =
      resolveShowdownSprite(
        {
          id:
            "tauros-paldea-combat-breed",

          name:
            "Tauros Paldean Combat Breed"
        },
        catalog
      );


    assert.equal(
      result.status,
      "resolved"
    );


    assert.equal(
      result.filename,
      "tauros-paldea-combat.gif"
    );
  }
);


test(
  "genera candidatas para formas con descriptores",
  () => {

    const candidates =
      buildSpriteCandidateNames({
        id:
          "darmanitan-galarian-zen-mode",

        name:
          "Darmanitan Galarian Zen Mode"
      });


    assert.equal(
      candidates.includes(
        "darmanitan-galar-zen"
      ),
      true
    );
  }
);

test(
  "mueve la región prefijada al sufijo usado por Showdown",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "rattata-alola.gif",
        "mrmime-galar.gif"
      ]);


    const alolan =
      resolveShowdownSprite(
        {
          id:
            "alolan-rattata",

          name:
            "Alolan Rattata"
        },
        catalog
      );


    const galarian =
      resolveShowdownSprite(
        {
          id:
            "galarian-mr-mime",

          name:
            "Galarian Mr. Mime"
        },
        catalog
      );


    assert.equal(
      alolan.filename,
      "rattata-alola.gif"
    );


    assert.equal(
      galarian.filename,
      "mrmime-galar.gif"
    );
  }
);


test(
  "invierte las formas climáticas de Castform",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "castform-rainy.gif",
        "castform-snowy.gif",
        "castform-sunny.gif"
      ]);


    for (
      const weather
      of [
        "rainy",
        "snowy",
        "sunny"
      ]
    ) {

      const result =
        resolveShowdownSprite(
          {
            id:
              `${weather}-castform`,

            name:
              `${weather} Castform`
          },
          catalog
        );


      assert.equal(
        result.filename,
        `castform-${weather}.gif`
      );
    }
  }
);


test(
  "resuelve aliases explícitos de formas base y nombres invertidos",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "wormadam.gif",
        "wormadam-sandy.gif",
        "giratina.gif",
        "shaymin.gif",
        "meloetta.gif",
        "meowstic.gif",
        "zygarde.gif",
        "hoopa.gif",
        "oricorio.gif",
        "wishiwashi.gif",
        "kyurem-black.gif",
        "kyurem-white.gif",
        "necrozma-dawnwings.gif",
        "necrozma-duskmane.gif",
        "necrozma-ultra.gif",
        "minior.gif",
        "indeedee.gif",
        "basculegion.gif",
        "oinkologne.gif"
      ]);


    const cases = [
      [
        "wormadam-plant-cloak",
        "wormadam.gif"
      ],
      [
        "wormadam-sand-cloak",
        "wormadam-sandy.gif"
      ],
      [
        "giratina-altered-forme",
        "giratina.gif"
      ],
      [
        "shaymin-land",
        "shaymin.gif"
      ],
      [
        "meloetta---aria",
        "meloetta.gif"
      ],
      [
        "meowstic-m",
        "meowstic.gif"
      ],
      [
        "zygarde-50-forme",
        "zygarde.gif"
      ],
      [
        "hoopa-confined",
        "hoopa.gif"
      ],
      [
        "oricorio-baile-style",
        "oricorio.gif"
      ],
      [
        "wishiwashi-solo-form",
        "wishiwashi.gif"
      ],
      [
        "black-kyurem",
        "kyurem-black.gif"
      ],
      [
        "white-kyurem",
        "kyurem-white.gif"
      ],
      [
        "dawn-wings-necrozma",
        "necrozma-dawnwings.gif"
      ],
      [
        "dusk-mane-necrozma",
        "necrozma-duskmane.gif"
      ],
      [
        "ultra-necrozma",
        "necrozma-ultra.gif"
      ],
      [
        "minior-core-form",
        "minior.gif"
      ],
      [
        "indeedee-m",
        "indeedee.gif"
      ],
      [
        "basculegion-m",
        "basculegion.gif"
      ],
      [
        "oinkologne-male",
        "oinkologne.gif"
      ]
    ];


    for (
      const [
        id,
        expected
      ]
      of cases
    ) {

      const result =
        resolveShowdownSprite(
          {
            id,
            name:
              id
          },
          catalog
        );


      assert.equal(
        result.filename,
        expected,
        id
      );
    }
  }
);


test(
  "prioriza filenames conocidos para evitar aliases ambiguos históricos",
  () => {

    const catalog =
      buildSpriteCatalogFromNames([
        "nidoran_f.gif",
        "nidoranf.gif",
        "nidoran_m.gif",
        "nidoranm.gif",
        "mr._mime.gif",
        "mrmime.gif"
      ]);


    const cases = [
      [
        "nidoran-f",
        "nidoranf.gif"
      ],
      [
        "nidoran-m",
        "nidoranm.gif"
      ],
      [
        "mr-mime",
        "mrmime.gif"
      ]
    ];


    for (
      const [
        id,
        expected
      ]
      of cases
    ) {

      const result =
        resolveShowdownSprite(
          {
            id,
            name:
              id
          },
          catalog
        );


      assert.equal(
        result.status,
        "resolved"
      );


      assert.equal(
        result.filename,
        expected
      );
    }
  }
);