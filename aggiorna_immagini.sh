#!/usr/bin/env bash
# FISSA LE IMMAGINI CON IL LORO DIGEST — 05/09/2026, Tappa 3 del server casalingo.
#
# Umbrel vuole ogni immagine scritta come `registro/repo:tag@sha256:…`: il
# tag dice la versione a una persona, il digest la inchioda per Docker. Questo
# script chiede al registro il digest delle immagini scritte nel compose
# dell'app e riscrive le righe `image:` con quello giusto. Serve Docker: sul
# Mac non c'è, sull'Umbrel sì — vedi «Per chi pubblica» nel README.md.
#
# Si usa in due momenti:
#   - la prima volta, per riempire il segnaposto DA_COMPILARE;
#   - a ogni nuova versione di Aurora: prima si cambia il numero nel compose
#     (e `version` in umbrel-app.yml), poi si lancia questo, poi commit e push.
#
#     cd /Users/robycek/aurora-umbrel-store
#     ./aggiorna_immagini.sh
set -euo pipefail

qui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose="${qui}/prisma-aurora/docker-compose.yml"

# Sul Mac di Roberto Docker non c'è (05/09/2026): si lancia sull'Umbrel, dove
# `docker` vuole `sudo`. Il comando è quindi `docker` se funziona così, altrimenti
# `sudo docker`. Senza nessuno dei due ci si ferma.
if docker info >/dev/null 2>&1; then
  DOCKER="docker"
elif command -v docker >/dev/null 2>&1; then
  DOCKER="sudo docker"
else
  echo "Serve Docker: sul Mac non c'è. Copia la cartella sull'Umbrel e lancia lo script lì (vedi README.md)." >&2
  exit 1
fi

# Le immagini scritte nel compose, senza il digest, una per riga, senza doppioni.
immagini="$(sed -n 's/^ *image: *\([^@ ]*\).*/\1/p' "${compose}" | sort -u)"
if [[ -z "${immagini}" ]]; then
  echo "Nessuna riga image: trovata in ${compose}" >&2
  exit 1
fi

tmp="$(mktemp)"
cp "${compose}" "${tmp}"

while IFS= read -r immagine; do
  [[ -z "${immagine}" ]] && continue
  echo "→ ${immagine}"
  # Il digest dell'INDICE (multi-arch se c'è), non di una sola architettura:
  # è quello che Umbrel vuole accanto al tag.
  digest="$(${DOCKER} buildx imagetools inspect "${immagine}" --format '{{.Manifest.Digest}}')"
  if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "  digest non riconosciuto: '${digest}'" >&2
    rm -f "${tmp}"
    exit 1
  fi
  piattaforme="$(${DOCKER} buildx imagetools inspect "${immagine}" --format '{{range .Manifest.Manifests}}{{if .Platform}}{{if ne .Platform.OS "unknown"}}{{.Platform.OS}}/{{.Platform.Architecture}} {{end}}{{end}}{{end}}')"
  echo "  ${digest}"
  echo "  piattaforme: ${piattaforme:-(immagine singola: quella di questo computer)}"
  # Riscrive ogni riga `image: <immagine>` o `image: <immagine>@sha256:…`.
  sed -i.bak -E "s#^( *image: *)$(printf '%s' "${immagine}" | sed 's/[.[\*^$/]/\\&/g')(@[^ ]*)?#\1${immagine}@${digest}#" "${tmp}"
  rm -f "${tmp}.bak"
done <<< "${immagini}"

if cmp -s "${compose}" "${tmp}"; then
  echo "Il compose era già aggiornato."
  rm -f "${tmp}"
else
  mv "${tmp}" "${compose}"
  echo "Aggiornato ${compose}:"
  grep -n '^ *image:' "${compose}"
fi
