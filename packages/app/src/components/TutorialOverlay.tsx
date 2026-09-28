// TutorialOverlay.tsx — P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20). En
// kontextuell tipsbanderoll, samma register som Shell.tsx:s RejectedBanner
// (`.banner`) — se tutorial.ts:s egen kommentar för varför den formen valdes
// i stället för DOM-ankrade coachmarks. Visas ovanför skärmens eget
// innehåll, oavsett vilken flik spelaren står på, tills steget den beskriver
// är klart eller spelaren stänger av den för partiet.
import { Button } from './designSystem.js'
import type { TutorialStep } from '../tutorial.js'

export function TutorialOverlay({ step, onDismiss }: { step: TutorialStep | null; onDismiss: () => void }) {
  if (!step) return null
  return (
    <div className="banner is-tutorial" data-testid="tutorial-banner">
      <div>
        <div className="banner-title">Tutorial</div>
        <div className="banner-sub" data-testid="tutorial-prompt">
          {step.prompt}
        </div>
      </div>
      <span className="tabs-spacer" />
      <Button variant="ghost" onClick={onDismiss} testId="tutorial-dismiss">
        Dismiss
      </Button>
    </div>
  )
}
