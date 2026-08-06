---
name: Rally Hunt
description: A field-ready scorecard for real-world group hunts.
colors:
  trail-orange: "oklch(0.5 0.18 34)"
  trail-orange-deep: "oklch(0.37 0.135 31)"
  trail-orange-soft: "oklch(0.94 0.05 48)"
  field-green: "oklch(0.29 0.065 158)"
  field-green-deep: "oklch(0.22 0.05 158)"
  warm-paper: "oklch(0.965 0.018 92)"
  clean-sheet: "oklch(0.995 0.006 92)"
  quiet-surface: "oklch(0.985 0.01 92)"
  panel: "oklch(0.94 0.026 92)"
  field-ink: "oklch(0.19 0.035 158)"
  muted-ink: "oklch(0.4 0.035 155)"
  soft-line: "oklch(0.87 0.025 102)"
  ready-green: "oklch(0.48 0.17 148)"
  caution-amber: "oklch(0.57 0.18 43)"
  stop-red: "oklch(0.48 0.17 22)"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif"
    fontSize: "clamp(2.4rem, 8vw, 4.2rem)"
    fontWeight: 950
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.45
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "0.77rem"
    fontWeight: 800
    lineHeight: 1.2
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.trail-orange}"
    textColor: "{colors.clean-sheet}"
    rounded: "{rounded.md}"
    height: "2.9rem"
  brand-mark:
    backgroundColor: "{colors.field-green}"
    textColor: "{colors.trail-orange-soft}"
    rounded: "{rounded.md}"
    size: "2.35rem"
---

# Design System: Rally Hunt

## Overview

**Creative North Star: “The Rally Marker”**

Rally Hunt feels like a clear marker seen across a busy field: energetic, direct, and dependable. The route-and-flag mark communicates movement and a shared finish without reducing the platform to one board format. Deep field green gives the brand authority; trail orange makes the next action unmistakable.

The working interface remains a modern scorecard: mobile-first, tactile, mostly flat, and easy to read while people are moving. Brand expression is concentrated in entry points, navigation, focus, and primary actions so the hunt itself remains central.

**Key Characteristics:** field-ready contrast, warm paper surfaces, decisive actions, generous touch targets, route-and-flag geometry, and short purposeful motion.

## Colors

The palette combines outdoor field tones with one energetic trail marker.

### Primary

- **Trail Orange** (`oklch(0.5 0.18 34)`): primary actions, focus, and brand emphasis.
- **Field Green** (`oklch(0.29 0.065 158)`): landing surfaces, strong identity moments, and the brand mark field.

### Secondary

- **Ready Green**: submitted and approved states, always paired with labels or icons.
- **Caution Amber**: saved, queued, or retry states.
- **Stop Red**: retake, destructive, and blocking states.

### Neutral

- **Warm Paper**: page background.
- **Clean Sheet**: working surfaces and inputs.
- **Field Ink**: primary copy.
- **Soft Line**: borders and divisions.

**The Trail Marker Rule.** Orange identifies action, not decoration. Green establishes the brand field; neither should compete with team colors inside a game.

## Typography

**Display Font:** system sans-serif display stack  
**Body Font:** system sans-serif text stack

**Character:** Heavy, compact headings read like rally signage. Body text stays familiar and highly legible across phones, projectors, and shared devices.

### Hierarchy

- **Display** (950, responsive, 0.94 line height): landing and library statements only.
- **Title** (900+, compact): page and card titles.
- **Body** (650, 1rem, 1.45): instructions and supporting information.
- **Label** (800, 0.77rem): compact status and navigation context.

**The Field Legibility Rule.** Never trade readability for personality; dense screens use weight and spacing before smaller type.

## Layout

Player views stay near 28rem for one-handed scanning. Entry views center a single immediate task. Host and template surfaces expand at roughly 46rem and 62rem while preserving the same spacing rhythm. The host journey remains Setup → Invite → Live → Room. Touch targets are at least 44px, and mobile layouts stack before content becomes compressed.

## Elevation & Depth

Rally Hunt is flat and layered by default. Tonal surfaces and borders establish hierarchy. A small offset shadow may lift an entry form, dialog, or interactive preview; broad halos and decorative glass are outside the system.

## Shapes

Corners use an 0.5–1rem range. The square board and the angular rally flag supply geometry, while controls stay softly rounded and tactile. Pills are reserved for compact filters, status, and metadata.

## Components

### Buttons

- **Shape:** 0.75rem corners and generous height.
- **Primary:** trail orange or deep trail orange with high-contrast text.
- **Hover / Focus:** a restrained color shift or physical lift; focus uses a 3px visible orange outline.

### Cards / Containers

- **Corner Style:** 0.75–1rem.
- **Background:** clean sheet or warm tonal panel.
- **Shadow Strategy:** flat by default; lift only when interaction or interruption requires it.
- **Border:** one soft line when the surface needs separation.

### Inputs / Fields

- **Style:** clean sheet, strong line, 0.75rem corners, and large readable values.
- **Focus:** trail-orange border with a pale orange support ring.

### Brand Mark

The mark is a single route that reaches a rally flag. Use it in a rounded-square field for compact identity moments; do not substitute the old bingo grid.

## Do's and Don'ts

### Do:

- **Do** keep the next action obvious under time pressure.
- **Do** pair every status color with a label or icon.
- **Do** use Rally Hunt as the platform name and bingo or blackout as game formats.

### Don't:

- **Don't** use the old grid logo or blue-led identity.
- **Don't** make the interface look like a casino, corporate dashboard, or kids-only game.
- **Don't** let decorative branding crowd out progress, proof, timing, or room controls.
