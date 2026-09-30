/**
 * Actions that show only when their item is hovered or has keyboard focus —
 * or always, on touch screens, which can't hover. The item carries the
 * `group/post` class; the actions carry this.
 */
export const ON_HOVER =
  "transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/post:opacity-100 [@media(hover:hover)]:group-focus-within/post:opacity-100";
