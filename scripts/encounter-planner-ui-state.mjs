function resolvePlannerScrollHosts(
  content
) {

  if (!content) {

    return {
      sidebar:
        null,

      workspace:
        null
    };
  }


  const root =
    content.querySelector(
      ".poke5e-encounter-planner__content"
    );


  return {
    sidebar:
      root?.querySelector(
        ".poke5e-encounter-planner__sidebar"
      ) ??
      null,

    workspace:
      root?.querySelector(
        ".poke5e-encounter-planner__workspace"
      ) ??
      root ??
      content
  };
}

export function capturePlannerUiState(
  content
) {

  const {
    sidebar,
    workspace
  } =
    resolvePlannerScrollHosts(
      content
    );


  const activeElement =
    document.activeElement;


  let focus =
    null;


  if (
    activeElement instanceof
      HTMLElement &&
    content.contains(
      activeElement
    )
  ) {

    focus = {
      tagName:
        activeElement.tagName,

      role:
        activeElement.dataset
          .role ??
        "",

      action:
        activeElement.dataset
          .action ??
        "",

      rowId:
        activeElement.dataset
          .rowId ??
        "",

      pokemonId:
        activeElement.dataset
          .pokemonId ??
        "",

      trainerId:
        activeElement.dataset
          .trainerId ??
        "",

      selectionStart:
        null,

      selectionEnd:
        null
    };


    try {

      if (
        typeof activeElement
          .selectionStart ===
        "number"
      ) {

        focus.selectionStart =
          activeElement.selectionStart;


        focus.selectionEnd =
          activeElement.selectionEnd;
      }

    } catch {
      /*
       * Algunos controles no exponen
       * selección de texto.
       */
    }
  }


  return {
    content,

    sidebarTop:
      sidebar?.scrollTop ??
      0,

    workspaceTop:
      workspace?.scrollTop ??
      0,

    workspaceLeft:
      workspace?.scrollLeft ??
      0,

    focus
  };
}

function findPlannerFocusElement(
  content,
  focus
) {

  if (!focus) {

    return null;
  }


  const candidates =
    content.querySelectorAll(
      "[data-role], [data-action]"
    );


  return (
    [
      ...candidates
    ].find(
      element =>
        element.tagName ===
          focus.tagName &&

        (
          element.dataset.role ??
          ""
        ) ===
          focus.role &&

        (
          element.dataset.action ??
          ""
        ) ===
          focus.action &&

        (
          element.dataset.rowId ??
          ""
        ) ===
          focus.rowId &&

        (
          element.dataset.pokemonId ??
          ""
        ) ===
          focus.pokemonId &&

        (
          element.dataset.trainerId ??
          ""
        ) ===
          focus.trainerId
    ) ??
    null
  );
}

export function restorePlannerUiState(
  state
) {

  if (
    !state?.content
  ) {

    return;
  }


  const restore =
    () => {

      if (
        !state.content
          .isConnected
      ) {

        return;
      }


      /*
       * _replaceHTML() reemplaza el contenido
       * interno de ApplicationV2.
       *
       * Por eso resolvemos nuevamente el scroll
       * host después de cada render en lugar de
       * conservar una referencia al elemento
       * anterior, que ya fue destruido.
       */
      const {
        sidebar,
        workspace
      } =
        resolvePlannerScrollHosts(
          state.content
        );


      if (sidebar) {

        sidebar.scrollTop =
          state.sidebarTop ??
          0;
      }


      if (workspace) {

        workspace.scrollTop =
          state.workspaceTop ??
          0;


        workspace.scrollLeft =
          state.workspaceLeft ??
          0;
      }


      const element =
        findPlannerFocusElement(
          state.content,
          state.focus
        );


      if (!element) {

        return;
      }


      element.focus({
        preventScroll:
          true
      });


      if (
        state.focus
          .selectionStart ==
            null
      ) {

        return;
      }


      try {

        element.setSelectionRange(
          state.focus.selectionStart,
          state.focus.selectionEnd
        );

      } catch {
        /*
         * Number, select y button no permiten
         * setSelectionRange.
         */
      }
    };


  restore();


  window.requestAnimationFrame(
    restore
  );
}
