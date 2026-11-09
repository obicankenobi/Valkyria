// shortcutList — etapp 14: tangentkartan som data, utan beroenden, så att både shortcuts.ts och handbokens uppslag "Keyboard"
// (handbook.ts) kan läsa den utan cirkulära importer. Måste stämma med shortcutFor — test/shortcuts.test.ts binder dem.
// Tangentkartan, i grupper — handbokens uppslag "Keyboard" (handbook.ts) skrivs ut ur den här listan.
export const SHORTCUT_GROUPS: readonly { label: string; keys: readonly { keys: string; does: string }[] }[] = [
  {
    label: 'Folders',
    keys: [
      { keys: '1–5', does: 'Operations, Contracts, The Company, Contacts, News Desk' },
      { keys: '[ ]', does: 'previous / next tab inside the open folder' },
      { keys: 'F', does: 'expand the folder over the map, or fold it back (Contracts, The Company)' },
    ],
  },
  {
    label: 'The quarter',
    keys: [
      { keys: 'Enter', does: 'end the quarter' },
      { keys: 'Space', does: 'skip the quarter replay, or continue past the board memo' },
      { keys: 'Q', does: 'open or close This Quarter' },
      { keys: 'A', does: 'the action catalog' },
      { keys: 'W', does: 'the telex archive' },
    ],
  },
  {
    label: 'The map',
    keys: [
      { keys: '+ −', does: 'zoom in / out (hold to keep zooming)' },
      { keys: '0', does: 'back to the whole of Indochina' },
      { keys: 'L', does: 'next map layer (orders, supply, rivals, intelligence, politics, none)' },
      { keys: 'K', does: 'the map key' },
    ],
  },
  {
    label: 'Help and leaving',
    keys: [
      { keys: 'H', does: 'the handbook' },
      { keys: '?', does: 'this list of keys' },
      { keys: 'Esc', does: 'close the country dossier, the map card or an expanded folder; otherwise pause' },
    ],
  },
]
