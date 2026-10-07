# nav-dekoratoren-proxy

En midlertidig, transparent proxy som lar apper i `personbruker` fortsette å kalle
`nav-dekoratoren.personbruker` mens dekoratøren flyttes til `navno`. Alle metoder,
stier, spørringer, headere og responsdata videresendes til
`http://nav-dekoratoren.navno`. Ingen endepunkter tolkes eller omskrives av proxyen.

**Viktig:** Deploy av denne appen erstatter den eksisterende `nav-dekoratoren` i
`personbruker`. Bruk kun manuell deploy med bekreftelse som del av en planlagt
cutover, først i dev-stable og deretter i prod. Den egentlige dekoratøren må allerede
være tilgjengelig i `navno`; ved tilbakeføring må den gamle appen deployes igjen.

## Lokal kjøring

Krever Node 24 og pnpm 11. Kjør `pnpm install`, `pnpm build`, og
`UPSTREAM_URL=http://localhost:8088 pnpm start`. `pnpm test` kjører Vitest;
`pnpm lint` sjekker ESLint og TypeScript.

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
