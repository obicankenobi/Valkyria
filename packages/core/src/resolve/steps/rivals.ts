// rivals — rivalhusens drag utanför anbudsgivning. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 10 (P8-instruktionen) och DESIGN.md avsnitt 12.
//
// P8-instruktionen och DESIGN.md avsnitt 12 nämner tre saker rivaler gör: (1) lägger
// bud (redan byggt — bidding.ts, P4, computeRivalBid), (2) binder leverantörskapacitet
// så spelarens linjer stannar, (3) iscensätter egna incidenter, ibland attribuerade
// till spelaren. Ingen formel finns för (2) eller (3) i någotdera dokument — bara lös
// prosa. Båda lämnas UTTRYCKLIGEN OBYGGDA i P8, inte tyst runtbyggda. Att koppla (2)
// hade krävt att röra production.ts, som P8:s instruktionstext inte nämner, och
// riskerat att störa den ekonomiska kalibrering P8:s eget klart när-villkor bygger på
// (ett passivt parti ska förlora på BUYOUT, inte bli knuffat mot en snabbare
// INSOLVENCY av en till, okalibrerad kostnadsdränering). (3) kräver en hel ny mekanik
// (iscensatt incident) som inte finns i typerna och inte har någon egen acceptanstest
// i P8 — samma sorts obyggda driver som "iscensatt incident" i doomsday.ts (P7).
// Se docs/ANDRINGSLOGG.md.
//
// Det som FAKTISKT byggs här: "Rivalhusen växer om du är passiv. Marknadsandel är ett
// nollsummespel." (DESIGN.md avsnitt 12). En spelare som varken lägger några bud eller
// använder några handlingar den här turen räknas som passiv; varje rivalhus växer då
// något i capital och marketShare. PROVISORISK formel (nya balance.json-fält
// rivalPassiveGrowthCapital/-MarketShare) — specen ger ingen tillväxttakt. Ingen sann
// nollsummeinvariant hålls (House har inget marketShare-fält att dra ifrån), så
// "nollsummespel" är bara den narrativa motiveringen här, inte en bokförd sådan.
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'

interface Balance {
  rivalPassiveGrowthCapital: number
  rivalPassiveGrowthMarketShare: number
}
const BALANCE = balanceData as unknown as Balance

export const rivals: ResolveStep = (ctx) => {
  const { draft, submission, emit } = ctx

  const playerIsPassive = submission.actions.length === 0 && submission.bids.length === 0
  if (!playerIsPassive) return

  for (const rival of Object.values(draft.rivals)) {
    rival.capital += BALANCE.rivalPassiveGrowthCapital
    rival.marketShare = Math.min(100, rival.marketShare + BALANCE.rivalPassiveGrowthMarketShare)

    emit({
      severity: 'ticker',
      scope: 'market',
      headline: `${rival.name.toUpperCase()} EXPANDS WHILE THE MARKET GOES UNCONTESTED`,
      causeId: null,
      delta: { capital: BALANCE.rivalPassiveGrowthCapital, marketShare: BALANCE.rivalPassiveGrowthMarketShare },
      actorIsPlayer: false,
      subjectId: rival.id,
    })
  }
}
