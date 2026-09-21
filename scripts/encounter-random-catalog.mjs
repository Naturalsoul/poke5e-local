export const RANDOM_REGION_ALL =
  "__all-regions__";

export const RANDOM_BIOME_ROUTE =
  "__route-mixed__";

export class EncounterRandomCatalog {
  constructor(
    pokemon = []
  ) {
    this.pokemon = (
      Array.isArray(
        pokemon
      )
        ? pokemon
        : []
    ).filter(
      entry =>
        entry &&
        typeof entry === "object" &&
        entry.id
    );
  }


  regions() {
    return uniqueSorted(
      this.pokemon.flatMap(
        pokemon =>
          normalizeStringArray(
            pokemon.habitat?.regions
          )
      )
    );
  }


  biomes(
    region = ""
  ) {
    const normalizedRegion =
      String(
        region ??
        ""
      ).trim();


    const source =
      normalizedRegion
        ? this.pokemon.filter(
            pokemon =>
              normalizeStringArray(
                pokemon.habitat?.regions
              ).includes(
                normalizedRegion
              )
          )
        : this.pokemon;


    return uniqueSorted(
      source.flatMap(
        pokemon =>
          normalizeStringArray(
            pokemon.habitat?.biomes
          )
      )
    );
  }


  srValues() {
    return [
      ...new Set(
        this.pokemon
          .map(
            pokemon =>
              Number(
                pokemon.sr
              )
          )
          .filter(
            value =>
              Number.isFinite(
                value
              ) &&
              value >= 0
          )
      )
    ].sort(
      (
        left,
        right
      ) =>
        left -
        right
    );
  }


  candidates({
    region,
    biome,
    maxLevel,
    minSr = null,
    maxSr = null
  }) {
    const normalizedRegion =
      normalizeRequiredText(
        region,
        "Se requiere una región para generar un encuentro aleatorio."
      );


    const normalizedBiome =
      normalizeRequiredText(
        biome,
        "Se requiere un bioma para generar un encuentro aleatorio."
      );


    const normalizedMaxLevel =
      clampInteger(
        maxLevel,
        1,
        20,
        20
      );


    const normalizedMinSr =
      normalizeOptionalNumber(
        minSr
      );


    const normalizedMaxSr =
      normalizeOptionalNumber(
        maxSr
      );


    const allRegions =
      normalizedRegion ===
        RANDOM_REGION_ALL;


    const mixedRoute =
      normalizedBiome ===
        RANDOM_BIOME_ROUTE;


    return this.pokemon.filter(
      pokemon => {
        const habitat =
          pokemon.habitat ??
          {};


        const regions =
          normalizeStringArray(
            habitat.regions
          );


        const biomes =
          normalizeStringArray(
            habitat.biomes
          );


        const minimumLevel =
          getPokemonMinimumLevel(
            pokemon
          );


        const sr =
          Number(
            pokemon.sr
          );


        if (
          !Number.isFinite(
            sr
          )
        ) {
          return false;
        }


        if (
          normalizedMinSr != null &&
          sr <
            normalizedMinSr
        ) {
          return false;
        }


        if (
          normalizedMaxSr != null &&
          sr >
            normalizedMaxSr
        ) {
          return false;
        }


        const regionMatches =
          allRegions ||
          regions.includes(
            normalizedRegion
          );


        const biomeMatches =
          mixedRoute ||
          biomes.includes(
            normalizedBiome
          );


        return (
          regionMatches &&
          biomeMatches &&
          minimumLevel <=
            normalizedMaxLevel
        );
      }
    );
  }

  trainerCandidates({
    region = "",
    maxLevel,
    minSr = null,
    maxSr = null
  }) {
    const normalizedRegion =
      String(
        region ??
        ""
      ).trim();


    const normalizedMaxLevel =
      clampInteger(
        maxLevel,
        1,
        20,
        20
      );


    const normalizedMinSr =
      normalizeOptionalNumber(
        minSr
      );


    const normalizedMaxSr =
      normalizeOptionalNumber(
        maxSr
      );


    return this.pokemon.filter(
      pokemon => {
        const regions =
          normalizeStringArray(
            pokemon.habitat?.regions
          );


        const minimumLevel =
          getPokemonMinimumLevel(
            pokemon
          );


        const sr =
          Number(
            pokemon.sr
          );


        if (
          normalizedRegion &&
          !regions.includes(
            normalizedRegion
          )
        ) {
          return false;
        }


        if (
          minimumLevel >
            normalizedMaxLevel ||
          !Number.isFinite(
            sr
          )
        ) {
          return false;
        }


        if (
          normalizedMinSr != null &&
          sr <
            normalizedMinSr
        ) {
          return false;
        }


        if (
          normalizedMaxSr != null &&
          sr >
            normalizedMaxSr
        ) {
          return false;
        }


        return true;
      }
    );
  }
}


function uniqueSorted(
  values
) {
  return [
    ...new Set(
      values
        .map(
          value =>
            String(
              value ??
              ""
            ).trim()
        )
        .filter(Boolean)
    )
  ].sort(
    (
      left,
      right
    ) =>
      left.localeCompare(
        right,
        "en",
        {
          sensitivity:
            "base"
        }
      )
  );
}


function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  return value
    .map(
      entry =>
        String(
          entry ??
          ""
        ).trim()
    )
    .filter(Boolean);
}


function normalizeRequiredText(
  value,
  errorMessage
) {
  const text =
    String(
      value ??
      ""
    ).trim();


  if (!text) {
    throw new Error(
      errorMessage
    );
  }


  return text;
}


function normalizeOptionalNumber(
  value
) {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }


  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}


function getPokemonMinimumLevel(
  pokemon
) {
  return clampInteger(
    pokemon?.minimumLevel,
    1,
    20,
    1
  );
}


function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(
      value
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }


  return Math.min(
    max,
    Math.max(
      min,
      Math.trunc(
        numeric
      )
    )
  );
}