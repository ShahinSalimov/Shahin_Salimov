# MEH-İnşaat — image-to-video prompt-ları (9:16)

Hər prompt-u uyğun referans şəkillə birlikdə image-to-video rejimində işlət. 5 saniyəlik klip yarat.
6 saniyəlik slotlar (1, 3, 4, 8, 10) üçün ya 10 saniyəlik klip yaradıb kəs, ya da 5 saniyəlik klipi 0.85x sürətə sal.
9B və 11 hazırdır, onları AI-dan keçirmə: logo təhrif ola bilər.

Hər prompt-un sonuna bu sətri əlavə et:
```
Keep the composition, faces and all details of the reference image. Realistic motion and natural physics, vertical 9:16, all male, no extra people appearing, no text, no logos, no subtitles, no morphing.
```

| # | Slot | Şəkil |
|---|---|---|
| 1 | 0–6 | scenes/01_empty_plot.jpg |
| 2 | 6–11 | scenes/02_concrete.jpg |
| 3 | 11–17 | scenes/03_house_construction.jpg |
| 4 | 17–23 | scenes/04_asphalt.jpg |
| 4A | 23–27 | scenes/04A_pole_installation.jpg |
| 4B | 27–31 | scenes/04B_street_lighting.jpg |
| 5 | 31–36 | scenes/05_electrical.jpg |
| 6 | 36–41 | scenes/06_ventilation.jpg |
| 7 | 41–46 | scenes/07_air_conditioner.jpg |
| 8 | 46–52 | scenes/08_interior_renovation.jpg |
| 9 | 52–57 | scenes/09_finished_interior.jpg |
| 10 | 60–66 | scenes/10_team.jpg |
| 10B | 66–69 | scenes/10B_building.jpg |

## 1 — Boş sahə
```
Slow cinematic drone flight moving forward and gently descending over the empty construction plot at sunrise, survey stakes and orange marking lines pass beneath the camera, soft morning haze drifting across the ground, golden sun flare shimmering slightly, fine dust particles floating in the light. Smooth forward drone motion, no rotation.
```

## 2 — Beton təməl
```
Grey wet concrete flows continuously from the pump hose into the steel rebar grid, the workers spread and level it with rakes in a natural rhythmic motion, small concrete splashes, dust drifting in the warm backlight. Slow low-angle push-in toward the point where the concrete lands.
```

## 3 — Fərdi ev tikintisi
```
Workers build the walls of the two-storey house: the worker on the scaffold places an aerated concrete block and taps it into position, the worker below carries a block toward the wall, the small concrete mixer drum slowly rotates. Slow camera tilt up from the materials on the ground to the top floor, warm morning light.
```

## 4 — Asfalt
```
The paver slowly moves forward laying fresh steaming black asphalt, the worker in front rakes the edge, the road roller advances in the background, thick steam rising and drifting in the warm backlight. Low camera slowly tracking backward in front of the paver, close to the road surface.
```

## 4A — İşıq dirəyi quraşdırılır
```
The crane slowly lowers the black steel lamp pole, its base plate descends straight onto the four anchor bolts of the concrete foundation, the two workers guide the base with their hands, the kneeling worker lifts the wrench and starts threading a nut onto a bolt. The pole stays perfectly straight. Slow camera tilt up along the pole from the foundation to the crane sling, blue hour light, park lamps glowing in the background.
```

## 4B — Lampa bağlanır və yanır
```
The electrician in the lift basket finishes connecting the LED lamp head, the lamp flickers once and turns on with bright warm white light that spreads across the park path below, the other lamp posts glow along the alley. The lift basket stays steady and separate from the pole. Slow camera rise from the park path up to the lamp, blue hour sky.
```

## 5 — Elektrik
```
The electrician tightens a screw on a circuit breaker, then flips a breaker switch on, a small indicator LED lights up green, wires stay in place. Slow camera push-in toward his gloved hands and the panel, steady cool work light with warm ambient light.
```

## 6 — Havalandırma
```
The two technicians on the scaffold lift and align a large galvanized ventilation duct segment, one of them secures it with a cordless drill, sunbeams stream through the tall windows, dust particles float in the light. Slow camera tilt up from the scaffold to the ceiling ducts.
```

## 7 — Kondisioner
```
The technician presses the white air conditioner unit into place on the wall, checks it with the level, then steps back slightly on the ladder; the air conditioner louver smoothly opens once. Slow lateral camera slide from right to left, soft daylight from the window.
```

## 8 — Daxili təmir
```
The worker presses the large porcelain tile into the adhesive, taps it twice with the rubber mallet and places a leveling clip; in the background the second worker smooths plaster on the wall. Slow camera push-in toward the tile at floor level, dust drifting in the warm work light.
```

## 9 — Hazır interyer
```
Slow cinematic pull-back revealing the finished luxury living room, warm golden hour sunlight subtly shifting through the windows, curtains swaying gently, the chandelier crystals sparkling, polished marble floor reflections. No people.
```

## 10 — Komanda
```
The five men stand confidently in front of the finished house, the engineer in the center slightly unrolls the blueprints and looks at the camera with a calm smile, the others keep their arms crossed and nod subtly, golden hour lens flare gently moving. Slow camera push-in at chest height. Faces stay exactly the same.
```

## 10B — Böyük bina
```
Slow drone pull-back and gentle rise away from the residential building at blue hour, window lights softly twinkling, car light trails moving on the distant roads, sky gradient slowly deepening. No people.
```
