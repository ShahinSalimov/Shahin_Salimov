# MEH-İnşaat MMC — 80 saniyəlik reklam: 8 hissə × 10 saniyə

Format: 9:16, 10 san, realistik. Hər hissədə 2 shot var. Image-to-video rejimində **Start frame** kimi göstərilən referans şəkli yüklə.
Generator bir klipdə iki shot-u yaxşı vermirsə, hər shot-u ayrıca 5 saniyəlik klip kimi yarat. Bunun üçün shot mətnini öz referans şəkli ilə işlət.

---

## HİSSƏ 1 (0–10 san) — Boş torpaq və qazıntı (yenilənib, beton 2-ci hissəyə keçib)
Start frame: `scenes/01_empty_plot.jpg`

```
Vertical 9:16 cinematic commercial for a construction company, ultra-realistic, shot on ARRI Alexa, 24 fps, natural motion, warm golden sunrise light. SHOT 1 (0-5s): slow smooth drone flight moving forward and gently descending over an empty leveled construction plot at sunrise, wooden survey stakes with orange ribbons and bright orange marking lines outlining the footprint of a future house pass beneath the camera, soft morning haze drifting over the ground, fine dust glowing in the low sun, golden lens flare. SHOT 2 (5-10s): cut to a medium-wide low-angle shot on the same plot, a yellow tracked excavator digs the foundation trench along the orange marking lines, its bucket lifts a load of soil and drops it onto a pile, dust rising in the warm backlight, a male site foreman in a navy blue uniform and white hard hat signals with his hand, camera slowly tracks sideways. Realistic physics, real-time speed, all workers are adult men.
```
**Negative prompt**
```
women, children, extra people appearing, deformed hands, extra fingers, distorted faces, excavator morphing, bucket passing through the ground, soil floating, tracks sliding, melting, morphing, unrealistic physics, flickering, jitter, camera shake, blurry, low resolution, cartoon, CGI look, 3D render, plastic skin, oversaturated colors, text, subtitles, captions, logos, watermark, tall skyscrapers in the foreground, horizontal frame
```

---

## HİSSƏ 2 (10–20 san) — Armatur, beton tökmə və evin hörülməsi
Rejim: text-to-video. Image-to-video işlədəcəksənsə, start frame kimi `scenes/02_concrete.jpg` götür və shot-ları ayrıca kliplər kimi yarat.
Divar daşı: Azərbaycanda standart sayılan bej-sarı **mişar daşı** (sawn shell limestone). Qırmızı kərpic istəsən, prompt-da `beige sawn shell limestone blocks` əvəzinə `standard red clay bricks` yaz.

```
Vertical 9:16 ultra-realistic cinematic commercial, warm morning sunlight, natural motion, real-time speed, 24 fps, all workers are adult men in navy blue work uniforms, orange safety vests and white hard hats. SHOT 1 (0-3s): medium shot of a foundation pit of a private house, a steel rebar cage inside wooden formwork, three male workers tie the crossing rebar bars together with steel binding wire and pliers, one twists the wire with a tying hook, another lays a new rebar bar into place, camera slowly slides along the formwork. SHOT 2 (3-6.5s): cut to a medium-wide shot, a heavy concrete mixer truck with a slowly rotating drum stands next to the foundation, a truck-mounted concrete pump with its boom extended pours thick grey concrete through a hose into the rebar formwork, one worker guides the hose, another pushes a concrete vibrator into the fresh concrete, two others spread it with rakes, splashes and light dust in the sunlight, camera slowly cranes up to show the machines and the crew together. SHOT 3 (6.5-10s): cut to a medium-wide shot from about fifteen meters away, the walls of a two-storey private house rise on the finished foundation, built from beige-yellow sawn shell limestone blocks, wooden scaffolding along the walls, four masons work along the wall: one spreads mortar with a trowel, one lays a limestone block and taps it into line, one carries a block on his shoulder along the scaffold, one mixes mortar in a small orange concrete mixer on the ground, stacks of limestone blocks on pallets in the foreground out of focus, camera slowly pushes in but stays at a distance, the whole wall and the crew visible.
```
**Negative prompt**
```
women, children, extra people appearing, white aerated concrete blocks, white bricks, foam blocks, gas blocks, extreme close-up of stones, macro shot of blocks, high-rise building, tower crane, skyscrapers, deformed hands, extra fingers, distorted faces, rebar bending like rubber, wire floating, concrete flowing upward, floating concrete, drum rotating backward, trucks morphing, blocks floating, walls collapsing, scaffolding warping, melting, morphing, unrealistic physics, flickering, jitter, camera shake, blurry, low resolution, cartoon, CGI look, plastic skin, oversaturated, text, subtitles, captions, logos, watermark, horizontal frame
```

**Yeni referans şəkil** (3-cü shot üçün; köhnə şəkildə ağ gaz-blok var):
```
Ultra-realistic cinematic shot, vertical 9:16, medium-wide view from about fifteen meters away of a two-storey private house under construction in a quiet suburban plot, walls built from beige-yellow sawn shell limestone blocks with mortar joints, wooden scaffolding along the walls, four male masons in navy blue work uniforms and white hard hats working along the wall, one spreading mortar, one laying a block, one carrying a block on his shoulder, one at a small orange concrete mixer on the ground, pallets of limestone blocks in the foreground slightly out of focus, warm morning sunlight, slight dust in the air, 35mm lens, photorealistic, all male, no women, no white blocks, no tall buildings, no text, no logos
```

---

## HİSSƏ 3 (20–30 san) — Yol və asfalt işləri
Start frame: `scenes/04_asphalt.jpg`

```
Vertical 9:16 ultra-realistic cinematic commercial shot, warm late afternoon backlight, natural motion, 24 fps. SHOT 1 (0-5s): low camera close to the road surface slowly tracking backward in front of an asphalt paver, the paver moves forward laying fresh hot black asphalt, thick steam rising and glowing in the backlight, a male worker in a high-visibility vest and hard hat rakes the edge of the fresh asphalt, a road roller approaches in the background. SHOT 2 (5-10s): cut to a low side shot of the heavy steel drum of the road roller rolling slowly over the steaming asphalt and compacting it into a smooth shiny surface, steam drifting across the frame, golden sun flare, the camera slowly glides alongside the drum. Real-time speed, all workers are adult men.
```
**Negative prompt**
```
women, children, extra people appearing, deformed hands, extra fingers, distorted faces, machines morphing, wheels spinning backward, vehicles floating, asphalt melting like liquid, unrealistic physics, flickering, jitter, camera shake, blurry, low resolution, cartoon, CGI look, oversaturated, text, road signs with letters, subtitles, captions, logos, watermark, horizontal frame
```

---

## HİSSƏ 4 (30–40 san) — İşıq dirəyi quraşdırılır, lampa yanır
Start frame: `scenes/04A_pole_installation.jpg` · Shot 2 referansı: `scenes/04B_street_lighting.jpg`

```
Vertical 9:16 ultra-realistic cinematic commercial shot, blue hour, deep blue sky with a soft orange horizon, landscaped park alley in front of a modern glass corporate office campus, warm lamp posts glowing along curved paved paths, trees uplit with warm light, 24 fps. SHOT 1 (0-5s): a truck-mounted crane slowly lowers a tall black steel street lamp pole hanging by a sling, its base plate descends straight onto the four anchor bolts of a fresh square concrete foundation, two male workers in navy blue uniforms with reflective stripes, white hard hats and gloves guide the base by hand, a third male worker kneels and threads a nut onto a bolt with a large wrench, the camera slowly tilts up along the pole from the foundation to the crane sling, the pole stays perfectly straight. SHOT 2 (5-10s): cut to a low-angle shot of the same black lamp pole fully installed on its concrete base, a male electrician in a navy uniform, white hard hat and safety harness stands in the basket of an aerial work platform beside the top of the pole, he finishes connecting the LED lamp head, the lamp flickers once and switches on with bright warm white light that spills over the park path below, the camera slowly rises from the path up toward the lamp. The lift basket stays separate from the pole. All workers are adult men.
```
**Negative prompt**
```
women, children, extra people appearing, pole bending, pole passing through the basket, pole floating, pole tilting and falling, bolts missing, lamp floating without arm, crane morphing, deformed hands, extra fingers, distorted faces, melting, morphing, unrealistic physics, light flickering continuously, strobe, jitter, camera shake, blurry, low resolution, cartoon, CGI look, oversaturated, text, subtitles, captions, logos on the building, watermark, horizontal frame
```

---

## HİSSƏ 5 (40–50 san) — Elektrik və havalandırma
Start frame: `scenes/05_electrical.jpg` · Shot 2 referansı: `scenes/06_ventilation.jpg`

```
Vertical 9:16 ultra-realistic cinematic commercial shot, natural motion, 24 fps. SHOT 1 (0-5s): inside a building under renovation, a male electrician in a navy blue uniform, white hard hat, safety glasses and insulated gloves works on a modern electrical distribution panel full of neatly arranged color-coded wires and white circuit breakers, he tightens a terminal screw with a screwdriver and then flips a breaker switch on, a small green indicator LED lights up, a bright LED work lamp illuminates the panel, camera slowly pushes in toward his hands, shallow depth of field. SHOT 2 (5-10s): cut to a large industrial hall with tall windows, two male technicians in navy blue uniforms and safety harnesses stand on a mobile scaffold and lift a large shiny galvanized ventilation duct into place on the ceiling, one secures it with a cordless drill, rows of silver ducts above, sunbeams stream through the windows and dust floats in the light, the camera slowly tilts up from the scaffold to the ceiling. All workers are adult men.
```
**Negative prompt**
```
women, children, extra people appearing, sparks and fire, electric shock, smoke, wires moving by themselves, deformed hands, extra fingers, distorted faces, ducts bending like rubber, scaffold collapsing, melting, morphing, unrealistic physics, flickering, jitter, camera shake, blurry, low resolution, cartoon, CGI look, oversaturated, text on the panel, labels with letters, subtitles, captions, logos, watermark, horizontal frame
```

---

## HİSSƏ 6 (50–60 san) — Kondisioner və daxili təmir
Start frame: `scenes/07_air_conditioner.jpg` · Shot 2 referansı: `scenes/08_interior_renovation.jpg`

```
Vertical 9:16 ultra-realistic cinematic commercial shot, natural motion, 24 fps. SHOT 1 (0-5s): a bright modern apartment with large windows and soft daylight, a male technician in a navy blue work uniform stands on an aluminium step ladder and presses a sleek white split air conditioner indoor unit into place on the wall, checks it with a spirit level, then the air conditioner louver smoothly opens, the camera slides slowly from right to left. SHOT 2 (5-10s): cut to an apartment under renovation, low camera at floor level, a male tiler in a navy blue uniform kneels and presses a large light grey porcelain tile into the combed adhesive, taps it twice with a black rubber mallet and places a tile leveling clip, in the background a second male worker smooths plaster on the wall, warm work light, dust particles drifting, the camera slowly pushes in toward the tile. All workers are adult men.
```
**Negative prompt**
```
women, children, extra people appearing, air conditioner falling, ladder sliding, tiles floating, tiles breaking, adhesive moving by itself, deformed hands, extra fingers, distorted faces, melting, morphing, unrealistic physics, flickering, jitter, camera shake, blurry, low resolution, cartoon, CGI look, plastic skin, oversaturated, text, brand names on the air conditioner, subtitles, captions, logos, watermark, horizontal frame
```

---

## HİSSƏ 7 (60–70 san) — Nəticə, komanda və böyük layihələr
Start frame: `scenes/09_finished_interior.jpg` · Referanslar: `scenes/10_team.jpg`, `scenes/10B_building.jpg`

```
Vertical 9:16 ultra-realistic cinematic commercial, natural motion, 24 fps, warm premium look with navy blue and gold accents. SHOT 1 (0-3s): slow cinematic pull-back revealing a finished luxury living room after renovation, polished beige marble floor with reflections, cream sofa, navy blue velvet armchair with gold legs, gold chandelier sparkling, warm golden hour sunlight through tall windows, sheer curtains swaying gently, no people. SHOT 2 (3-7s): cut to five adult men, a construction team in white hard hats and navy blue work uniforms, standing confidently on the green lawn in front of a newly completed modern two-storey private house with a beige and grey facade and wooden accents, golden hour sunset, the engineer in the center slightly unrolls blueprints and looks at the camera with a calm confident smile, the others stand with arms crossed and nod subtly, slow push-in at chest height, gentle lens flare. SHOT 3 (7-10s): cut to a slow drone pull-back and rise away from a modern 8-storey residential building at blue hour, warm lights glowing in the windows, landscaped courtyard, city lights and car light trails in the distance.
```
**Negative prompt**
```
women, female engineer, children, extra people appearing, changing faces, faces morphing between frames, deformed hands, extra fingers, distorted faces, blueprints with readable text, furniture moving by itself, buildings bending, melting, morphing, unrealistic physics, flickering windows, jitter, camera shake, blurry, low resolution, cartoon, CGI look, plastic skin, oversaturated, text, subtitles, captions, logos, watermark, horizontal frame
```

---

## HİSSƏ 8 (70–80 san) — Logo və əlaqə

**Ən təhlükəsiz yol:** hazır `outro/MEH_Insaat_logo_outro_9x16_10s.mp4` klipini işlət. Orada logo orijinal fayldandır, nömrə də dəqiqdir.
Generatorda yaratmaq istəsən, Start + End frame rejimində işlət. Logonun dəyişməməsi üçün End frame mütləqdir:
Start frame: `outro/P8_start_frame_empty.png` · End frame: `outro/P8_end_frame_logo.png`

```
Vertical 9:16 premium logo reveal, 10 seconds, clean warm-white studio background with a soft gradient, delicate golden light rays from the top and fine floating gold dust particles. Thin glowing golden blueprint lines draw themselves in the center, a deep navy blue circle forms, the golden building outlines rise from the bottom up inside the circle, a soft light sweep passes over the emblem, then the company name and the line below it gently fade in, a thin gold line grows from the center and the phone number fades in at the bottom. The final 4 seconds hold perfectly still and match the end frame exactly. The logo, its letters, colors and proportions must be identical to the end frame, no redesign.
```
**Negative prompt**
```
changing the logo, redrawing the logo, distorted letters, misspelled text, extra letters, wrong numbers, warped circle, different colors, different font, 3D extrusion of the logo, logo rotating, logo flipping, morphing, melting, flicker, jitter, dark background, people, objects, watermark, horizontal frame
```
Generator yazını və ya nömrəni səhv çıxarsa, hazır outro klipini işlət. İstəsən, logo hissəsini ondan, nömrəni CapCut-da ayrıca text layer kimi əlavə edə bilərsən.

---

# Səsləndirmə (ElevenLabs) — 80 saniyə

**Model:** Eleven v3, çünki Azərbaycan dilini dəstəkləyən dillər siyahısındadır. Tələffüz zəif çıxsa, Multilingual modeli də sına. Hansı modelin Azərbaycan dilini daha yaxşı oxuduğunu dəqiq bilmirəm, ona görə ikisini də yoxla.

**Voice Design prompt** (hazır səs seçməyəcəksənsə):
```
A confident, warm, deep adult male voice in his late 30s, native Azerbaijani speaker, calm and trustworthy corporate tone, clear diction, medium-slow pace, premium commercial narrator, studio quality, no background noise.
```

**Parametrlər:** Stability 50% · Similarity 75% · Style 25% · Speaker Boost: on · Speed 0.95

**Mətn, hissə-hissə.** Hər hissəni ayrıca generasiya et və CapCut-da göstərilən saniyəyə qoy.

| Hissə | Başlanğıc | Mətn |
|---|---|---|
| 1 | 0.5 san | Hər böyük layihə boş bir torpaqdan başlayır. |
| 2 | 10.5 san | Möhkəm təməl — etibarlı gələcək. MEH-İnşaat — bir, iki və üç mərtəbəli evlərin sıfırdan tikintisi. |
| 3 | 20.5 san | Yol və asfalt işləri — dəqiq, möhkəm, uzunömürlü. |
| 4 | 30.5 san | Küçə və park işıqlandırması: dirəyin quraşdırılmasından lampanın yanmasına qədər. |
| 5 | 40.5 san | Elektrik təchizatı və havalandırma sistemləri — tam təhlükəsizliklə. |
| 6 | 50.5 san | Kondisionerlərin quraşdırılması və daxili təmir — hər detalda keyfiyyət. |
| 7 | 60.5 san | Nəticə — arzuladığınız məkan. Peşəkar komanda, vaxtında təhvil. |
| 8 | 70.5 san | MEH-İnşaat MMC. Təmir və tikinti xidmətləri. Zəng edin: sıfır yetmiş, yeddi yüz on bir, iyirmi iki, əlli dörd. |

**Bir parçada generasiya üçün bütöv mətn:**
```
Hər böyük layihə boş bir torpaqdan başlayır.
Möhkəm təməl — etibarlı gələcək. MEH-İnşaat — bir, iki və üç mərtəbəli evlərin sıfırdan tikintisi.
Yol və asfalt işləri — dəqiq, möhkəm, uzunömürlü.
Küçə və park işıqlandırması: dirəyin quraşdırılmasından lampanın yanmasına qədər.
Elektrik təchizatı və havalandırma sistemləri — tam təhlükəsizliklə.
Kondisionerlərin quraşdırılması və daxili təmir — hər detalda keyfiyyət.
Nəticə — arzuladığınız məkan. Peşəkar komanda, vaxtında təhvil.
MEH-İnşaat MMC. Təmir və tikinti xidmətləri. Zəng edin: sıfır yetmiş, yeddi yüz on bir, iyirmi iki, əlli dörd.
```

Musiqi: corporate cinematic, yavaş başlayıb tədricən güclənən tempdə, 90–100 BPM. Səsləndirmənin altında musiqinin səviyyəsi təxminən -18 dB olsun, son 10 saniyədə yumşaq final vurğusu olsun.
