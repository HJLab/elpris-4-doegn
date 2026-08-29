# Elpris – næste 4 døgn

En mobilvenlig webapp til Henning, som viser 96 timers DK2-elpriser. Offentliggjorte day-ahead-priser suppleres med en tydeligt mærket statistisk prognose for resten af perioden.

## Det viser siden

- Præcis 96 timer opdelt i fire blokke á 24 timer.
- Officielle DK2-priser fra Energi Data Service, aggregeret fra kvarter til timer.
- Vejr- og historikbaseret ML-prognose for de resterende timer via elpriser.org.
- Variabel samlet pris inklusive moms, Modstrøms tillæg, Cerius nettarif, Energinet-tarif og elafgift.
- Bedste sammenhængende 3-timers ladevindue og dyreste time i hvert døgn.
- Gul, grøn og rød timevisning med de tre dyreste timer tydeligt markeret.
- Alle fire døgn er sammenklappet ved åbning og kan foldes ud time for time.
- Automatisk opdatering hver time og lokal cache ved midlertidige netfejl.
- Kan installeres som webapp på PC, Android-telefon og Samsung-tablet.
- Har særskilt appikon og fuldskærmsvisning på både iPhone og Android.

## Vigtigt om den samlede pris

Faste abonnementer er ikke medregnet, fordi de ikke ændrer rangeringen af timerne. Modstrøms tillæg er sat til 11 øre/kWh inklusive moms ud fra den oplyste aftale. Kontrollér senere en Modstrøm-regning, så vi kan sikre, om de 11 øre står inklusive eller eksklusive moms.

## Lokal prøve på Windows

Åbn ikke kun `index.html` direkte, da browseren kan blokere datahentning. Start i stedet en lille lokal webserver fra mappen. Hvis Python er installeret:

```powershell
py -m http.server 8080
```

Åbn derefter `http://localhost:8080` i Chrome eller Edge.

## Gratis offentliggørelse

Mappen kan offentliggøres gratis med GitHub Pages. Når siden er lagt på nettet, bruges den samme adresse på alle enheder. Følg den trin-for-trin-vejledning, som gives sammen med projektet.

## Datakilde

Officielle priser stammer fra Energi Data Service. Browservenlige pris- og prognosedata leveres via det åbne, CORS-aktiverede API hos elpriser.org, prisområde `DK2`.
