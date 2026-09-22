# Grafiska tillgångar — tillgångslista och AI-bildprompter

**THE SEVENTH FRONT** · efter etapp 6 · skriven 2026-09-22 mot `82d573c`

En egen, kort leverans enligt `ETAPP6_TEKNISK_SPEC.md` §7/§8: "Grafiska bild- och
ljudtillgångar själva (bara krokarna för dem) — en egen, avgränsad uppgift när du vill ta den:
en tillgångslista och färdiga AI-bildprompter." Ingen kod ändras av det här dokumentet — det är
en lista att arbeta ur, inte en prompt i P65–P72-sekvensen.

Repot har i dag **noll bildfiler** (verifierat, sökt igenom hela `packages/app`). Allt visuellt
är CSS: gradienter, färgtoken, typografi. Det finns exakt **en** plats i koden som redan väntar
på en bild — `MainMenu.tsx`s `.menu-backdrop` (`styles.css` rad 1236–1242), en tom, avsiktligt
lämnad yta med kommentaren "Tom yta, avsedd för en framtida bakgrundsbild". Resten av listan
nedan är kompletterande förslag, tydligt märkta som sådana — inte spec-krav.

## Stilriktlinjer (gäller alla prompter nedan)

Hämtade rakt ur `styles.css`s egen designkommentar och paletttoken, så att en genererad bild
matchar registret utan gissning:

- **Register:** "ett lägesrum i kalla krigets register — mörkt, tätt, med telexgul accent."
  Pappersark, telexremsa, skrivmaskin, dossiéer — omtolkat som spelgränssnitt, inte dokument.
  Tonen är **le Carré-aktig spionatmosfär**, inte krigsromantik eller vapenreklam: inga
  fotorealistiska vapen i närbild, inga verkliga flaggor eller riksvapen (spelet använder
  verkliga 1960-talsstater som Republiken Vietnam/NLF/Laos som fraktioner — undvik därför
  bokstavliga nationsflaggor eller emblem som kan läsas som ett politiskt ställningstagande),
  inga verkliga eller identifierbara personer.
- **Paletten** (exakta hex, `styles.css` rad 13–43):
  - Bas: `#090b0e` (nästan svart), paneler `#10141a`/`#151a21`, linjer `#212932`
  - Text: `#e4e9f0` (ljus), `#97a3b2` (dämpad)
  - Accent (spelaren): telexgul/amber `#e3a951`
  - Sekundärt: röd `#e0584d`, grön `#4eb289`, blå `#6c9ee0`
  - Blocksidor: väst `#6c9ee0`, öst `#d0553f`
- **Ljus:** ett enda svagt ljus uppifrån (skrivbordslampan över kartbordet, se `body`s
  radial-gradient) — inte jämnt upplyst, inte flera ljuskällor.
- **Typografi i bild (om någon):** ingen — lägg aldrig text i den genererade bilden, all text
  renderas av appen ovanpå.
- **Kontrast/tillgänglighet:** varje bild som ska ligga BAKOM text (backdrop, hero) måste vara
  mörk och lågdetaljerad i mitten/nedre tredjedelen, där `.menu-content` faktiskt sitter —
  annars bryts läsbarheten `granskningar/TILLGANGLIGHETSREDOGORELSE.md`-mönstret (i
  systerprojektet Synappsen) skulle ha flaggat. Testa alltid den genererade bilden med riktig
  vit/amber text ovanpå innan den läggs in.

---

## 1. Menybakgrunden (spec-namngiven, §3/§8) — `.menu-backdrop`

**Var:** `MainMenu.tsx`, fyller `.menu-backdrop` (`position: absolute; inset: 0`) bakom
`.menu-content`. Enda platsen i hela appen som redan har en kodkrok som väntar.

**Format:** WebP eller JPG, ~1920×1200 (liggande, appen är ändå fullskärm på desktop/mobil
genom `background-size: cover`-mönstret övriga bakgrunder i filen använder), **under 300 KB**
(appen är en offline-PWA, avsnitt 8 — stora bilder bromsar första-laddning på mobilnät).

**AI-bildprompt:**

> A dark, moody Cold War intelligence situation room at night, seen from a low angle across an
> empty wooden map table. A single warm amber desk lamp casts a soft pool of light from the
> upper area of the frame, fading to near-black shadow in the lower two-thirds. On the table:
> a rotary telephone, a teletype/telex machine with a curl of paper tape, a half-closed manila
> folder, no visible text or readable documents. Muted cold blue-grey walls, faint map pins
> barely visible in the darkness, no visible flags, insignia, or national symbols, no people.
> Grainy film photography look, desaturated except for the warm amber lamp glow and cool blue
> shadow tones. Cinematic, spy-thriller atmosphere (le Carré, not action movie). Very dark and
> low-contrast in the center and bottom of the frame so white/amber UI text stays readable when
> overlaid. 16:10 landscape, no text, no watermark.

**Om resultatet blir för detaljrikt i mitten:** be modellen om en variant, eller lägg till "the
center third of the image is nearly black, empty negative space" i slutet av prompten.

---

## 2. App-ikon / favicon (komplement, inte spec-krav)

**Var:** `index.html` rad 9 har i dag en tom data-URI-favicon (medvetet, för att undvika ett
404-konsolfel — se filens egen kommentar). En riktig ikon ersätter den `<link rel="icon">`-
raden. Behövs även om/när en PWA-manifest byggs (`vite.config.ts`s kommentar nämner en
PWA-plugin som ännu inte lagts till — utanför den här listans scope, men ikonen återanvänds
oförändrad den dagen).

**Format:** SVG (skalbar, föredras) eller PNG i flera storlekar (32×32, 180×180 för
`apple-touch-icon`, 512×512 för en framtida PWA-manifest). Måste läsas tydligt ner till 16 px.

**AI-bildprompt:**

> A minimal, flat vector icon/emblem on a solid near-black background (#090b0e). A single
> abstract geometric mark in warm amber (#e3a951): a stylised compass rose reduced to four thin
> tapering lines meeting at a center point, inside a thin circular or square border. No text, no
> letters, no realistic imagery, no national flags or military insignia — purely abstract and
> geometric, like a corporate seal for a private trading house. High contrast, must remain
> legible as a tiny 16×16 pixel favicon. Square canvas, centered composition, generous padding.

**Om resultatet är för detaljrikt:** en ikon som ser bra ut genererad i hög upplösning läses
sällan bra vid 16 px — be uttryckligen om "extremely simplified, reads clearly at 16 pixels,
no more than 3 distinct shapes."

---

## 3. Papperskorn-textur (komplement, inte spec-krav)

**Var:** ingen kodkrok finns än. Skulle läggas som en tileable bakgrundstextur, mycket låg
opacitet (≤4–6 %), ovanpå `--panel`-ytorna, för att ge den "papper, telexremsa"-känsla
`styles.css`s designkommentar beskriver men som i dag bara uttrycks i ord, inte i pixlar. Låg
prioritet — testa först utan, då ren CSS redan bär estetiken.

**Format:** PNG, tileable (sömlös upprepning), 256×256 eller 512×512, gråskala.

> **Försök 1 avvisat (2026-09-22, Gemini):** den ursprungliga prompten ("seamless, tileable...")
> gav "jag verkar inte ha tillgång till det innehållet" — en generisk avvisning, inte ett
> policyträffande innehåll. Trolig orsak: tekniskt/abstrakt textur-språk ("seamless tileable",
> "no visible seams when repeated") ligger utanför vad en chattbaserad bildmodell tolkad för
> foton/illustrationer hanterar bra. Prompten nedan är omskriven som ett konkret FOTOMOTIV i
> stället för en teknisk texturspec — samma resultat, mindre sannolikt att avvisas.

**AI-bildprompt (omskriven, försök 2):**

> A close-up photograph of a blank sheet of old, slightly aged off-white paper — like vintage
> typewriter or telex paper. Soft, even studio lighting from directly above, no shadows. Subtle
> visible paper fiber texture and fine grain. Completely blank: no text, no writing, no stains,
> no folds, no creases. The paper fills the entire frame edge to edge, flat and straight-on, like
> a flatbed scan.

Efter generering: kör bilden genom valfritt "seamless tile"-verktyg (t.ex. Photoshops
Offset-filter, eller ett gratis online-tileringsverktyg) — ingen AI-bildmodell garanterar
sömlös upprepning utan uttrycklig efterbehandling, oavsett hur prompten är skriven.

---

## Nästa steg

1. Generera bilderna (valfritt AI-bildverktyg, prompterna ovan är modelloberoende).
2. Lägg dem i `packages/app/public/` (Vites statiska-filkonvention, samma mönster som
   `sound.ts`s `public/sounds/`) — t.ex. `public/images/menu-backdrop.webp`.
3. Säg till, så kopplas `.menu-backdrop` in i `MainMenu.tsx`/`styles.css` i en egen, liten
   ändring (en `background-image`-rad plus `object-fit`/`opacity`-justering om bilden är för
   stark bakom texten) — dokumenterad i `docs/ANDRINGSLOGG.md` som vanligt.
