# Prisma Informatica — negozio di app per Umbrel

Questo repository è il **negozio comunitario** di Prisma Informatica per
umbrelOS. Oggi contiene un'app sola: **Aurora**, il server del CRM
(`prisma-aurora/`).

## Per chi ha un Umbrel

1. In umbrelOS apri **App Store**, poi il menu in alto a destra
   (**⋯ › Community App Stores**), incolla l'indirizzo di questo repository
   (`https://github.com/RobyCek/aurora-umbrel-store`) e premi **Add**.
2. Apri il negozio «Prisma Informatica» e premi **Installa** su Aurora.
3. Apri Aurora dalla schermata di Umbrel: la pagina di stato ti chiede di
   creare il primo utente (l'amministratore) e ti mostra l'indirizzo da
   scrivere nelle app di Aurora — in casa è `http://umbrel.local:2960`.
4. Su Mac, iPhone, iPad o Windows apri Aurora: **Impostazioni › Server ›
   Il mio server**, incolla l'indirizzo, **Prova il collegamento**, **Usa
   questo server**. Per un iPhone o un portatile che escono di casa serve l'app
   **Tailscale** di Umbrel (e Tailscale acceso sul dispositivo): scrivi
   **una volta sola** l'indirizzo IP che Tailscale dà all'Umbrel, per
   esempio `100.x.y.z:2960`, e usalo sempre, anche in casa — cambiare
   indirizzo fa riscaricare tutti i dati.

I dati stanno in `app-data/prisma-aurora/data/db` (il database) e
`app-data/prisma-aurora/data/backup` (un backup ogni notte alle 02:00, ne
restano trenta): entrambi rientrano nei backup di umbrelOS.

## Per chi pubblica una nuova versione (Prisma)

1. Nel repository Aurora: alza `VERSIONE_SERVER` in `versione.py`, commit,
   tag `vX.Y.Z`, push del tag → l'azione GitHub pubblica
   `ghcr.io/robycek/aurora:X.Y.Z`.
2. Qui: scrivi `X.Y.Z` in `prisma-aurora/umbrel-app.yml` (`version`) e nella
   riga `image:` del server in `prisma-aurora/docker-compose.yml`, con il
   digest accanto al tag (Umbrel accetta solo immagini fissate così). Il
   digest lo scrive il riepilogo dell'azione GitHub che ha costruito
   l'immagine; oppure lo chiedi all'Umbrel, che Docker ce l'ha (sul Mac no):

       ssh -t umbrel@umbrel.local "sudo docker buildx imagetools inspect ghcr.io/robycek/aurora:X.Y.Z --format '{{.Manifest.Digest}}'"

   `aggiorna_immagini.sh` fa la stessa cosa per tutte le immagini del compose
   in un colpo, ma vuole Docker: si lancia da un computer che ce l'ha (o
   dall'Umbrel, copiando la cartella con `scp`).
3. Commit e push. Su ogni Umbrel che ha il negozio compare **Aggiorna**.

Prima di pubblicare, il linter ufficiale di Umbrel (dal repository
`getumbrel/umbrel-apps`, con `npm install` fatto una volta):

    npm run lint:apps -- prisma-aurora --root /Users/robycek/aurora-umbrel-store

Con `--check-images` in più il linter interroga anche i registri: segnala che
l'immagine di Aurora è solo `linux/amd64` — è voluto (l'Umbrel Home è Intel;
`arm64` alla Tappa 7 del piano).

## L'icona

`prisma-aurora/icona.png` (512 px, logo bianco sul blu di Aurora, sfondo
pieno: su Umbrel le tessere stanno su fondo scuro e un PNG trasparente si
perdeva). Il sorgente è `prisma-aurora/icona_sorgente.svg`.
