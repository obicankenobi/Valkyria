// PaperclipPhoto.tsx — Paket G3 (ETAPP 12, 12F): fastgemade övervakningsfoton
// och vapenhussigill på person- och rivalakter i CONTACTS och CountryFile.
// Använder de befintliga SVG-tillgångarna i public/art/portraits/ och public/art/seals/.
import type { FactionId, Post, RivalId } from '@seventh-front/core'

export type PaperclipPhotoProps =
  | {
      kind: 'official'
      factionId: FactionId
      post: Post
      name: string
    }
  | {
      kind: 'rival'
      rivalId: RivalId
      name: string
    }

export function PaperclipPhoto(props: PaperclipPhotoProps) {
  const portraitSrc =
    props.kind === 'official'
      ? `/art/portraits/official-${props.factionId}-${props.post}.svg`
      : `/art/portraits/chairman-${props.rivalId}.svg`

  const sealSrc = props.kind === 'rival' ? `/art/seals/${props.rivalId}.svg` : null

  return (
    <span className="desk-mugshot-wrap" aria-hidden="true" data-testid="paperclip-photo">
      <span className="desk-metal-paperclip" />
      <span className="desk-mugshot-polaroid">
        <img src={portraitSrc} alt="" className="desk-mugshot-img" />
        {sealSrc && <img src={sealSrc} alt="" className="desk-mugshot-seal" />}
      </span>
    </span>
  )
}
