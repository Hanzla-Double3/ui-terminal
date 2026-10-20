# Playground walkthrough

Purpose: verify the real visible UI through the same terminal that users type in.
This uses disposable sample stationery, not any production account or POS database.

Watched implementation: `demo/main.tsx`, `src/react/controls.tsx`,
`src/react/context.tsx`, `src/core/language.ts`, `src/core/runtime.ts`,
`src/panel/index.tsx`, `tests/core.test.mjs`, `tests/browser/terminal.spec.ts`.
When these behaviors change, review this guide and the corresponding tests.

1. Run `npm run dev` and open http://127.0.0.1:18120/. A catalogue, empty collection
   and bottom-docked terminal appear. The example host explicitly enables it.
2. Type `ls`. See search, catalogue controls and collection buttons. Save and Clear
   are disabled. Shared navigation is summarized; `ls navigation` lists it separately.
3. Type `search.type("Field")`. The actual search field changes and one card remains.
4. Type `search.press("Enter")`. Field Notes enters the collection, total is $12,
   and the ordinary search handler clears the field.
5. Type `cart.items["line-notes"].increase.click()`. Total becomes $24. Click the
   normal minus button to return to $12: human and terminal handlers are shared.
6. Type `ls cart`, add another item with a normal card click, then `ls --changes`.
   See changes in the collection, without repeated navigation or unrelated cards.
7. Type `cart.save.click()`. Wait for the explicit local-persistence receipt.
   The demo stores its sample collection in this browser. A generic `Dispatched`
   message from another handler is not proof of a successful save.
8. Type `cart.name.right_click()` or `cart.name.hold()`. The normal rename dialog
   opens. `ls` now describes dialog controls. `products.notes.add.click()` must fail
   while that dialog owns the interaction layer.
9. Type `dialog.name.type("Desk setup")` then `dialog.save.click()`. The dialog
   closes and the collection name changes. Cancel would leave the name intact.
10. Type `cart.clear.click()`. Cancel using `dialog.cancel.click()` and verify items
    remain. Open it again, use `dialog.confirm.click()` and verify the total is $0.
11. Type `missing.click()`, then press Up in the command field. The failed command
    must return. Run `ls`, type `search.ty`, press Tab: complete to `search.type("")`.
    Then type `products.j` and press Tab: fill `products.journal.` without selecting
    an action. Repeated Tab can descend to `products.journal.add` and list its options.
12. Type `navigation.settings.click()`, then `ls --all`. See settings/navigation,
    not the hidden catalogue or private password field. `theme.click()` changes
    the demo theme using the normal setting.
13. Use the host's Disable terminal setting. The terminal disappears. Open terminal
    restores it with an empty transcript/history and leaves application data alone.
14. Focus the top resize edge and press Up/Down, or drag it. Minimize and restore:
    the chosen height remains. Repeat at a narrow viewport; input stays reachable.

Completion is observed UI behavior and, where applicable, an explicit host receipt.
This document does not automatically execute saves or destructive operations.
