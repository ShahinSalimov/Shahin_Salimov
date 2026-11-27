"""MEH-Insaat: Azerbaijani male voiceover (edge-tts, az-AZ-BabekNeural) synced to the 92.4 s cut.

Generates every line separately, checks it fits its scene (speeds the line up
slightly if needed), places each line at its exact second, ducks optional music
under the voice and writes the final mp4.

  pip install edge-tts          (ffmpeg must be installed)
  python make_voiceover.py video.mp4                 -> voice only
  python make_voiceover.py video.mp4 music.mp3       -> voice + music
Outputs: vo_lines/*.mp3, voiceover_full.wav, MEH_Insaat_final.mp4
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

import edge_tts

VOICE = "az-AZ-BabekNeural"   # male; female: az-AZ-BanuNeural
PITCH = "-2Hz"                # a little deeper, more corporate
EXTEND = 4.0                  # freeze the last frame 4 s for the phone line

# (start s, scene end s, text) - measured from the video's scene cuts
LINES = [
    (0.4, 13.0, "Hər böyük layihə bir eskizdən başlayır. Planlaşdırma, layihələndirmə və dizayn — evinizin hər detalı əvvəlcədən düşünülür."),
    (13.4, 18.0, "Boş torpaq üzərində ilk xətlər çəkilir."),
    (18.4, 23.0, "Torpaq işləri və təməl qazıntısı."),
    (23.4, 29.0, "Möhkəm təməl — ağır texnika ilə beton tökülməsi."),
    (29.4, 36.2, "Divarların hörülməsindən dam örtüyünə qədər — bir, iki və üç mərtəbəli evlər."),
    (36.5, 40.0, "Daxili təmir və bəzək işləri."),
    (40.4, 48.5, "Elektrik təchizatı: elektrik lövhələri, rozetkalar və işıqlandırma — tam təhlükəsizliklə."),
    (48.9, 57.4, "Havalandırma sistemlərinin layihələndirilməsi və quraşdırılması — yaşayış və kommersiya obyektlərində."),
    (57.7, 61.5, "Kondisionerlərin peşəkar quraşdırılması."),
    (61.9, 71.5, "Yol və asfalt işləri — dəqiq, möhkəm və uzunömürlü."),
    (71.9, 81.5, "Küçə və park işıqlandırması: dirəyin quraşdırılmasından lampanın yanmasına qədər."),
    (81.9, 86.4, "Peşəkar komanda. Vaxtında və keyfiyyətli təhvil."),
    (87.0, 92.4, "Meh İnşaat MMC. Təmir və tikinti xidmətləri."),
    (92.6, 96.4, "Zəng edin: sıfır yetmiş, yeddi yüz on bir, iyirmi iki, əlli dörd."),
]
RATES = ["-6%", "+0%", "+6%", "+12%", "+18%"]  # tried in order until the line fits


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True).stdout
    return float(json.loads(out)["format"]["duration"])


async def make_lines(folder):
    folder.mkdir(exist_ok=True)
    placed = []
    for i, (start, end, text) in enumerate(LINES, 1):
        path = folder / f"{i:02d}.mp3"
        room = end - start - 0.35
        for rate in RATES:
            await edge_tts.Communicate(text, VOICE, rate=rate, pitch=PITCH).save(str(path))
            d = duration(path)
            if d <= room:
                break
        status = "OK " if d <= room else "UZUN"
        print(f"{status} {i:02d}  {start:5.1f}s  {d:4.1f}s / {room:4.1f}s  rate {rate}  {text[:45]}")
        placed.append((start, path))
    return placed


def main():
    video = Path(sys.argv[1])
    music = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    placed = asyncio.run(make_lines(Path("vo_lines")))
    total = duration(video) + EXTEND

    # 1) full voice track
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for _, p in placed:
        args += ["-i", str(p)]
    chains = [f"[{k}:a]aresample=48000,adelay={int(s * 1000)}:all=1[a{k}]" for k, (s, _) in enumerate(placed)]
    mix = "".join(f"[a{k}]" for k in range(len(placed)))
    flt = ";".join(chains) + f";{mix}amix=inputs={len(placed)}:normalize=0,apad,atrim=0:{total}[vo]"
    subprocess.run(args + ["-filter_complex", flt, "-map", "[vo]", "voiceover_full.wav"], check=True)

    # 2) video (+4 s freeze for the phone line) + voice (+ ducked music)
    args = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", "voiceover_full.wav"]
    vf = f"[0:v]tpad=stop_mode=clone:stop_duration={EXTEND}[v]"
    if music:
        args += ["-stream_loop", "-1", "-i", str(music)]
        af = (f"[2:a]atrim=0:{total},volume=0.55,afade=t=out:st={total - 1.5}:d=1.5[m];"
              "[1:a]asplit=2[vo][sc];"
              "[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=30:release=350[md];"
              "[vo][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    else:
        af = "[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]"
    subprocess.run(args + ["-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]",
                           "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
                           "MEH_Insaat_final.mp4"], check=True)
    print("Hazırdır: MEH_Insaat_final.mp4  (" + f"{total:.1f}" + " san)")


if __name__ == "__main__":
    main()
