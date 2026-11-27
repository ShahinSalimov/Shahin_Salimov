"""Style suffixes for the 1849 Venice balloon-bomb Short (Modern vs Past test #1)."""
STYLE = ", photorealistic cinematic film still, 1849 Venice, mid-19th century, overcast golden light, muted sepia and teal tones, 35mm film grain, shallow depth of field"
MODERN = ", photorealistic cinematic film still, present-day, cold blue dusk light, 35mm film grain, shallow depth of field, no text, no markings, no logos"
def full(kind, p):
    return p + (MODERN if "modern" in p else STYLE)
