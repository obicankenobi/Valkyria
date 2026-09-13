// resolveTurn — motorns enda ingång. Kontraktet står i ETAPP1_TEKNISK_SPEC.md avsnitt 3:
// (state: Readonly<GameState>, submission: TurnSubmission) => TurnResult, ren, ingen
// mutation av indata, kastar aldrig i normal drift.
//
// P0 bygger bara skelettet: en resolveTurn som kastar "not implemented". De riktiga
// typerna (GameState, TurnSubmission, TurnResult) finns inte än — de kommer i P1
// (types.ts) — så signaturen här är medvetet otypad tills P2 kopplar in den riktiga
// pipelinen från PIPELINE-listan i steps/.
export function resolveTurn(_state: unknown, _submission: unknown): never {
  throw new Error('not implemented')
}
