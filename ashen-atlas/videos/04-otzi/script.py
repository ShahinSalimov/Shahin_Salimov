# Ashen Crown (copied from #3, rewrite for Ötzi) - Video #3: The Bronze Age Collapse. Narration source (English). One string = one paragraph.
# Facts are hedged where scholars disagree. Main references: Eric H. Cline, "1177 B.C." (2014/2021);
# Medinet Habu inscriptions of Ramesses III; Ugarit tablet RS 20.238; Uluburun excavation (INA, Pulak);
# Langgut, Finkelstein & Litt 2013 (Sea of Galilee pollen); Kaniewski et al. 2013 (Cyprus).
import json, sys
SECTIONS = [
("COLD OPEN", [
"Look at this face. He is one of the invaders carved on the walls of an Egyptian temple, more than three thousand years ago. The Egyptians called his people the peoples of the sea. And within a few decades, the greatest kingdoms of the ancient world were gone.",
"Around twelve hundred BCE, from Greece to Syria, palaces burned. Cities were abandoned. Writing disappeared from whole regions. Trade routes that had linked three continents fell silent.",
"Was it these raiders from the sea? Or something much bigger? By the end of this video, you'll know what the evidence says, and why it still matters today.",
]),
("TITLE", [
"This is the story of the Bronze Age Collapse, the moment the first connected world in history fell apart. We'll ask three questions. What was lost? Who, or what, destroyed it? And what rose from the ashes?",
]),
("THE FIRST GLOBAL AGE", [
"Imagine the eastern Mediterranean around thirteen hundred BCE.",
"In Egypt, the pharaohs of the New Kingdom ruled from the Nile to the coast of the Levant. In Anatolia, the Hittite kings ruled from their mountain capital, Hattusa. In Mesopotamia stood Babylon and a rising Assyria. In Greece, warrior kings ruled from fortified palaces at Mycenae, Pylos and Thebes. And on Crete and Cyprus, and in rich trading cities like Ugarit on the Syrian coast, merchants grew wealthy.",
"These powers fought wars. But they also wrote to each other. In the eighteen eighties, at a site in Egypt called Amarna, local people found a cache of clay tablets. They turned out to be the letters of kings, written mostly in Akkadian, the diplomatic language of the age.",
"In these letters, the great kings call each other brother. They trade gold for horses, ask for doctors, arrange royal marriages, and complain when a gift is too small. One king of Babylon grumbled that the gold the pharaoh sent him, when it was put in the furnace, turned out to be worth less than it should.",
"Even old enemies made peace. In twelve fifty-nine BCE, after years of war over Syria, Ramesses the Second of Egypt and the Hittite king Hattusili the Third signed a treaty. Copies survive in both Egyptian hieroglyphs and in Akkadian on clay. It is one of the oldest peace treaties known, and a replica hangs today at the United Nations in New York.",
"Historians sometimes call this world a club of great powers. It was not one empire. It was a network. And like any network, it depended on everything continuing to move.",
]),
("A SHIP FULL OF METAL", [
"In nineteen eighty-two, a sponge diver off the southern coast of Turkey, near a cape called Uluburun, reported strange metal biscuits with ears on the seabed.",
"They were copper ingots. Underwater archaeologists from the Institute of Nautical Archaeology spent more than ten years excavating the wreck. It had sunk around thirteen hundred BCE.",
"On board were about ten tonnes of copper and around one tonne of tin. There were blue glass ingots, ebony from Africa, elephant and hippopotamus ivory, amber from the Baltic region, jars of resin, Canaanite jewellery, Mycenaean pottery, and a gold scarab with the name of the Egyptian queen Nefertiti.",
"One ship carried goods from at least seven different cultures. This was trade on a scale the world would not see again for centuries.",
"And look at those two metals. Copper and tin, mixed roughly nine to one, make bronze. Bronze made the weapons, the tools, the armour of the age. But copper came largely from places like Cyprus, and tin came from very far away, possibly from Central Asia, carried over thousands of kilometres.",
"No kingdom could make bronze on its own. Every army, every palace, depended on ships like this one arriving safely.",
]),
("RE-HOOK", [
"So what happens when the ships stop coming? To find out, we need to go to a city on the coast of Syria, in its final days.",
]),
("THE FALL", [
"Ugarit was one of the richest ports of the Bronze Age. Its archives held texts in many languages, and its scribes used one of the earliest alphabets in the world, written in wedge-shaped signs on clay.",
"Among the tablets found in the ruins is a letter from the last king of Ugarit, Ammurapi, to the king of Cyprus. It reads, in part: My father, behold, the enemy's ships came. My cities were burned, and they did evil things in my country. Does my father not know that all my troops and chariots are in the land of Hatti, and all my ships are in the land of Lukka?",
"Another letter from the king of Cyprus gives advice: if enemy ships have been seen, make yourself strong, gather your troops and chariots, and fortify your cities. It may have come too late.",
"Ugarit was destroyed, most likely within a few years after eleven ninety BCE. It was never rebuilt.",
"Inland, the Hittite capital Hattusa was abandoned and parts of it burned. Excavators believe much of the city had already been emptied before the fire, as if the royal court had left. After the last known king, Suppiluliuma the Second, the Hittite Empire simply disappears from history.",
"In Greece, the palace of Pylos burned around the same period. The fire baked hundreds of clay tablets written in Linear B, an early form of Greek, and preserved them. Some of them seem to describe watchers being sent to guard the coast.",
"Mycenae, Tiryns and Thebes suffered destructions. Cities in Cyprus and on the Levantine coast were damaged or abandoned. Over a few decades, many of the great centres of the eastern Mediterranean were destroyed, and many of them never recovered.",
]),
("THE SEA PEOPLES", [
"So who were the enemies on those ships?",
"Egyptian records give us a name. Around twelve hundred and eight BCE, the pharaoh Merneptah fought off an invasion from Libya. Among the attackers were groups the Egyptians described as coming from the sea: the Sherden, the Shekelesh, the Lukka, and others.",
"Some of these names were not new. Sherden warriors had served earlier pharaohs as mercenaries, even as royal bodyguards. The peoples of the sea were not strangers from nowhere. They were part of the same world that was now breaking apart.",
"About thirty years later, in the eighth year of the pharaoh Ramesses the Third, the threat returned. On the walls of his temple at Medinet Habu, near Thebes, Ramesses recorded what happened.",
"The foreign countries made a conspiracy in their islands, the inscription says. No land could stand before their arms, from Hatti, Kode, Carchemish, Arzawa and Alashiya on.",
"The reliefs show a great battle on land, and a naval battle at the mouth of the Nile. Enemy warriors wear horned helmets or tall feathered headdresses. Ox carts carry women and children. These were not only raiders. Many of them seem to have been migrants, looking for new land.",
"Ramesses claims a total victory. Some of the defeated, the inscription says, were settled in fortresses under Egyptian control.",
"Among the names on the list are the Peleset. Many scholars connect them with the Philistines, who settled on the southern coast of Canaan soon afterwards.",
"So the Sea Peoples were real. But were they the cause of the collapse? Or were they a symptom of it?",
]),
("THE SUSPECTS", [
"Today, most historians think no single enemy could have done all this. Instead, they point to several problems that hit at the same time.",
"The first suspect is drought. Pollen preserved in sediment cores from the Sea of Galilee, and from a salt lake on Cyprus, suggest a long dry period in the region in the late thirteenth and twelfth centuries BCE.",
"Texts point the same way. Egyptian records say Merneptah sent grain to keep the land of Hatti alive. Letters found at Ugarit mention urgent shipments of grain. In one of them, the writer calls it a matter of life or death.",
"The second suspect is earthquakes. Several sites show damage that may have been caused by them, and some scientists have proposed a so-called earthquake storm, a series of large quakes over decades. Others think the evidence is too uncertain.",
"The third suspect is people inside the kingdoms. Palace societies were heavily taxed and tightly controlled. When harvests failed, some historians think, ordinary people may have rebelled, or simply walked away.",
"And the fourth is the network itself. When trade broke down, copper and tin stopped flowing. Kingdoms that depended on each other began to fail one after another.",
]),
("THE PERFECT STORM", [
"The historian Eric Cline, who wrote a well-known book on the collapse, calls it a perfect storm. Each of these problems alone might have been survivable. Together, they overwhelmed a system in which everything was connected.",
"Think of it as a chain of dominoes. Drought brings hunger. Hunger brings unrest and migration. Migrants and raiders attack weakened cities. Destroyed ports mean trade stops. Without trade, no bronze, no luxury goods for the elites, no grain for the hungry.",
"The more connected the world was, the faster the damage spread. Its greatest strength had become its weakness.",
"Not everyone fell. Egypt survived, though it lost its empire in the Levant and grew weaker over the following century. Assyria survived. Some cities on the Phoenician coast, like Tyre, Sidon and Byblos, came through. But the old order was gone.",
]),
("AFTER THE DARK", [
"In Greece, what followed is often called a Dark Age. For about four centuries, there were no palaces, fewer people, and no writing. Linear B was forgotten.",
"When the Greeks began to write again, they used a new system, borrowed from the Phoenicians. It was an alphabet, simple enough for merchants, not just palace scribes.",
"Iron came into wider use. Iron ore can be found in many places, unlike tin. Some historians think the loss of the tin trade pushed smiths to master iron working, though the change was gradual.",
"New peoples and kingdoms appeared in the Levant, among them the Philistines, the Phoenician city-states and ancient Israel, whose name first appears on a stele of Merneptah. Out of the ruins of the Bronze Age came the world of Homer, of the alphabet, and of classical Greece.",
"And the memory of the lost age did not vanish completely. Centuries later, Greek poets sang of Mycenae rich in gold, of kings like Agamemnon, and of a great war at Troy. Whatever really happened, the Greeks of the Iron Age remembered that before them there had been a greater age, of heroes and palaces, that had ended in fire.",
]),
("WHAT WE KNOW VS. WHAT WE DON'T", [
"So what can we say for sure?",
"Many major centres from Greece to Syria were destroyed or abandoned in the decades around twelve hundred BCE. The Hittite Empire, Ugarit and the Mycenaean palaces did not survive.",
"Egyptian texts describe invasions by groups from the sea, and climate records suggest a serious drought.",
"But we still don't know exactly who the Sea Peoples were, or where they came from. We don't know how much damage they caused, or how much was done by earthquakes, famine or revolt. And we don't know the exact order in which the dominoes fell.",
"New evidence still appears, from shipwrecks, sediment cores, and tablets found in the ruins.",
]),
("OUTRO", [
"Three thousand years ago, an interconnected world, with its diplomats, merchants and great kings, came apart within a few generations.",
"The people who lived through it could not see the whole picture. They only saw the ships on the horizon, the empty granaries, and the letters that never got an answer.",
"I'm Ashen Crown. If you want more stories of lost worlds, subscribe, and I'll see you in the next one.",
]),
]
if __name__ == "__main__":
    json.dump([{"title": t, "paras": p} for t, p in SECTIONS], open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
    w = sum(len(x.split()) for _, p in SECTIONS for x in p)
    print(len(SECTIONS), "sections,", sum(len(p) for _, p in SECTIONS), "paragraphs,", w, "words")
