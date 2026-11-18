# Infimalega

Il sito di Infimalega raccoglie i film, le collezioni e l’archivio dei capi, insieme alle pagine About e Contatti. Le pagine pubblicabili e tutti i loro media si trovano in `docs/`.

## Anteprima locale

Dalla radice del repository, rigenera le pagine editoriali e il catalogo con Python 3 e avvia un server locale.

```sh
python3 build.py
python3 -m http.server 4321 --directory docs
```

Apri [l’anteprima locale](http://localhost:4321/). Dopo una modifica a `catalog.json`, `editorial.json` o al generatore, esegui di nuovo `python3 build.py` e includi nel commit anche le pagine aggiornate in `docs/`.

## GitHub Pages

Nel repository GitHub apri **Settings → Pages**. In **Build and deployment** scegli **Deploy from a branch**, seleziona il ramo **main** e la cartella **/docs**, quindi premi **Save**. GitHub Pages pubblica i file già presenti in quella cartella.
