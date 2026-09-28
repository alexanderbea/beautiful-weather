# Beautiful Weather — concept mood board

Four 1024 × 1536 PNG concept frames, generated with the built-in imagegen tool. A shared gouache river landscape, paper texture, sage vegetation and warm light connect all four states. Palettes below are art-direction anchors, not sampled pixel values. Open `moodboard/` on the Vite server (or `public/moodboard/` on a raw folder server).

| Condition | Mood | Palette (hex) | Motion | Why it fits |
|---|---|---|---|---|
| [Rain](rain.png) | Reflective · sheltered · fresh | #718A98 #AEC0BC #526E67 #D7CDB6 | Slanted rain falls through depth; ripples widen on the river. | Makes rainfall tangible while keeping the landscape comforting. |
| [Sunny / clear](sunny.png) | Radiant · open · hopeful | #F5DCA0 #EBAA78 #8EA77C #526E67 | Sunlight gently blooms; river highlights shimmer and grasses sway. | Warm light makes clear weather feel alive. |
| [Cloudy / overcast](cloudy.png) | Quiet · airy · contemplative | #CFD0CA #A8B2B5 #8F9E89 #777F91 | Broad cloud layers drift laterally at different speeds. | Soft moving light gives overcast its own expressive character. |
| [Snow](snow.png) | Hushed · tender · weightless | #EEE9DE #BECBD3 #8E9BB4 #647B73 | Near and far flakes drift downward with a gentle sideways sway. | Depth and powder soften the familiar landscape into stillness. |

## Smooth transitions

1. Reconstruct a single registered landscape with separate sky, hills, trees and river layers. Ease palette, cloud opacity and sunlight over 3–5 seconds; keep camera and landmarks fixed. Generated frames have small geometry differences, so direct bitmap crossfades are only a prototype.
2. Preserve wind direction and existing particle positions as weather changes. Ramp rain/snow emission over 2–4 seconds, let old particles exit, and reveal snow cover more slowly. Under reduced motion, use a short color dissolve without particle or parallax movement.

## Generation prompts

### sun

Use case: stylized-concept. Create ONE portrait full-bleed PNG concept illustration for Beautiful Weather mobile app, SUNNY / CLEAR state. Soft painterly storybook gouache, visible delicate paper grain, warm expressive refined editorial landscape, no photorealism, no text, no UI, no borders. Fixed fictional landscape to reuse in four weather variants: calm winding river from bottom center bending toward center-right horizon, rounded overlapping hills across middle at 55% height, far blue hill highest left of center, one rounded leafy tree on left bank at 65% height, a cluster of three slender conifers on right bank at 62% height, foreground grasses. Large breathing room in upper sky for app overlay. Portrait 2:3 composition. Sunny weather: luminous buttery sky, soft apricot sun upper right with diffused rays, sage and moss hills, sparkling warm river reflection, grass tips bending gently to imply breeze. Palette anchors #F5DCA0 #EBAA78 #8EA77C #526E67. Same fixed camera and horizon suitable for later weather-only edits. Premium cohesive warm storybook animation still; simplified shapes, painterly edges, layered depth.

### rain

Use case: lighting-weather. Edit this sunny Beautiful Weather concept into RAIN. Keep EXACT same portrait framing, river bends, hills and horizon silhouette, tree trunk and canopy shape on left, three conifers on right, rocks and grass positions. Preserve soft painterly storybook gouache, paper grain, warm expressive illustration family. Change only weather/light: muted slate blue cloud canopy hides sun completely, mist softens far hills, wet teal and sage grass, warm gray light near horizon. Clearly visible fine diagonal rain streaks at multiple depths and small circular splash ripples on river, gentle wind through grass; reads as animation frame. Palette anchors #718A98 #AEC0BC #526E67 #D7CDB6. No text, no borders, no UI. Full bleed portrait same dimensions as reference. Keep foliage, no seasonal alteration.

### cloudy

Use case: lighting-weather. Edit reference sunny Beautiful Weather illustration to CLOUDY / OVERCAST, one portrait PNG. Preserve EXACT fixed camera, hill/horizon contours, tree canopy and trunk left, three slender conifers right, river route, rocks and foreground grasses. Same soft painterly storybook gouache and paper grain. Change only weather and illumination: broad layered pearl-gray clouds with elongated wispy edges conveying slow lateral drift, fully hidden sun, no rays and NO rain or precipitation. Diffuse luminous warm silver sky, gentle desaturated sage landscape, soft lavender distant hills, quiet muted river reflecting clouds. Palette anchors #CFD0CA #A8B2B5 #8F9E89 #777F91. Mood contemplative, airy, sheltered, warm undertone. Cloud layers moving at different depths, grasses gently leaning. No text/UI/border. Full bleed same portrait dimensions and same geographic scene.

### snow

Use case: lighting-weather. Edit reference sunny Beautiful Weather illustration to SNOW, one portrait full bleed PNG. Preserve EXACT composition/camera, horizon hill silhouette, river winding route, broad left tree canopy/trunk shape, three right conifers, rocks, grass geometry. Same expressive soft painterly storybook gouache with paper grain. Change only weather/light/snow cover. Falling soft snowflakes at three depths: tiny distant flecks, medium drifting flakes, a few soft large foreground flakes, subtly diagonal curved drift suggesting gentle animation. Powder snow resting on existing foliage, banks and rock tops, retain recognizable tree canopy shape with dark sage beneath, do NOT remove leaves or add objects. River still visible and unfrozen, muted blue-gray reflections. Ivory-peach overcast glow with lavender blue shaded snow, no visible sun. Palette anchors #EEE9DE #BECBD3 #8E9BB4 #647B73. Hushed, tender, weightless mood, warm undertones, no text/UI/border. Same portrait dimensions as reference.

