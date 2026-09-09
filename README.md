# Prisma Informatica — negozio di app per Umbrel

Questo repository è il **negozio comunitario** di Prisma Informatica per
umbrelOS. Oggi contiene un'app sola: **Aurora**, il server del CRM
(`prisma-aurora/`).

## Installazione per il cliente — 10 passaggi

1. Apri **App Store** in umbrelOS.
2. Premi **⋯ › Community App Store**.
3. Incolla `https://github.com/RobyCek/aurora-umbrel-store` nel campo URL.
4. Premi **Aggiungi** e apri il negozio «Prisma Informatica».
5. Apri **Aurora** e premi **Installa**.
6. Dalla Home di Umbrel apri Aurora e verifica **Il database risponde**.
7. Se parti senza dati, crea il primo utente amministratore; se arrivi da
   Aurora cloud, chiedi prima a Prisma il trasferimento del database.
8. Installa Tailscale su Umbrel e sui dispositivi che useranno Aurora.
9. In Aurora scegli **Impostazioni › Server › Il mio server**, inserisci
   l'indirizzo Tailscale dell'Umbrel con porta `2960`, poi **Prova il
   collegamento › Usa questo server**.
10. Accedi e prova dal telefono anche con il Wi-Fi spento.

Usa sempre lo stesso indirizzo Tailscale, anche in casa: alternarlo con
`umbrel.local` fa riscaricare il mirror locale. Non disinstallare Aurora per
risolvere un problema di collegamento, perché la disinstallazione coinvolge i
dati dell'app; contatta prima Prisma Informatica.

I dati stanno in `app-data/prisma-aurora/data/db` (il database),
`app-data/prisma-aurora/data/backup` (un backup ogni notte alle 02:00, ne
restano trenta) e `app-data/prisma-aurora/data/ollama` (il modello locale):
tutti rientrano nei backup di umbrelOS. Al primo avvio il modello viene
scaricato automaticamente; sono diversi gigabyte e puo' richiedere alcuni
minuti. Da quel momento iPhone e iPad usano l'Intelligenza di Umbrel senza
lasciare Aurora aperta sul Mac.

Per la Posta Google, Aurora Server legge facoltativamente
`app-data/prisma-aurora/data/config/google_oauth.env`. Il file resta nei dati
persistenti anche quando l'app viene aggiornata e deve essere leggibile solo
da root (`600`). Contiene, senza virgolette:

    GOOGLE_OAUTH_CLIENT_ID=…apps.googleusercontent.com
    GOOGLE_OAUTH_CLIENT_SECRET=…

Sono le credenziali OAuth dell'applicazione Aurora, non la password Gmail
dell'utente. Non vanno inserite nel repository né mostrate nei log.

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
