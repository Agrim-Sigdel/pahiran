# UX audit — what was fixed

Companion to [`UX_AUDIT.md`](UX_AUDIT.md), which now carries the per-item
status. This is the part a reviewer needs that a ticked checkbox can't say:
what is new, what changed underfoot, and what still needs doing.

Worked through 27 July 2026. `npx tsc --noEmit` and `next build` both pass
(34/34 pages).

---

## Three decisions

The audit named three things that needed a product call rather than a fix:

| | Decision |
|---|---|
| **Kiosk v1 vs v2** | v1 deleted. `KioskV2` is the only kiosk; `?v=2` and the dashboard's "try v2" link are gone. Git keeps v1 at `153d5f0` if it's ever wanted back. |
| **`/owner` demo CTA** | Removed. It pointed at `cal.com/contractorops/15min` — a different company's booking page under peeq's primary trust CTA. Replaced with a `mailto:`, because there is no peeq booking link to repoint it to. |
| **`/compare`** | Admin-only, on the same `ADMIN_EMAILS` allowlist the console uses. The page gates rendering; `/api/compare` re-checks the bearer token and is the real boundary. The dev-mode 404 stays as a second gate. |

---

## New shared machinery

Most of the audit was the same defect repeated. These are where it collapsed.

### `components/Dialog.tsx`

One overlay component. All 23 hand-rolled `position: fixed` divs now use it.

```tsx
<Dialog onClose={close} title="Add a garment" dirty={hasUnsavedWork}>
  …
</Dialog>
```

Gives every overlay: `role="dialog"` + `aria-modal`, focus moved in on open and
restored to the opener on close, Tab/Shift+Tab cycling inside the panel,
Escape, body scroll lock (counted, so nested dialogs don't unlock early), and a
**dirty guard** — `dirty` makes backdrop-click and Escape ask before
discarding. That last one is why this is a component and not a CSS class: the
cart drawer with a phone number typed in, and the garment form with a whole
product filled in, both used to bin the lot on one stray tap.

Four shapes via `variant`: `center` (default), `sheet` (bottom, phones/kiosk),
`drawer` (right, the cart), `full` (saved-looks gallery, look viewer).

Also exports `ConfirmDialog` and `confirmAsync()` — the latter keeps the shape
of the code it replaced:

```tsx
if (!(await confirmAsync({ title: "Delete this look?", destructive: true }))) return;
```

### `lib/toast.ts` + `components/Toaster.tsx`

`toast()` / `toastOk` / `toastWarn` / `toastErr` / `toastFailure`. Module-level
store, no provider — the calls happen inside plain async handlers deep in the
tree, and threading a context through all of them is how you end up keeping
`alert()`. `<Toaster/>` is mounted once in the root layout and also hosts
`confirmAsync`'s dialog.

**All 24 `alert()` / `confirm()` calls are gone.** Errors don't auto-dismiss;
everything else clears after ~4s.

### `lib/format.ts`, `lib/lang.ts`

`formatDate` / `formatDateTime` pass `undefined` as the locale so a bilingual
product stops hardcoding `en-GB`. `lang.ts` writes the language preference to
**both** localStorage and a cookie, so a server component can read it — which
is what removed the flash of English on `/privacy`.

---

## Things that changed underfoot

Worth knowing before writing new code in this repo.

**The legacy token aliases are gone.** `--forest`, `--forest-deep`, `--sage`,
`--sage-mist`, `--cream`, `--camel`, `--mut`, `--plum`, `--rani`,
`--rani-soft`, `--marigold` no longer exist. ~560 call sites were migrated:

```
--forest, --forest-deep  →  --ink
--sage                   →  --paper
--sage-mist              →  --paper-deep
--cream                  →  --card
--camel, --mut           →  --stone
```

Nothing looks different — they pointed at the same values, which is what made
them expensive. The product ran two names for every colour (vendor/admin on one
set, shopper on the other) and the aliasing quietly ate meaning: `--camel` was
documented as "accent emphasis" while resolving to body-text grey, so three
separate signals were painted the colour of a paragraph. **New code using an
old alias will silently render unstyled** — reach for `--ink` / `--paper` /
`--card` / `--stone`, and for anything that *means* something use
`--danger` / `--warn` / `--ok` / `--violet`.

**`--violet` changed value in both themes.** Light was `#000937b4` — an
8-digit hex, i.e. a 70%-opaque navy, so every violet fill composited with
whatever sat behind it (this is what made the kiosk progress bar vanish). Now
`#123A2E`, opaque, 11.7:1 on paper. Dark was `#bbb288`, a khaki — the one thing
required to not be brown, in brown. Now `#8FD3B6`, 9.6:1 on `--card`.

**New scales in `globals.css`:** `--radius-xs/sm/md/lg/xl/pill` and
`--z-sticky/kiosk/overlay/dialog/popover/toast`. 13 hardcoded radii and 8 bare
z-indexes were migrated onto them.

**Fonts moved to `next/font`** (`--font-display`, `--font-body`). The
`@import` of fonts.googleapis.com is gone. The display fallback is
`sans-serif`, not `cursive` — on a network where Baloo doesn't arrive, every
heading was rendering in Comic Sans.

**Reduced motion was narrowed.** The blanket `* { transition: none }` took the
feedback along with the decoration. Looping and arrival animations stop dead,
transforms stop, colour/opacity transitions stay (short).

**`?shared=1` is now a device setting.** The URL flag still works and now
*persists* — a shop tablet that gets reloaded or opened from a bookmark keeps
shared mode instead of silently reverting to personal-phone behaviour. There's
a toggle on the attract screen and a badge in the bar while it's on.

**`/privacy` is now server-rendered** (`ƒ`, cookie-driven) rather than static.

---

## Deployment steps this needs

1. **Supabase → Auth → URL Configuration → Redirect URLs** must include
   `https://<your-domain>/reset`. Password-reset emails link there; without the
   allowlist entry Supabase refuses the redirect and the flow dead-ends.
2. `ADMIN_EMAILS` now gates `/compare` as well as `/admin`.

---

## Not done, and why

Four items in `UX_AUDIT.md` are marked `[ ]` or `[~]`:

- **Product galleries** — `Garment` holds a single `image`. Multi-photo, zoom
  and a gallery need a schema and upload change, not a UI change. Untouched.
- **Cancel a generation** — "stop waiting" aborts the request and returns the
  shopper to the rack, so they get their minute back. The credit is committed
  server-side the moment the request starts, so the confirm sheet is still what
  protects it.
- **Orders inbox date range** — search, open/done filter, paging with a live
  count and a CSV export all shipped. No date range; the search box covers what
  it was standing in for.
- **Raw `<img>`** — the product hero, the six `/owner` screenshots and the
  landing feed went through `next/image` / `GarmentImage`. The rest are
  `data:`, `blob:` and expiring signed URLs (uploaded previews, saved looks,
  try-on renders) which next/image can't optimise; they declare dimensions
  instead so they stop shifting layout.

---

## State of the tree

Everything is **uncommitted**. The original request was to amend `UX_AUDIT.md`
into `153d5f0` and push; the push failed with `Permission denied (publickey)`
and was never retried, so nothing has left this machine.

44 files changed, 6 new, 1 deleted (`components/Kiosk.tsx`).
