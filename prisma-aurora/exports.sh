# I SEGRETI DELL'APP AURORA SU UMBREL — 05/09/2026, Tappa 3 del server casalingo.
#
# Questo file lo legge Umbrel (con `source`) ogni volta che installa, avvia o
# aggiorna l'app: non è uno script da lanciare, e per questo non ha né shebang
# né `exit`.
#
# `derive_entropy` è la funzione di Umbrel che ricava un valore stabile dal
# seme del dispositivo e da un'etichetta: lo stesso Umbrel con la stessa
# etichetta dà sempre lo stesso valore, a ogni riavvio e a ogni aggiornamento;
# due Umbrel diversi danno valori diversi. Così ogni installazione ha la sua
# password del database e le chiavi applicative, senza che nessuno le scriva
# a mano e senza che compaiano in un file. Ogni mestiere ha un'etichetta
# diversa: la chiave JWT può così essere ruotata senza rendere illeggibili i
# segreti persistenti cifrati con SECRET_KEY.
#
# `app_entropy_identifier` vale «app-prisma-aurora-seed»: lo fornisce Umbrel.

export APP_PRISMA_AURORA_POSTGRES_PASSWORD="$(derive_entropy "${app_entropy_identifier}-postgres-password")"
export APP_PRISMA_AURORA_SECRET_KEY="$(derive_entropy "${app_entropy_identifier}-secret-key")"
export APP_PRISMA_AURORA_JWT_SIGNING_KEY="$(derive_entropy "${app_entropy_identifier}-jwt-signing-key")"
