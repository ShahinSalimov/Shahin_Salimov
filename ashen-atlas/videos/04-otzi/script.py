# Ashen Crown - Video #4: Ötzi the Iceman. Narration source (English). One string = one paragraph.
# Facts hedged where scholars disagree. Main references: Spindler 1994; Gostner & Egarter Vigl 2002 (arrowhead);
# Pernter et al. 2007 (artery lesion); Oeggl et al. 2007 (pollen, last 33 hours); Samadelli et al. 2015 (61 tattoos);
# Artioli et al. 2017 (copper axe, Tuscany); Maixner et al. 2018 (last meal); Wang et al. 2023 (genome, Cell Genomics);
# South Tyrol Museum of Archaeology, Bolzano.
import json, sys
SECTIONS = [
("COLD OPEN", [
"Look at this face. Five thousand three hundred years ago, this man climbed high into the Alps. He never came down.",
"Someone shot him in the back with an arrow. Then the ice covered him, and kept his body almost perfectly, for more than five thousand years.",
"Who was he? Why was he up there? And who wanted him dead? By the end of this video, you'll know what the evidence says, and why the case is still open.",
]),
("TITLE", [
"This is the story of Ötzi the Iceman, the oldest murder mystery in the world.",
]),
("THE BODY IN THE ICE", [
"On the nineteenth of September, nineteen ninety-one, two German hikers, Helmut and Erika Simon, left the marked trail near a mountain pass in the Ötztal Alps, more than three thousand two hundred metres high, on the border between Austria and Italy.",
"In a rocky gully full of meltwater, they saw something brown sticking out of the ice. It was a human head and shoulders.",
"They thought it was a climber who had died in an accident, perhaps a few years earlier. That summer had been warm, and the glacier was melting. Bodies of lost mountaineers turned up from time to time.",
"So the recovery was rough. Rescuers hacked at the ice with a pneumatic drill and ice picks, and damaged the body's hip. Pieces of a bow and a strange axe were picked up almost like rubbish.",
"Only when the body reached Innsbruck did an archaeologist look at the axe and realise how old it was. Radiocarbon dating later gave the answer. The man had died around thirty-three hundred BCE.",
"He was older than the Great Pyramid of Giza. Older than the great stones of Stonehenge. When Tutankhamun was born, this man had already been lying in the ice for about two thousand years.",
"Surveyors then found that the body had lain about ninety metres inside Italy. Today he rests in a museum in Bolzano, in a cold cell that copies the conditions of the glacier. The newspapers gave him a nickname, after the valley: Ötzi.",
]),
("WHO WAS ÖTZI?", [
"So who was he?",
"Ötzi was about forty-five years old when he died, old for his time. He was around one metre sixty tall, and probably weighed about fifty kilograms.",
"He lived in the Copper Age, a time when people in the Alps farmed wheat and barley, kept sheep, goats and cattle, and were just beginning to use metal.",
"In twenty twenty-three, scientists published a new, high-quality study of his genome. It showed that more than ninety percent of his ancestry came from early farmers whose ancestors had moved into Europe from Anatolia, in what is now Turkey.",
"It also changed his face. Older reconstructions showed a pale man with thick hair. The genome suggests he had much darker skin, dark eyes, and was probably going bald.",
"His body tells us he had lived a hard life. His joints were worn. He carried the bacteria that cause Lyme disease, and parasites in his gut. One fingernail that survived has lines that may show he was seriously ill three times in his last months.",
]),
("WHAT HE CARRIED", [
"But what makes Ötzi unique is not only his body. It is everything he carried. For the first time, archaeologists could see the complete outfit of a man from the Copper Age.",
"He wore a coat made of strips of sheep and goat leather, sewn together, and leggings of goat leather. His hat was made of bear fur. His shoes had bear-leather soles and were stuffed with dry grass, to keep his feet warm.",
"He carried a flint dagger with a handle of ash wood, birch-bark containers, one of them probably used to carry glowing embers, and a kit to make fire.",
"He also had pieces of birch fungus on leather strings. Some researchers think he may have used it as medicine.",
"And then there was the axe. A blade of almost pure copper, fixed to a handle of yew wood. In his world, this was a precious object, perhaps a sign of status. A study in twenty seventeen suggested the copper came from as far away as southern Tuscany.",
"There was something strange about his weapons, too. His longbow, almost one metre eighty long, was unfinished. In his deer-skin quiver were fourteen arrows. Only two of them were ready to shoot.",
"Why was a man with a valuable axe walking through the high mountains with a bow he could not use? Hold on to that question.",
]),
("SIXTY-ONE TATTOOS", [
"When researchers looked closely at his skin, they found something else. Ötzi is covered in tattoos. Sixty-one of them.",
"They are not pictures. They are groups of short lines and small crosses, made by cutting the skin and rubbing in charcoal. They are among the oldest tattoos known on a human body.",
"Most of them sit on his lower back, his knees, his ankles and his wrists, the places where his joints were worn. So many researchers think they were not decoration. They may have been a kind of treatment, for pain.",
"Five thousand years ago, someone may have tried to heal this man. A few days later, someone else tried to kill him.",
]),
("THE LAST TWO DAYS", [
"Scientists have been able to reconstruct his last days in surprising detail.",
"Pollen in his gut acts like a travel diary. It suggests that in his last day and a half, Ötzi moved from the high mountains down into a valley, and then climbed back up again, very high, very fast. Pollen from a tree called the hop hornbeam was still fresh, so he probably died in late spring or early summer.",
"His right hand had a deep cut between the thumb and the index finger. It had started to heal, so it happened a few days before his death. Some researchers think it was a defensive wound, from a fight.",
"And his stomach was full. His stomach was only located years after the discovery, and its contents were analysed in detail in twenty eighteen. It contained ibex meat, a lot of fat, and einkorn wheat, an early type of grain. He seems to have eaten it perhaps less than two hours before he died.",
"Think about that. A man who believed he was being hunted would not sit down to a large, heavy meal. Ötzi probably felt safe. He had stopped to rest.",
]),
("THE ARROW", [
"For ten years after his discovery, people thought Ötzi had died of cold and exhaustion, maybe caught in a storm.",
"Then, in two thousand and one, a radiologist named Paul Gostner looked again at X-rays of his body. In his left shoulder, he saw a small shape that should not have been there.",
"It was a flint arrowhead.",
"Someone had shot Ötzi from behind. The arrow entered his back and tore a major artery under his collarbone. Later scans showed that the wound was almost certainly fatal. He probably bled to death within minutes.",
"The arrow shaft was never found. Someone may have pulled it out. Perhaps it was the killer, and perhaps because arrows could identify their owner.",
"Ötzi also had a serious injury to his head. Was he struck after he fell? Or did he hit his head on a rock as he collapsed? Scientists still disagree.",
]),
("THE SUSPECTS", [
"So who killed Ötzi? After five thousand years, we will never have a name. But we can look at the motives.",
"The first theory is robbery. But that does not fit well. The killer left behind the most valuable thing Ötzi had: his copper axe. Perhaps such an axe was too easy to recognise, and taking it would have revealed the crime.",
"The second theory is a fight that went wrong. In twenty seventeen, a German police detective, Alexander Horn, reviewed the case like a modern murder. In his view, the hand wound points to a fight a few days earlier. The killer, he suggested, may have followed Ötzi up the mountain, and shot him from a distance while he rested.",
"The third theory is that Ötzi was not a simple shepherd. His copper axe, his age, and his tattoos have led some to wonder whether he was a man of some importance, perhaps caught up in a conflict between groups in the valleys. There is no proof of this.",
"And there are even older ideas, such as a sacrifice or a ritual burial. Most researchers today reject them. The evidence points to a violent, personal attack.",
]),
("WHAT WE KNOW VS. WHAT WE DON'T", [
"So what can we say for sure?",
"Ötzi lived around thirty-three hundred BCE, and died high in the Alps, at about forty-five years old.",
"He was shot from behind with a flint-tipped arrow, and probably died within minutes. He had eaten a large meal shortly before, and had been injured in the hand a few days earlier.",
"But we don't know who shot him, or why. We don't know why he climbed so high, so fast. And we don't know how his head was injured, or why his killer left the copper axe behind.",
"New studies still appear almost every year, from his genes, his gut, his clothes and his tools.",
]),
("OUTRO", [
"For five thousand years, a man lay in a gully below the ice, with his unfinished bow, his fourteen arrows and his copper axe beside him.",
"Then a warm summer melted the ice, and he came back, carrying the oldest crime scene in the world.",
"I'm Ashen Crown. If you want more stories of real people from lost worlds, subscribe, and I'll see you in the next one.",
]),
]
if __name__ == "__main__":
    json.dump([{"title": t, "paras": p} for t, p in SECTIONS], open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
    w = sum(len(x.split()) for _, p in SECTIONS for x in p)
    print(len(SECTIONS), "sections,", sum(len(p) for _, p in SECTIONS), "paragraphs,", w, "words")
