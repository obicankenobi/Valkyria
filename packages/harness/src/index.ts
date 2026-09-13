// packages/harness — balansverktyg. Kör N partier headless med botstrategierna passive,
// aggressive, balanced och skriver CSV. Se ETAPP1_TEKNISK_SPEC.md avsnitt 7.3.
//
// Byggs i P9. Se policies.ts, runGame.ts, csv.ts, cli.ts.
import { main } from './cli.js'

main(process.argv.slice(2))
