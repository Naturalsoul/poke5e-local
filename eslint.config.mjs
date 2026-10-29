import js from "@eslint/js";
import globals from "globals";

/**
 * Globales expuestos por Foundry VTT en runtime.
 *
 * Mantener esta lista deliberadamente limitada.
 * Solo agregar nuevas globales cuando realmente sean utilizadas
 * por el proyecto y formen parte de la API de Foundry/D&D5e.
 */
const foundryGlobals = {
  foundry: "readonly",
  game: "readonly",
  Hooks: "readonly",
  ui: "readonly",
  canvas: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  Actor: "readonly",
  Item: "readonly",
  ActiveEffect: "readonly",
  Folder: "readonly",
  Scene: "readonly",
  ChatMessage: "readonly",
  Roll: "readonly",
  Dialog: "readonly",
  TextEditor: "readonly",
  fromUuid: "readonly",
  fromUuidSync: "readonly",
};

export default [
  {
    name: "pokemon-foundry/ignores",

    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
    ],
  },

  js.configs.recommended,

  {
    name: "pokemon-foundry/source",

    files: ["**/*.{js,mjs}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      globals: {
        ...globals.browser,
        ...foundryGlobals,
      },
    },

    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },

    rules: {
      /*
       * ============================================================
       * CORRECCIÓN
       * ============================================================
       */

      "no-undef": "error",

      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      "no-shadow": "error",

      "no-use-before-define": [
        "error",
        {
          functions: false,
          classes: true,
          // Closures that run after the declaration are safe; same-scope TDZ is still reported.
          variables: false,
        },
      ],

      "no-duplicate-imports": "error",

      /*
       * ============================================================
       * VARIABLES Y MUTABILIDAD
       * ============================================================
       */

      "no-var": "error",

      "prefer-const": [
        "error",
        {
          destructuring: "all",
          ignoreReadBeforeAssign: true,
        },
      ],

      "no-param-reassign": [
        "error",
        {
          props: false,
        },
      ],

      /*
       * ============================================================
       * CONTROL DE FLUJO
       * ============================================================
       */

      "eqeqeq": [
        "error",
        "always",
        {
          null: "ignore",
        },
      ],

      "curly": ["error", "all"],

      "consistent-return": "error",

      "no-else-return": [
        "error",
        {
          allowElseIf: false,
        },
      ],

      "no-lonely-if": "error",

      // shortcut: warn while ~45 of 55 hits are inline `language === "en"` picks; raise to error after the i18n layer lands.
      "no-nested-ternary": "warn",

      "no-unneeded-ternary": "error",

      "no-return-assign": ["error", "always"],

      /*
       * ============================================================
       * OBJETOS Y EXPRESIVIDAD
       * ============================================================
       */

      "object-shorthand": ["error", "always"],

      "prefer-object-spread": "error",

      "radix": "error",

      /*
       * ============================================================
       * LOGGING
       * ============================================================
       */

      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],

      /*
       * ============================================================
       * COMPLEJIDAD / SOLID
       *
       * Son warnings deliberadamente.
       * Señalan funciones candidatas a refactor sin bloquear
       * inmediatamente el desarrollo.
       * ============================================================
       */

      "complexity": ["warn", 15],

      "max-depth": ["warn", 4],

      "max-params": ["warn", 4],

      "max-nested-callbacks": ["warn", 4],

      "max-lines-per-function": [
        "warn",
        {
          max: 120,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },

  /*
   * ============================================================
   * TOOLING NODE
   * ============================================================
   */
  {
    name:
      "pokemon-foundry/node-tools",

    files: [
      "scripts/**/*.{js,mjs}",
      "tests/**/*.{js,mjs}"
    ],

    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  /*
   * El propio archivo de configuración se ejecuta en Node.js.
   */
  {
    name: "pokemon-foundry/node-config",

    files: ["eslint.config.{js,mjs,cjs}"],

    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];