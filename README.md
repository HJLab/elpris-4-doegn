# Elpris – næste 4 dage

En mobilvenlig webapp, som viser fire hele kalenderdage med elpriser for valgfrit DK1 eller DK2. Hver dag går fra kl. 00:00 til 23:59. Offentliggjorte day-ahead-priser suppleres med en tydeligt mærket statistisk prognose for resten af perioden.

## Det viser siden

- Fire kalenderdage opdelt i hele dage fra midnat til midnat.
- Valg mellem DK1 (Vestdanmark) og DK2 (Østdanmark).
- Officielle områdepriser fra Energi Data Service, aggregeret fra kvarter til timer.
- Vejr- og historikbaseret ML-prognose for de resterende timer via elpriser.org.
- Personlige indstillinger for netselskab, elselskab, elaftale, tillæg, abonnementer og årsforbrug.
- Samlet pris inklusive spotpris, transport, moms, afgifter, tillæg og faste abonnementer.
- Bedste sammenhængende 3-timers ladevindue og dyreste time i hver dag.
- Gul, grøn og rød timevisning med de tre dyreste timer tydeligt markeret.
- Alle fire dage er sammenklappet ved åbning og kan foldes ud time for time.
- Automatisk opdatering hver time og lokal cache ved midlertidige netfejl.
- Kan installeres som webapp på PC, Android-telefon og Samsung-tablet.
- Har særskilt appikon og fuldskærmsvisning på både iPhone og Android.
- Gemmer automatisk en daglig prognose via GitHub Actions.
- Viser prognosens gennemsnitlige fejl i øre/kWh for 7 dage, 14 dage, 1 måned eller 3 måneder.
- Har en brugervenlig popup, der forklarer samlet pris, officielle priser, prognosen og farvemarkeringerne.
- Viser efter den første afsluttede måned en månedlig prognoserapport i fire tidsrum: 00–06, 06–12, 12–18 og 18–24.

## Prognosens træfsikkerhed

Den automatiske arbejdsgang i `.github/workflows/archive-forecast.yml` gemmer prognosen for både DK1 og DK2 omkring kl. 15 dansk tid. Når de officielle priser senere er tilgængelige, beregnes den absolutte forskel mellem prognosen og den officielle pris.

Efter en afsluttet måned vises der også en rapport, opdelt i perioderne 00–06, 06–12, 12–18 og 18–24. Den viser både gennemsnitlig absolut fejl i øre/kWh og gennemsnitlig procentfejl i forhold til den officielle spotpris. Rapporten måler kun spotprisen, fordi tariffer, afgifter og abonnementer ikke er en del af selve prognosen.

## Vigtigt om den samlede pris

Standardvalget er DK2, Cerius og Modstrøm med et tillæg på 11 øre/kWh inklusive moms. Brugeren kan ændre alle aftalespecifikke priser under **Indstillinger**. Cerius har en indbygget time- og sæsontarif; andre netselskaber vælges som **Andet**, hvorefter tarifferne indtastes fra elregningen. Faste abonnementer fordeles på det valgte årsforbrug. Kontrollér altid tallene på den seneste regning, da samme selskab kan have flere aftaler.

## Lokal prøve på Windows

Åbn ikke kun `index.html` direkte, da browseren kan blokere datahentning. Start i stedet en lille lokal webserver fra mappen. Hvis Python er installeret:

```powershell
py -m http.server 8080
```

Åbn derefter `http://localhost:8080` i Chrome eller Edge.

## Gratis offentliggørelse

Mappen kan offentliggøres gratis med GitHub Pages. Når siden er lagt på nettet, bruges den samme adresse på alle enheder. Følg den trin-for-trin-vejledning, som gives sammen med projektet.

## Datakilde

Officielle priser stammer fra Energi Data Service. Browservenlige pris- og prognosedata leveres via det åbne, CORS-aktiverede API hos elpriser.org for prisområderne `DK1` og `DK2`.


## Version 7

- Gør det tydeligt, at mærket **Spot officiel** kun gælder spotprisen – ikke hele den beregnede totalpris.
- Viser **uden faste** under hver time: spotpris med moms, elselskabets kWh-tillæg, Energinet, elafgift og nettarif, men uden fordelte månedsabonnementer.
- Den store pris er fortsat den samlede beregnede kWh-pris inklusive de faste månedsbeløb fordelt på det valgte årsforbrug.
- Service-worker-cachen er opdateret, så v7 bliver hentet på installerede enheder.


## Version 8

- Prognosefejl måles nu som forskellen mellem prognose og officiel **spotpris ekskl. moms**. Den tidligere fejlmåling lagde 25 % moms oven i forskellen og viste derfor et tal, der var 25 % højere end den rå spotprisforskel.
- Træfsikkerheden opdateres nu så snart den officielle day-ahead-pris findes; den venter ikke længere unødigt til leveringsdøgnet er afsluttet.
- Hver time viser nu også **basis**: spot inkl. moms + nettarif + Energinet + elafgift, men uden elselskabets kWh-tillæg og uden abonnementer. Det er den mest retvisende værdi at sammenligne med en rå prisvisning i fx Watts.
- “Uden faste” er basis plus elselskabets kWh-tillæg. Den store pris lægger derefter abonnementerne oveni.
- Automatisk test-workflow kontrollerer fremover kerneberegninger og prognosehistorik ved kodeændringer.


## Version 9

- Timeoversigten viser nu kun ét pristal pr. time: den beregnede **alt inklusive-pris pr. kWh**.
- Spot, basis og “uden faste” er fjernet fra selve timeoversigten for at gøre appen enkel at aflæse.
- Beregningen bagved er uændret og medregner fortsat spotpris, moms, nettarif, Energinet, elafgift, elselskabets kWh-tillæg samt faste månedlige beløb fordelt på det valgte årsforbrug.


## Version 10

- Retter en situation hvor appen kunne blive stående på “Henter de nyeste priser…” uden at komme videre, hvis pris-API'et ikke afsluttede forbindelsen.
- En prisforespørgsel afbrydes nu efter 10 sekunder. Hvis der findes gemte priser på telefonen, vises de straks som reserve i stedet for en uendelig indlæsning.
