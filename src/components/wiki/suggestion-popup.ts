import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import type { ComponentType } from "react";

/**
 * Show a suggestion menu (the @ and / menus) under the cursor: a React list
 * rendered next to the editor, kept on screen, given the arrow keys, Enter
 * and Escape while it's open. `extra` is what else the list needs.
 */
export type MenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

export function suggestionPopup<Item, Extra extends object>(
  component: ComponentType<SuggestionProps<Item, Item> & Extra>,
  extra: () => Extra
) {
  return () => {
    let menu: ReactRenderer<MenuHandle, SuggestionProps<Item, Item> & Extra> | null = null;
    const place = (props: SuggestionProps<Item, Item>) => {
      const box = props.clientRect?.();
      const element = menu?.element as HTMLElement | undefined;
      if (!box || !element) return;
      element.style.position = "fixed";
      element.style.zIndex = "60";
      element.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 360))}px`;
      element.style.top = `${box.bottom + 6}px`;
    };
    const close = () => {
      menu?.destroy();
      menu?.element.remove();
      menu = null;
    };
    return {
      onStart: (props: SuggestionProps<Item, Item>) => {
        menu = new ReactRenderer(component as never, {
          props: { ...props, ...extra() },
          editor: props.editor,
        });
        document.body.appendChild(menu.element);
        place(props);
      },
      onUpdate: (props: SuggestionProps<Item, Item>) => {
        menu?.updateProps({ ...props, ...extra() });
        place(props);
      },
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "Escape") {
          close();
          return true;
        }
        return menu?.ref?.onKeyDown(event) ?? false;
      },
      onExit: close,
    };
  };
}
