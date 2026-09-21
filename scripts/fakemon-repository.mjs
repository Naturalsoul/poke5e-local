import {
  FAKEMON_SCHEMA_VERSION,
  normalizeFakemonEvolution,
  normalizeFakemonOptions,
  normalizeFakemonSpecies,
  normalizeFakemonStore
} from "./fakemon-model.mjs";

const MODULE_ID =
  "poke5e-local";

const SETTING_KEY =
  "fakemonStudioData";

const DEFAULT_STORE =
  Object.freeze({
    schemaVersion:
      FAKEMON_SCHEMA_VERSION,

    species: [],
    evolutions: [],
    optionsBySpeciesId: {}
  });

export function registerFakemonRepositorySettings() {
  game.settings.register(
    MODULE_ID,
    SETTING_KEY,
    {
      name:
        "Fakemon Studio Data",

      hint:
        "Repositorio world-level de especies y evoluciones Fakemon.",

      scope:
        "world",

      config:
        false,

      type:
        Object,

      default:
        DEFAULT_STORE
    }
  );
}

export class FakemonRepository {
  #store = null;

  async load() {
    this.#store =
      normalizeFakemonStore(
        game.settings.get(
          MODULE_ID,
          SETTING_KEY
        )
      );

    return this;
  }

  snapshot() {
    return foundry.utils.deepClone(
      this.#requireLoaded()
    );
  }

  get species() {
    return this.snapshot()
      .species;
  }

  get evolutions() {
    return this.snapshot()
      .evolutions;
  }

  get optionsBySpeciesId() {
    return this.snapshot()
      .optionsBySpeciesId;
  }

  getSpecies(
    id
  ) {
    const normalizedId =
      normalizeLookupId(
        id
      );

    const species =
      this.#requireLoaded()
        .species
        .find(
          entry =>
            entry.id ===
              normalizedId
        );

    return species
      ? foundry.utils.deepClone(
          species
        )
      : null;
  }

  getOptions(
    id
  ) {
    const normalizedId =
      normalizeLookupId(
        id
      );

    const store =
      this.#requireLoaded();

    const exists =
      store.species.some(
        entry =>
          entry.id ===
            normalizedId
      );

    if (!exists) {
      return null;
    }

    return foundry.utils.deepClone(
      store.optionsBySpeciesId[
        normalizedId
      ] ??
      normalizeFakemonOptions()
    );
  }

  async saveSpecies(
    definition,
    {
      options = null
    } = {}
  ) {
    this.#assertWriteAuthority();

    const species =
      normalizeFakemonSpecies(
        definition
      );

    const store =
      this.snapshot();

    const index =
      store.species.findIndex(
        entry =>
          entry.id ===
            species.id
      );

    if (index >= 0) {
      store.species[
        index
      ] =
        species;
    } else {
      store.species.push(
        species
      );
    }

    store.optionsBySpeciesId[
      species.id
    ] =
      normalizeFakemonOptions(
        options ??
        store.optionsBySpeciesId[
          species.id
        ]
      );

    await this.#persist(
      store
    );

    return foundry.utils.deepClone(
      species
    );
  }

  async deleteSpecies(
    id,
    {
      deleteRelatedEvolutions = true
    } = {}
  ) {
    this.#assertWriteAuthority();

    const normalizedId =
      normalizeLookupId(
        id
      );

    const store =
      this.snapshot();

    const previousLength =
      store.species.length;

    store.species =
      store.species.filter(
        entry =>
          entry.id !==
            normalizedId
      );

    if (
      store.species.length ===
        previousLength
    ) {
      return false;
    }

    delete store
      .optionsBySpeciesId[
        normalizedId
      ];

    if (
      deleteRelatedEvolutions
    ) {
      store.evolutions =
        store.evolutions.filter(
          evolution =>
            evolution.from !==
              normalizedId &&
            evolution.to !==
              normalizedId
        );
    }

    await this.#persist(
      store
    );

    return true;
  }

  async saveEvolution(
    definition
  ) {
    this.#assertWriteAuthority();

    const evolution =
      normalizeFakemonEvolution(
        definition
      );

    const store =
      this.snapshot();

    const index =
      store.evolutions.findIndex(
        entry =>
          entry.id ===
            evolution.id &&
          entry.from ===
            evolution.from &&
          entry.to ===
            evolution.to
      );

    if (index >= 0) {
      store.evolutions[
        index
      ] =
        evolution;
    } else {
      store.evolutions.push(
        evolution
      );
    }

    await this.#persist(
      store
    );

    return foundry.utils.deepClone(
      evolution
    );
  }

  async deleteEvolution({
    id,
    from = null,
    to = null
  }) {
    this.#assertWriteAuthority();

    const normalizedId =
      normalizeLookupId(
        id
      );

    const normalizedFrom =
      from == null
        ? null
        : normalizeLookupId(
            from
          );

    const normalizedTo =
      to == null
        ? null
        : normalizeLookupId(
            to
          );

    const store =
      this.snapshot();

    const previousLength =
      store.evolutions.length;

    store.evolutions =
      store.evolutions.filter(
        evolution => {
          if (
            evolution.id !==
              normalizedId
          ) {
            return true;
          }

          if (
            normalizedFrom &&
            evolution.from !==
              normalizedFrom
          ) {
            return true;
          }

          if (
            normalizedTo &&
            evolution.to !==
              normalizedTo
          ) {
            return true;
          }

          return false;
        }
      );

    if (
      store.evolutions.length ===
        previousLength
    ) {
      return false;
    }

    await this.#persist(
      store
    );

    return true;
  }

  async setSpeciesOptions(
    id,
    options
  ) {
    this.#assertWriteAuthority();

    const normalizedId =
      normalizeLookupId(
        id
      );

    const store =
      this.snapshot();

    const exists =
      store.species.some(
        entry =>
          entry.id ===
            normalizedId
      );

    if (!exists) {
      throw new Error(
        `Fakemon no encontrado: ${normalizedId}`
      );
    }

    const normalizedOptions =
      normalizeFakemonOptions(
        options
      );

    store.optionsBySpeciesId[
      normalizedId
    ] =
      normalizedOptions;

    await this.#persist(
      store
    );

    return foundry.utils.deepClone(
      normalizedOptions
    );
  }

  async replaceAll(
    value
  ) {
    this.#assertWriteAuthority();

    await this.#persist(
      normalizeFakemonStore(
        value
      )
    );

    return this.snapshot();
  }

  #assertWriteAuthority() {
    if (
      !game.user.isGM
    ) {
      throw new Error(
        "Solo el GM puede modificar Fakemon Studio."
      );
    }
  }

  #requireLoaded() {
    if (!this.#store) {
      throw new Error(
        "FakemonRepository debe cargarse antes de utilizarse."
      );
    }

    return this.#store;
  }

  async #persist(
    store
  ) {
    const normalized =
      normalizeFakemonStore(
        store
      );

    await game.settings.set(
      MODULE_ID,
      SETTING_KEY,
      normalized
    );

    this.#store =
      normalized;
  }
}

export const fakemonRepository =
  new FakemonRepository();

function normalizeLookupId(
  value
) {
  const id =
    String(
      value ??
        ""
    )
      .trim()
      .toLowerCase();

  if (!id) {
    throw new Error(
      "Se requiere un ID Fakemon."
    );
  }

  return id;
}