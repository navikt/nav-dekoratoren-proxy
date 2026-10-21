# nav-dekoratoren-proxy

En midlertidig transparent proxy for å teste trafikk mot dekoratøren som kjører i `navno`.
Proxyen deployes som den separate Nais-appen `nav-dekoratoren-proxy` i
`personbruker`, slik at den kan kjøre side om side med `nav-dekoratoren`. Alle
metoder, stier, spørringer, headere og responsdata videresendes til
`http://nav-dekoratoren.navno`. Ingen endepunkter valideres eller beskyttes av proxien, det gjøres i den faktiske nav-dekoratøren.


## Lokal kjøring

1. Kjør `pnpm install`.
2. Start den lokale dekoratøren på `http://localhost:8089`.
3. Kjør `pnpm run dev` for å starte proxyen på `http://localhost:9080`.
4. Pek testappens dekoratøradresse til `http://localhost:9080`. Kall videresendes
   til dekoratøren på port `8089` med samme sti og spørring.

`pnpm run dev` bruker Node sin innebygde støtte for å laste `.env` før serveren
starter. Miljøvariabler satt i terminalen har forrang. `.env` er ignorert av Git.
Start dev-serveren på nytt etter endringer i `.env`. `pnpm start` og
produksjonsoppsettet bruker fortsatt miljøvariabler uten å laste en lokal fil.

Ved lokal utvikling er administrasjonsporten `9081`, med helseendepunkter og
metrikker på blant annet `http://localhost:9081/metrics`. Produksjonsstandardene
for portene er uendret.

`pnpm test` kjører Vitest; `pnpm lint` sjekker ESLint og TypeScript.

`src/proxy.ts` setter opp proxyen og bruker hjelpere i `src/helpers` for livssyklus,
responser og feil. Proxytestene er delt etter forespørsler, responser, feil og
administrasjon; felles serveroppsett ligger i `src/test-helpers`.

Proxyen lytter på `PORT` (standard `8089`). Administrasjonsporten
`MANAGEMENT_PORT` (standard `8090`) tilbyr `/isAlive`, `/isReady` og `/metrics`.
Administrasjonsporten er ikke eksponert gjennom Service/ingress. Helsekontroller
er uavhengige av oppstrømsappen.

| Variabel                      | Standard | Formål                                                            |
| ----------------------------- | -------- | ----------------------------------------------------------------- |
| `UPSTREAM_URL`                | Påkrevd  | Oppstrøms origin uten sti, normalt `http://nav-dekoratoren.navno` |
| `PORT`                        | `8089`   | Proxyport                                                         |
| `MANAGEMENT_PORT`             | `8090`   | Administrasjon/Prometheus                                         |
| `UPSTREAM_CONNECT_TIMEOUT_MS` | `10000`  | Tilkoblingstid                                                    |
| `UPSTREAM_TIMEOUT_MS`         | `600000` | Tid til headere og inaktiv responsstrøm                           |
| `SHUTDOWN_DELAY_MS`           | `5000`   | Ventetid før tilkoblinger lukkes ved nedstenging                  |

Proxyen teller forespørsler etter kilde, rute og gyldig `teamName`. Antall
gjenværende service discovery-kall siste døgn:

```promql
sum by (team) (increase(dekoratoren_proxy_requests_total{namespace="personbruker",source="service_discovery"}[24h]))
```

Når service discovery-trafikken har vært tilnærmet null over tid og alle konsumenter
har byttet til `navno`, slettes proxyappen og HPA-en; deretter arkiveres repoet.
