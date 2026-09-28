// version — P90 (ETAPP7_TEKNISK_SPEC.md §9/§13): buggrapportknappen kopierar
// "version". Genuint fynd: till skillnad från Synappsen-projektets egen
// disciplin (src/version.js, en changelograd per release) finns ingen
// motsvarande releaserutin här — package.json:s version har stått still på
// 0.0.0 sedan repot skapades. Läser den ändå, rakt av (samma princip som
// Synappsen: importera versionen i stället för att upprepa den för hand) —
// ärligt "0.0.0" är bättre än att hitta på ett versionsschema ingen annan
// prompt har bett om.
import pkg from '../package.json' with { type: 'json' }

export const APP_VERSION: string = pkg.version
