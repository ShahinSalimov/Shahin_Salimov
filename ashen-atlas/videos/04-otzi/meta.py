"""Writes YouTube/TikTok metadata for the Bronze Age Collapse video, with chapters from timeline.json. Usage: meta.py ROOT"""
import sys, json
S = sys.argv[1]
tl = json.load(open(f"{S}/timeline.json")); off = {int(k): v for k, v in tl["sec_off"].items()}
def ts(t): t = int(t); return f"{t // 60:02d}:{t % 60:02d}"
CH = [(1, "Cold open: the faces of the invaders"), (2, "Introduction"), (3, "The first global age"), (4, "A ship full of metal: Uluburun"),
      (6, "The fall of Ugarit, Hattusa and Pylos"), (7, "The Sea Peoples"), (8, "The suspects: drought, earthquakes, revolt"),
      (9, "A perfect storm"), (10, "After the dark: iron, the alphabet, Homer"), (11, "What we know vs. what we don't"), (12, "Outro")]
chap = "\n".join(f"{'00:00' if n == 1 else ts(off[n])} {t}" for n, t in CH)
total = tl["total"]
txt = f"""=== FULL VIDEO ({ts(total)}) ===

TITLE (main):
The Bronze Age Collapse: Who Destroyed the First Global World?

A/B TITLES (Test & Compare):
1) The Bronze Age Collapse: Why Every Great Empire Fell at Once
2) 1177 BC: The Year the Ancient World Fell Apart

THUMBNAILS (Test & Compare): T1_WHO_DESTROYED_IT (main), T2_WHO_WERE_THEY, T3_THE_WORLD_ENDED

DESCRIPTION:
Around 1200 BCE, the great kingdoms of the eastern Mediterranean fell within a few decades. The Hittite Empire vanished. The rich port of Ugarit burned and was never rebuilt. The Mycenaean palaces of Greece went up in flames, and writing disappeared from whole regions. Egypt barely survived.

Who was responsible? The mysterious Sea Peoples carved on the walls of Medinet Habu? Drought and famine? Earthquakes? Or the collapse of the first connected trade network in history? In this documentary we follow the evidence: the Amarna letters, the Uluburun shipwreck, the last letters of Ugarit, the inscriptions of Ramesses III, and new climate data from lake sediments.

CHAPTERS
{chap}

Watch next: Göbekli Tepe, the Temple Before Civilization

Historical scenes in this video are AI-generated reconstructions. Quotations from ancient texts are shortened translations. Maps, timeline and diagrams are simplified illustrations; dates and locations are approximate.

SOURCES
- Cline, E. H. (2014; rev. 2021). 1177 B.C.: The Year Civilization Collapsed. Princeton University Press.
- Medinet Habu inscriptions of Ramesses III, Year 8 (Epigraphic Survey, Oriental Institute, University of Chicago).
- Ugarit letters RS 20.238 and RS 20.18 (Ammurapi of Ugarit and the king of Alashiya).
- Pulak, C. (2008). The Uluburun shipwreck and Late Bronze Age trade. In: Beyond Babylon, Metropolitan Museum of Art.
- Langgut, D., Finkelstein, I., Litt, T. (2013). Climate and the Late Bronze Collapse: new evidence from the Southern Levant. Tel Aviv 40.
- Kaniewski, D. et al. (2013). Environmental roots of the Late Bronze Age crisis. PLoS ONE 8(8).
- Seeher, J. (2001). Die Zerstörung der Stadt Hattuša. Akten des IV. Internationalen Kongresses für Hethitologie.

#BronzeAgeCollapse #AncientHistory #Documentary

TAGS (comma-separated, under 500 characters):
bronze age collapse, 1177 bc, sea peoples, late bronze age, ancient history documentary, hittites, mycenaeans, ugarit, ramesses iii, medinet habu, uluburun shipwreck, amarna letters, collapse of civilization, ancient egypt, trojan war, eric cline, ancient mysteries, history documentary, ashen crown

PINNED COMMENT:
Which do you think did the most damage: the Sea Peoples, drought, earthquakes or the collapse of trade? Tell us below. The Göbekli Tepe documentary is on the end screen.


=== SHORT 1: Sea Peoples ===
TITLE: Who Were the Sea Peoples? #shorts
DESCRIPTION:
Around 1200 BCE, great cities from Greece to Syria burned. Egyptian carvings call the attackers the peoples of the sea. Full documentary on the channel.
AI-generated reconstructions.
#shorts #SeaPeoples #BronzeAgeCollapse #AncientHistory
TAGS: sea peoples, bronze age collapse, shorts, ancient history, ramesses iii, ancient egypt, 1177 bc
COVER: Cover_BAC_SeaPeoples.jpg

=== SHORT 2: Ugarit ===
TITLE: The Last Letter of a Dying Kingdom #shorts
DESCRIPTION:
"My father, the enemy's ships came. My cities were burned." The last king of Ugarit, c. 1185 BCE. Full documentary on the channel.
AI-generated reconstructions; quotation shortened.
#shorts #Ugarit #BronzeAgeCollapse #AncientHistory
TAGS: ugarit, bronze age collapse, shorts, ancient history, sea peoples, ancient letters, archaeology
COVER: Cover_BAC_Ugarit.jpg

=== SHORT 3: Uluburun ship ===
TITLE: A Diver Found This 3,300-Year-Old Ship #shorts
DESCRIPTION:
In 1982 a sponge diver off Turkey found a Bronze Age ship with 10 tonnes of copper, ivory, amber and a gold scarab of Nefertiti. Full documentary on the channel.
AI-generated reconstructions.
#shorts #Uluburun #Shipwreck #AncientHistory
TAGS: uluburun shipwreck, bronze age, shipwreck, shorts, archaeology, nefertiti, ancient trade, bronze age collapse
COVER: Cover_BAC_Ship.jpg

RELATED VIDEO for all 3 Shorts: the full Bronze Age Collapse documentary.


=== TIKTOK CAPTIONS ===
1) Who were the Sea Peoples? Around 1200 BCE the greatest kingdoms of the ancient world fell. #history #ancienthistory #seapeoples #bronzeage #documentary
2) The last letter of a dying kingdom: "My cities were burned." Ugarit, c. 1185 BCE. #history #ancienthistory #archaeology #bronzeage #lostworlds
3) A sponge diver found a 3,300-year-old ship full of treasure. #shipwreck #archaeology #history #ancientegypt #bronzeage
"""
open(f"{S}/deliver/YouTube_metadata_BronzeAgeCollapse.txt", "w").write(txt); print(chap)
