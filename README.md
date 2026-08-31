# Elpris – næste 4 døgn

En mobilvenlig webapp, som viser 96 timers elpriser for valgfrit DK1 eller DK2. Offentliggjorte day-ahead-priser suppleres med en tydeligt mærket statistisk prognose for resten af perioden.

## Det viser siden

- Præcis 96 timer opdelt i fire blokke á 24 timer.
- Valg mellem DK1 (Vestdanmark) og DK2 (Østdanmark).
- Officielle områdepriser fra Energi Data Service, aggregeret fra kvarter til timer.
- Vejr- og historikbaseret ML-prognose for de resterende timer via elpriser.org.
- Personlige indstillinger for netselskab, elselskab, elaftale, tillæg, abonnementer og årsforbrug.
- Samlet pris inklusive spotpris, transport, moms, afgifter, tillæg og faste abonnementer.
- Bedste sammenhængende 3-timers ladevindue og dyreste time i hvert døgn.
- Gul, grøn og rød timevisning med de tre dyreste timer tydeligt markeret.
- Alle fire døgn er sammenklappet ved åbning og kan foldes ud time for time.
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
