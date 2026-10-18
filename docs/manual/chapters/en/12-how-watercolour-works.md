---
title: How watercolour works
slug: how-watercolour-works
lead: A watercolour is light passing twice through thin layers of pigment and bouncing off white paper. Once you see it that way, mixing, washes and glazing stop being rules to remember and become things you can work out.
part: Painting with watercolour
nav: How watercolour works
---

# How watercolour works

## Light through paint

In oil or gouache, light hits the paint and bounces back from the paint itself. In watercolour it does not. The pigment lies on the paper in a layer so thin that most light goes through it, reaches the white paper, bounces back and goes through the pigment a second time on its way to your eye. On the way the pigment absorbs part of the light: a blue pigment takes away red and some green, so what comes back is blue.

That is why a watercolour glows. The light comes from behind the colour, from the paper.

It also means:

- **There is no white paint.** The white in a watercolour is paper you did not paint. Highlights, sparkle on water, the bright side of a cloud are planned before the first wash, not added at the end.
- **More paint is darker, never lighter.** Every layer of pigment takes a little more light away. You can only go from light to dark.
- **Water is your white.** A wash is lighter because there is less pigment per square centimetre, so less light is absorbed.

![A single paint in a strip from very watery to concentrated on white paper, with the white of the paper left at one end](photo:12-value-strip)

## Why paint dries lighter

A wet wash looks darker and richer than the same wash dry. While it is wet, water fills the gaps between the paper fibres and the pigment particles, and the surface reflects less stray light: you see more colour. As the water evaporates, air takes its place, the surface scatters more light, and the colour lightens and loses some saturation. With most paints the difference is large enough to matter: a wash that looks right wet is usually too pale when dry.

So you judge a colour **dry**, on a scrap of the same paper, never on the palette and never wet. [Mixing in practice](mixing.html#test-before-you-paint) shows how.

## What pigments do differently

Not every paint behaves like a perfect, clear filter. Three properties are worth knowing for every paint you own; makers print them in their charts.

### Transparent, semi-opaque, opaque

**Transparent** pigments (most modern organic pigments, such as phthalo blue PB15, quinacridones PV19, PR122) absorb light without scattering much of it: they glaze cleanly over other colours. **Opaque** pigments (cadmiums, cerulean PB35, many earths, chromium oxide green PG17) also scatter light back from the particles themselves, so they cover what is underneath and can look chalky in a glaze. **Semi-opaque** paints lie in between.

### Staining and lifting

**Staining** pigments (phthalos, quinacridones) dye the paper fibres and stay where they land: you cannot lift them out with a damp brush. **Non-staining** pigments (ultramarine, most earths) sit on the surface and can be lifted or softened later. Staining paints are reliable underneath a glaze; they are unforgiving if you put them in the wrong place.

### Granulation

Some pigments have heavy or coarse particles that settle into the valleys of the paper and give a speckled texture: ultramarine PB29, cerulean, many earths and cobalt pigments. Others flocculate, clumping together into a fine pattern. Granulation is beautiful in skies, stone and water; on a cold-pressed or rough paper it is part of the character of the paint.

![The same area painted twice side by side: once with a granulating ultramarine, once with a non-granulating phthalo blue, close enough to see the texture](photo:12-granulation)

## How the app models paint

The app treats every paint the way the light treats it: as a **transparent filter** on white paper.

For each paint it knows one colour, the colour of its swatch. From that it works out, for red, green and blue light separately, how much the paint absorbs. When you mix paints, their absorptions add up, each weighted by how much of that paint is in the mix. That is subtractive mixing, the same law that describes coloured glass or ink in water (physicists call it Beer-Lambert). Blue and yellow give green because the blue takes away the red and the yellow takes away the blue, and only green light survives both.

Water works differently. The app first works out the mix at full strength, then lays it over the paper the way a screen lays a colour at reduced opacity: an M wash at half strength is the full mix at 50 %, an L wash at a quarter is the mix at 25 %. So a wash grows paler toward the paper and does not keep the glow of the full colour. A turquoise with no red in it at all still turns into a pale, soft turquoise when you add water, as it does on paper.

### Why three bright paints do not make black

On paper, adding paint does not darken a wash forever. A brush only carries so much pigment, and a thick wash approaches the paint's **masstone**, the colour of the paint at full strength, and stops there. The app models this as a depth limit for the mix as a whole: a bright paint can go only a little darker than its swatch (about 1.6 times its absorption), while greys, blacks and earths, whose masstone is far darker than their wash, can go much deeper (up to 4 times). So in the app, as on paper, three bright colours mixed thickly give a deep dull colour, not black.

### Strength 1: the darkest the app uses a paint

Each paint's swatch counts as **strength 1**. The app never uses a paint stronger than that: water makes a paint lighter, and that is all it ever does to it. When a colour in the photo is darker than any of your paints at strength 1, the app reaches it by mixing in a second, darker paint, exactly as you would at the desk. Recipes therefore ask for paint and water you can actually produce from a pan or a tube.

> **Note:** The stock colours come from the Schmincke Horadam colour chart, which shows a mid-strength wash. For bright paints that is close to their strongest colour. Dark paints such as Payne's grey, the blacks and sepia are much darker at full strength than on the chart, so the app treats them as lighter than they can be. If a dark area looks too pale in the app, that is why; [Calibrating your paints](calibrating.html) shows how to replace a stock colour with your own swatch.

### Masstone and undertone

The **masstone** is the paint thick, the **undertone** the paint thin. With many pigments the two differ in hue, not only in lightness: a quinacridone is a deep red in masstone and a cool pink in undertone; burnt sienna is a dark brown in masstone and a warm orange in undertone. The app follows the swatch colour and darkens it towards the depth limit; it does not know a shift of hue between the two. For washes in the light and middle levels the swatch is a good guide; for concentrated washes, trust your own test strip.

### Layers add up differently

In [layer mode](layer-mode.html) every glaze dries before the next goes over it. Each dry layer is its own filter, so their absorptions add up fully: a dry blue layer under a dry yellow layer gives a green without the depth limit that a single wet mix has. That is why glazing can reach clean darks that a single mix cannot, and why [Glazing](glazing.html) is a method of its own.

## The limits of the model

A model is only as good as what it knows. What the app does not know about your paints:

- **One reference colour per paint.** Your paint may differ from the chart: another batch, another maker, a pan that has dried for years. The recipes are estimates; your test strip decides.
- **Opacity.** The model treats every paint as transparent. An opaque paint glazed over another covers more than the app expects, and an opaque mix looks lighter and chalkier than predicted.
- **Granulation and staining.** Not modelled. A granulating mix will look textured where the app shows a flat colour.
- **Paper and water.** The app assumes a white cotton paper and a wash that settles evenly. A cream paper, a paper that soaks up quickly, or a wash that dries unevenly will all shift the result.

## What it means for you

- Plan the **whites** first; they are paper.
- Work **from light to dark**; you cannot go back.
- Judge every colour **dry**.
- Prefer **transparent, single-pigment** paints for mixing and glazing; keep opaque paints for where you want them to sit on top.
- Treat the app's recipe as a very good **starting point** and your test strip as the final word. The number next to a recipe tells you how close the app thinks it gets; see [Mixes, washes and recipes](mixes.html).
