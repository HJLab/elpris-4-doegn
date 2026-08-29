# Elpris – næste 4 døgn

En mobilvenlig webapp til Henning, som viser 96 timers DK2-elpriser. Offentliggjorte day-ahead-priser suppleres med en tydeligt mærket statistisk prognose for resten af perioden.

## Det viser siden

- Præcis 96 timer opdelt i fire blokke á 24 timer.
- Officielle DK2-priser fra Energi Data Service, aggregeret fra kvarter til timer.
- Statistisk prognose baseret på de seneste otte ugers DK2-priser.
- Variabel samlet pris inklusive moms, Modstrøms tillæg, Cerius nettarif, Energinet-tarif og elafgift.
- Tre billigste og tre dyreste timer i hvert døgn.
- Bedste sammenhængende 3-timers ladevindue.
- Automatisk opdatering hver time og lokal cache ved midlertidige netfejl.
- Kan installeres som webapp på PC, Android-telefon og Samsung-tablet.

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

Energi Data Service: `DayAheadPrices`, prisområde `DK2`.
