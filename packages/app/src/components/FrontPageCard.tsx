// FrontPageCard — P149 (ETAPP10 §9.1/§9.4). En förstasida ur historien: en tidningssida med ett riktigt datum, rubriken och en eller två meningar om vad som hände, och källan.
// Samma kort visas i kvartalsuppspelningen och överst på NEWS DESK. Texten kommer ur data/history (äkthetstestad); inga citat, inga påhittade detaljer.
import { historyDateLabel } from '../historyText.js'
import type { HistoryEvent } from '@seventh-front/core'

export function FrontPageCard({ event, testId = 'front-page-card' }: { event: HistoryEvent; testId?: string }) {
  return (
    <article className="front-page" data-testid={testId}>
      <div className="front-page-masthead">
        <span>THE WORLD</span>
        <span data-testid="front-page-date">{historyDateLabel(event.date)}</span>
      </div>
      <h3 className="front-page-headline">{event.headline}</h3>
      <p className="front-page-body">{event.body}</p>
      <p className="front-page-source">Source: {event.source}</p>
    </article>
  )
}
