# Hero artwork

The landing hero draws two optional raster layers. Until a file exists, the page
falls back to the built-in vector art, so nothing breaks while you generate them.

| Layer | File | Content | Parallax |
| --- | --- | --- | --- |
| 1 | `public/hero/hand-ace.webp` | hand pinching the Ace of Spades (transparent) | mid depth, slight tilt |
| 2 | `public/hero/chips.webp` | chip stacks / table foreground (transparent) | opposite direction, nearest the viewer |
| 3 | — | emerald glow, vignette, grain (CSS, already in the page) | slow |
| 4 | — | "POKER / ANYWHERE" background type (HTML, already in the page) | slowest |

Drop the files in `public/hero/` and reload. No code changes are needed.

## Layer 1 — hand + Ace (`hand-ace.webp`)

**Canvas:** square, 2400 × 2400 px, WebP with alpha, under ~450 KB (quality 80–85).

**Framing** (the page positions this box for you; match the composition):
- Card is the dominant object: roughly 45% of the canvas height, centred near
  40% from the left and 42% from the top, tilted ~12° (top leaning right)
  and angled slightly toward the viewer.
- The hand enters from the **right edge** and must run off the canvas edge —
  no wrist or arm inside the frame, only fingers and a little knuckle.
- Thumb on the card face, index or middle finger behind it. Leave the left
  ~25% of the canvas empty (the headline sits there).
- Nothing else in frame: no second card, no chips, no text, no logo.

**Prompt**

> Cinematic premium product-ad photograph of a human hand entering from the
> right edge of frame, naturally pinching a single large Ace of Spades between
> the thumb (on the face) and the index finger (behind the card). The card is
> large, the clear dominant subject, tilted about 12 degrees and angled slightly
> toward the camera. Only the fingers and knuckles are visible, cropped by the
> frame edge. Realistic human anatomy, natural finger proportions and joints,
> subtle skin texture, fine creases, a clean natural fingernail. The card has
> believable paper thickness, crisp printed spade and corner index, a soft edge
> highlight. Dark black and deep emerald environment, strong emerald and teal
> rim light from behind the card, soft green reflected light on the fingers,
> a very subtle lime accent, high contrast, shallow depth of field, luxury
> gaming aesthetic, premium advertising photography, 85mm lens. Single subject,
> minimal composition, no extra cards, no chips, no text, no UI, no logos, no
> watermark, no extra fingers, no distorted anatomy, no casino clichés.

**Negative prompt** (if the tool has one): extra fingers, fused fingers, six
fingers, distorted joints, twisted thumb, floating card, multiple cards, text,
letters on card other than A and spade, watermark, logo, chips, cartoon,
illustration, plastic skin.

## Layer 2 — chips (`chips.webp`)

**Canvas:** 4 : 3, 1800 × 1350 px, WebP with alpha, under ~250 KB.

> Premium product photograph of two small stacks of poker chips resting on a
> dark surface, one taller stack of about seven chips and one shorter stack of
> about five, in deep emerald, matte black and ivory with fine edge inlays.
> Realistic material: slightly glossy clay-composite edges, crisp top faces,
> contact shadows, soft green reflected light. Lit by emerald and teal rim light
> from behind and above, dark environment, high contrast, shallow depth of field.
> Camera slightly above, three-quarter view. Isolated on a plain black
> background. No text, no logos, no hands, no cards, no casino clichés.

## Getting a transparent background

Most generators don't output alpha. Options, best first:

1. Use a model that supports transparent output (for example OpenAI's
   `gpt-image` with `background: "transparent"`).
2. Generate on flat **pure black**, then cut out with a background remover
   (remove.bg, Photoshop "Remove background", or `rembg`). Fingers and card
   edges need a clean matte — check them at 200% on a dark and a light backdrop.
3. Avoid baking the glow into the image; the page already draws it. If a halo
   is baked in, it will show as a fringe on the cutout.

## Quality checklist (reject and regenerate if any fail)

- a thumb and at most two fingers visible; only two digits touch the card
- thumb and finger joints bend the right way; nail is on the back of the thumb
- the card's thickness, corner radius and index are consistent; only one card
- no wrist/arm shape inside the frame; hand exits the right edge
- edges are clean on both a black and a green backdrop

## Tuning after you add the files

Placement lives in `src/app/landing-hero.css` (`.hero-hand-box`,
`.hero-chips-raster`, and their mobile overrides) and parallax depth in
`src/components/poker/hero/HeroStage.tsx`. Cursor parallax is desktop-only and
disabled for reduced-motion users.
