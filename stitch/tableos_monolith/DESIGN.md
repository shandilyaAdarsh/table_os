```markdown
# Design System Strategy: High-Precision Editorial

## 1. Overview & Creative North Star
**The Creative North Star: "The Obsidian Architect"**

This design system is not a standard dashboard; it is a high-precision instrument for data orchestration. We are moving away from the "cluttered SaaS" look toward a "High-End Editorial" experience. By blending the utilitarian rigor of *Linear* with the cinematic minimalism of *Vercel*, we create a workspace that feels like a premium terminal for power users.

To break the "template" look, we utilize **Intentional Asymmetry**. Dashboards should not be perfectly mirrored grids; they should be "Bento Box" layouts where the scale of a card reflects the density and importance of its data. We use high-contrast typography scales and overlapping "glass" layers to ensure the UI feels deep, expensive, and bespoke.

---

## 2. Colors & Tonal Depth
The palette is rooted in deep blacks and "Primary Red" (#C0272D), used as a surgical strike of color against a monochromatic void.

### The "No-Line" Rule
Standard 1px solid borders for sectioning are strictly prohibited for structural layout. Instead, boundaries are defined through **Background Color Shifts**. Use `surface-container-low` (#1C1B1B) sections against a `background` (#131313) to create implied containers. Lines are reserved for high-precision data separation only.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of stacked obsidian. 
- **Base Layer:** `surface-container-lowest` (#0E0E0E) for the main canvas.
- **Card Layer:** `surface-container` (#201F1F) for primary data modules.
- **Active/Hover Layer:** `surface-container-highest` (#353534) to signal elevation.
- **Nesting:** When placing a search bar inside a card, the search bar should use a *darker* tone (`surface-container-low`) than the card itself to create "inset" depth.

### The "Glass & Glow" Rule
Floating elements (Modals, Command Palettes) must use **Glassmorphism**. Apply `surface` colors at 80% opacity with a 24px Backdrop Blur.
- **Primary Glow:** Use `rgba(192, 39, 45, 0.15)` as a soft outer glow for active states or critical notifications to simulate a hardware-led "power on" light.

---

## 3. Typography
The system utilizes a dual-font strategy to balance human-centric communication with machine-precise data.

- **Primary: Inter.** Used for all UI labels, headlines, and body copy. Inter’s neutral, tall x-height provides the "Editorial" authority required for a SuperAdmin tool.
- **Mono: JetBrains Mono.** Reserved exclusively for IDs, financial figures, timestamps, and code snippets. This creates a clear visual distinction between *content* and *data*.

**Hierarchy Note:** 
- **Display-LG (3.5rem):** Use for high-impact metrics (e.g., Total Revenue). 
- **Label-SM (0.6875rem):** Use `text-muted` (#555555) in All-Caps with 0.05em tracking for secondary metadata to mimic technical blueprints.

---

## 4. Elevation & Depth
We eschew traditional drop shadows in favor of **Tonal Layering**.

- **The Layering Principle:** Depth is achieved by "stacking" container tiers. A `surface-container-high` modal sits on a `surface-dim` backdrop. This creates a soft, natural lift without the "dirty" look of heavy shadows.
- **Ambient Shadows:** For floating elements, use an extra-diffused 64px blur at 4% opacity, using the `primary` red token as the shadow tint for "Active" floating states.
- **The "Ghost Border":** If a container requires a border for accessibility, use the `outline-variant` token at 20% opacity. Forbid 100% opaque, high-contrast borders unless they represent a specific "Active" state.

---

## 5. Components

### Buttons
- **Primary:** `primary_container` (#C0272D), 44px height, 8px radius. No border. Use a subtle top-light inner gradient to give it a "pressed" tactile feel.
- **Tertiary:** No background, `text-secondary` color. On hover, shift to `surface-bright` with a 0.5s transition.

### Input Fields
- **Styling:** `surface-container-lowest` background with a `ghost-border`. 
- **Focus State:** 1px border shift to `primary` (#C0272D) with a 3px red "Active" indicator on the far left.
- **Type:** All numerical input must use **JetBrains Mono**.

### Cards & Bento Modules
- **Rule:** Forbid divider lines within cards. Use **8px / 16px / 24px vertical white space** to separate content groups.
- **Texture:** Apply a 1px dot grid (`#1A1A1A`, 24px gap) to the `background` layer only. Cards should remain solid to "float" above the grid.

### Lists & Data Grids
- No horizontal row lines. Use subtle `surface-container-high` background stripes on hover.
- **Active State:** Any selected row or navigation item must feature the signature **3px primary red left border**.

---

## 6. Do’s and Don’ts

### Do
- **Do** use JetBrains Mono for any string of characters that isn't a sentence (IDs, hashes, amounts).
- **Do** lean into asymmetry. A 3-column layout where the center column is 50% wider than the others creates an editorial feel.
- **Do** use `text-muted` (#555555) for "non-essential" UI like breadcrumb slashes or unit labels (e.g., "ms" in "240ms").

### Don’t
- **Don't** use pure white (#FFFFFF). Use `text-primary` (#F5F5F5) to prevent eye strain in dark mode.
- **Don't** use standard 1px borders to separate the sidebar from the main content. Use a background color shift from `surface-container-lowest` to `surface-container-low`.
- **Don't** use rounded corners larger than 12px for cards. We are aiming for "High-Precision," and overly rounded "bubbly" corners degrade the professional tone.