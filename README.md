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


## Version 12

- Tilføjer en uafhængig backup-kørsel til prognosehistorikken.
- Backup-jobbet kører på andre klokkeslæt end hovedjobbet og bruger samme idempotente arkiveringsscript.
- Hvis GitHubs primære planlagte kørsel bliver forsinket eller springes over, får historikken flere uafhængige chancer for både at gemme en prognose før offentliggørelsen og opdatere træfsikkerheden bagefter.
- Hovedjob og backup-job deler samme concurrency-gruppe, så de ikke skriver til historikfilerne samtidig.

## Version 16

- Sammenligner prognose og officiel pris med samlet timepris inkl. moms, afgifter, tariffer og fordelte abonnementer, men ekskl. elselskabets personlige kWh-tillæg.
- For standardindstillinger er logprisen 11 øre/kWh lavere end timeprisen for samme time. Bevarer rå spotprishistorik og genberegner fejlvisning og månedsprocenter dynamisk.
- Service-worker-cache opdateret, versionsnummer v16.


## Version 17

- Dynamisk korrektion af fremtidige prognoser, separat for DK1 og DK2, baseret paa de seneste 21 afsluttede dage med data. Mindst 10 dage kraeves.
- Alle dage vaegtes ens. Den systematiske fejl daempes med 10 dages regularisering og begraenses til hoejst plus/minus 12 oere/kWh spot ekskl. moms.
- Officielle priser, tariffer, abonnementer og det personlige tillaeg aendres aldrig.
- Raaprognosen gemmes sammen med den korrigerede prognose, saa efterfoelgende kontrol af forbedringen er mulig uden selvforstaerkning.
- Appen viser den aktuelle korrektion og faar versionsnummer 17.


## Version 18 – gennemskuelig prognoselog

- Under "Prognoselog · automatisk justering" vises de senest arkiverede timeprognoser opdelt efter måldato, også før den officielle spotpris bliver tilgængelig.
- De udfoldelige daglige træfsikkerhedskort viser time for time: oprindelig prognose, automatisk justering, korrigeret prognose, officiel pris og fejl (med fortegn).
- Alle priser i tabellen er øre/kWh inklusive moms, tariffer, afgifter og fordelte faste beløb, men uden personligt kWh-tillæg.
- Ældre prognoser uden registreret justering vises med streg i justeringskolonnen. Der opfindes ikke historiske justeringer.
- Dagskort viser også om justeringen sænkede eller hævede prognosefejlen. Officielle priser forbliver uændrede.
- Cache-version opdateret til v24.

## Version 19 – samme samlede pris overalt

- Timepriser, prognoselog, historiske dagskort og månedsrapporter viser nu den samme beregnede samlede kWh-pris med spot, moms, nettariffer, afgifter, fordelte abonnementer og personligt kWh-tillæg (standard 11 øre/kWh inkl. moms).
- Tillægget lægges på én gang i hver vist pris via `totalPrice`. Prognosefejl og gennemsnitlig fejl i øre er uændrede, da samme tillæg findes på både prognosen og den officielle sammenligningspris. Månedlig procentfejl kan ændre sig, fordi referenceprisen nu inkluderer tillægget.
- De gemte rå spotpriser, den automatiske kalibrering og historiske justeringer ændres ikke. Den eksisterende log genberegnes til fælles prisvisning uden at omskrive historikken.
- Status- og hjælpetekster er opdateret, og service-worker-cachen er opgraderet til v25.


## Version 20 – genoprettelse af personligt pristillæg

- Standardprofilen DK2/Cerius/Modstrøm har stadig tillæg 11 øre/kWh inkl. moms, men gamle browserindstillinger kan overstyre det med 0 øre.
- En gammel, ellers uændret standardprofil med gemt 0 gendannes automatisk én gang til 11 øre på den pågældende enhed. Individuelt tilpassede profiler ændres ikke automatisk.
- Hvis en Modstrøm-profil stadig har 0 øre, vises en forståelig besked med en knap til at gendanne 11 øre uden at ændre de andre indstillinger. En senere manuel indstilling til 0 respekteres.
- Tomt eller null tillæg bliver ikke længere fortolket som et udtrykkeligt valg om 0 øre. Et egentligt numerisk 0 forbliver gyldigt.
- For 7, 14, 30 og 90 dages træfsikkerhed vises højst det valgte antal kalenderdage. Kendte priser for i morgen tælles ikke med i dag (rettelse af eksempelvis “8 af 7 dage”).
- Gemte spotdata og prognosekalibrering bevares uændret. Personligt tillæg inkluderes præcis én gang i både timevisning og log. Versionsnummeret er v20 og service-worker cache v26.


## Version 21 – korrekt netselskab Radius og adskilte brugerprofiler

- Officielt netområdekort fra Green Power Denmark bekræfter Radius Elnet for ejerens boligadresse. Historisk var standardprofilen forkert sat til Cerius.
- Der er nu valg mellem Radius Elnet, Cerius og brugerdefinerede tariffer. **Nye profiler bruger Radius som standard**; eksisterende profiler og abonnementer overskrives ikke.
- Radius privat C-kundetariffer pr. 1. april og 1. oktober 2026 inkl. moms (kr./kWh):
  - sommer (apr-sep): lav 0,1327 / høj 0,1991 / spids 0,5176
  - vinter (okt-mar): lav 0,1327 / høj 0,3982 / spids 1,1945.
- Kilder: https://radiuselnet.dk/priser/ og https://radiuselnet.dk/radius-haever-tarifferne/ samt tariffer fra DataHub beskrevet på https://www.priss.dk/nettariffer/791/ (gyldige fra 1. oktober 2026).
- Gamle Modstrøm-profiler i DK2, som stadig bruger Cerius, får en tydelig besked og kan vælge **Skift til Radius** med ét tryk eller **Behold Cerius**. Andre brugerindstillinger bevares. Andre reelle Cerius-brugere ændres aldrig automatisk.
- Ved DK1 skifter formularen fra både Radius og Cerius til brugerdefinerede satser, da de begge kun dækker DK2.
- Den eksisterende v20-migrering af gamle 0-tillæg understøtter fortsat både den tidligere Cerius-standard og den nye Radius-standard.
- Tarifændring betyder 3,43 øre/kWh lavere pris i dagtimerne, 10,30 øre/kWh lavere pris kl. 17-21 og 1,15 øre/kWh lavere natpris om vinteren ved ellers ens indstillinger.
- Spotpriser, prognosekalibrering, alle historiske rå data og personligt kWh-tillæg ændres ikke; eventuelle faste omkostninger og det påståede Modstrøm-tillæg skal fortsat verificeres mod aftalen. Versionsnummer v21, cache v27.
