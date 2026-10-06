# Stream Dashboard

Een dashboard om meerdere **Twitch- en YouTube-livestreams tegelijk** te kijken. Handig voor Minecraft-servers (zoals Hermitcraft of Creator SMP), events of je eigen groep favoriete streamers. Zet de links van je streamers in `streamers.ini`, open het dashboard en je krijgt een wall met streams die je kunt vergroten, verplaatsen en dempen.

Gemaakt door **jefta078** (Discord).

## Wat kan het?

- **Je eigen streamers**: zet hun links in `streamers.ini`, meer hoef je niet te doen.
- **Live-status voor Twitch én YouTube**: zie wie live is, waar, en hoeveel kijkers ze hebben. Wordt elke minuut ververst.
- **Twitch eerst, daarna YouTube**: heeft een streamer beide, dan wordt Twitch getoond. Is die persoon alleen op YouTube live, dan schakelt de stream vanzelf over naar YouTube. Met de knop `YouTube` / `Twitch` op een stream kies je zelf (dat wordt onthouden).
- **Groepen** (optioneel): deel streamers in teams in. Elke groep krijgt een eigen kleur, een filter en een gekleurde rand om de streams.
- **Filters**: Alle, Live, je groepen en Geselecteerd. Daarnaast zoeken op naam en `+ Zichtbare` / `− Zichtbare` om in één keer alles te selecteren of te deselecteren.
- **● Alle live openen**: zet in één klik iedereen die live is op de wall.
- **Meerdere streams tegelijk** in 1 tot 5 kolommen.
- **Geluidsfocus**: de knop `🎧 Alleen deze` boven elke stream zet alleen die stream aan en dempt de rest.
- **Groot maken**: de knop `⤢ Groot` maakt een stream groter. Dit kan met meerdere streams tegelijk.
- **Verplaatsen**: sleep een stream aan de balk bovenaan om hem een andere plek te geven. De stream blijft doorlopen. De volgorde wordt onthouden.
- **Chat** naast de grote streams (vink `Chat bij grote streams` aan). Werkt voor Twitch en voor YouTube-streams die live zijn.
- **Favorieten**: sla je selectie op en laad hem later met één klik terug.
- Je instellingen worden bewaard in je browser.

## Snel aan de slag

1. Download deze repository (`Code` → `Download ZIP`) en pak hem uit, of clone hem met git.
2. Open `streamers.ini` in Kladblok en zet de links van je streamers erin (zie hieronder).
3. Start het dashboard (zie [Starten](#starten)).

## Streamers toevoegen (`streamers.ini`)

Open `streamers.ini` in Kladblok en zet onder `[streamers]` je streamers, één per regel, in de vorm `naam = link`:

```ini
[dashboard]
titel = Mijn Stream Dashboard

[streamers]
Streamer Een  = https://www.twitch.tv/streamereen
Streamer Twee = https://www.youtube.com/@streamertwee
```

Heeft iemand Twitch **én** YouTube? Zet beide links achter elkaar, met een spatie ertussen. Twitch gaat dan voor:

```ini
Streamer Een = https://www.twitch.tv/streamereen https://www.youtube.com/@streamereen
```

Een link zonder naam mag ook. Dan haalt het dashboard de naam zelf uit de link:

```ini
https://www.twitch.tv/streamereen
```

Regels die met `;` of `#` beginnen worden overgeslagen. Die kun je gebruiken voor aantekeningen, of om iemand tijdelijk uit te zetten.

Na een wijziging in `streamers.ini` is de pagina verversen genoeg.

### Groepen (optioneel)

Elke `[sectie]` behalve `[dashboard]` en `[streamers]` is een groep. Elke groep krijgt een eigen kleur, een filter in de lijst en een gekleurde rand om de streams. Met `kleur = ...` kies je zelf de kleur; laat je dat weg, dan wordt er een kleur gekozen.

```ini
[Team Rood]
kleur = #ff5c5c
Streamer Een = https://www.twitch.tv/streamereen

[Team Blauw]
Streamer Twee = https://www.youtube.com/@streamertwee
```

### Welke links werken?

| | Voorbeelden |
| --- | --- |
| Twitch | `https://www.twitch.tv/naam`, `twitch.tv/naam` of alleen `naam` |
| YouTube | `https://www.youtube.com/@naam`, `@naam`, `https://www.youtube.com/channel/UC…` of het kanaal-ID `UC…` |

Een link die het dashboard niet herkent, wordt overgeslagen. Je ziet dan een waarschuwing in de console van je browser (F12).

## Starten

Je hebt de bestanden via een lokale server nodig. Als je `index.html` direct opent (`file://`), laadt Twitch de speler niet en kan het dashboard `streamers.ini` niet lezen.

**Windows:** dubbelklik op `start.bat`. Dat start een server en opent <http://localhost:8080>. Laat het zwarte venster open zolang je het dashboard gebruikt. Sluit je het, dan stopt de site.

`start.bat` gebruikt Python (`server.py`) als dat is geïnstalleerd. Anders gebruikt het Node.js (`npx http-server`).

> **De YouTube-live-status werkt alleen met Python**, want `server.py` haalt die op. Met Node.js werkt alleen de Twitch-status. YouTube-streams kun je dan nog wel bekijken door zelf een link te plakken (🔗). Heb je in `streamers.ini` het kanaal-ID (`UC…`) gebruikt, dan probeert het dashboard zelf de livestream van dat kanaal te laden.

**Handmatig (Windows, macOS, Linux):**

```bash
python server.py 8080
```

Op macOS en Linux heet het commando vaak `python3` in plaats van `python`. Open daarna <http://localhost:8080>. Wil je een andere poort, bijvoorbeeld om twee dashboards tegelijk te draaien, vervang dan `8080` door een ander getal.

## Bediening

### Bovenaan de pagina

| Knop | Wat het doet |
| --- | --- |
| ☰ Streamers | Lijst met streamers in- of uitklappen (de wall krijgt dan meer ruimte) |
| Kolommen | Aantal kolommen op de wall |
| Chat bij grote streams | Twitch- of YouTube-chat naast grote streams |
| ● Alle live openen | Alle streamers die nu live zijn op de wall zetten |
| 🔇 Alles dempen | Alle streams dempen |
| ▶ Alles afspelen | Alle streams starten (probeert ongeveer 10 seconden opnieuw) |
| ⏸ Alles pauzeren | Alle streams pauzeren |
| Favorieten laden / ★ Opslaan | Je selectie bewaren en terugzetten |
| Wall leegmaken | Alle streams weghalen |

### Op elke stream

| Knop | Wat het doet |
| --- | --- |
| Balk bovenaan | Vasthouden en slepen om de stream te verplaatsen |
| 🎧 Alleen deze | Alleen deze stream met geluid |
| ⤢ Groot / ⤡ Terug | Stream groot maken of terugzetten |
| 🔇 / 🔊 | Geluid van deze stream aan of uit (verschijnt als je met de muis over de stream gaat) |
| YouTube / Twitch | Wisselen tussen Twitch en YouTube (als de streamer beide heeft) |
| 🔗 | Zelf een YouTube-link plakken (alleen nodig als de automatische detectie het mist) |
| ⏸ / ▶ | Deze stream pauzeren of hervatten |
| ⛶ | Volledig scherm |
| ✕ | Stream verwijderen van de wall |

## Tips en beperkingen

- **Veel streams tegelijk is zwaar** voor je pc. Bij meer dan 9 streams krijg je een waarschuwing.
- **Geluid is standaard uit.** Browsers blokkeren geluid bij autoplay, dus je zet het zelf aan.
- Twitch pauzeert streams als je tabblad op de achtergrond staat. Bij terugkomen worden ze weer afgespeeld, behalve streams die je zelf hebt gepauzeerd.
- Soms wacht een stream op een klik op de ▶ van Twitch zelf. Dat kan een pagina niet namaken.
- Een YouTube-streamer die niet live is, krijgt een melding in plaats van een speler. Gaat die persoon live, dan verschijnt de stream binnen een minuut vanzelf.
- **Zie je andere streamers dan in je `streamers.ini`?** Dan draait er waarschijnlijk nog een andere server (bijvoorbeeld een ander dashboard) op dezelfde poort. Sluit de oude zwarte vensters, of start dit dashboard op een andere poort.

## Projectstructuur

```
streamers.ini  links van je streamers  ← dit pas je aan
index.html     pagina
style.css      opmaak
loader.js      leest streamers.ini in
app.js         logica
server.py      lokale server zonder caching + YouTube-live-check
start.bat      start de server en opent het dashboard (Windows)
```

## Techniek

Gewoon HTML, CSS en JavaScript, zonder framework of build-stap. Er zijn geen API-sleutels nodig. De streams komen uit de Twitch-embed en de YouTube-embed.

- **Twitch-status** komt uit de publieke webclient van Twitch.
- **YouTube-status** haalt `server.py` op door per kanaal `youtube.com/<kanaal>/live` te bekijken (maximaal één keer per 50 seconden per kanaal).

Als Twitch of YouTube daar iets aan verandert, kan de live-status stoppen met werken. De streams zelf blijven dan gewoon werken.

## Disclaimer

Dit is een fanproject en niet gelieerd aan Twitch, YouTube, Minecraft of Mojang.

## Contact

Discord: **jefta078**
