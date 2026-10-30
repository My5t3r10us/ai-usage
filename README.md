# ai-usage

Dashboard local qui calcule l'usage de **Claude Code**, **Codex CLI** et **Cursor** sur ton PC, avec estimation des coûts (équivalent API + rentabilité des abonnements).

100 % local : zéro dépendance, le serveur n'écoute que sur `127.0.0.1`, rien n'est envoyé nulle part.

## Lancer

```bash
node ai-usage.mjs          # ou double-clic sur start.cmd (Windows)
```

→ ouvre `http://127.0.0.1:4321`. Node **≥ 22.5** requis (`node:sqlite` pour lire Cursor).

| Option | Effet |
|---|---|
| `--port 5000` | autre port |
| `--no-open` | ne pas ouvrir le navigateur |
| `--no-wsl` | ne pas scanner les distros WSL en cours d'exécution |
| `--rescan` | ignorer le cache de parsing |
| `--json out.json` | exporter le dataset et quitter |

Raccourcis : `R` re-scan · `T` thème · `/` recherche · `1`–`7` périodes. Double-clic sur un outil = l'afficher seul. Clic sur un projet / modèle = filtre.

## Sources lues (lecture seule)

| Outil | Emplacement | Contenu |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` (+ `CLAUDE_CONFIG_DIR`, `~/.config/claude`, WSL) | usage exact par message : input, cache write 5m/1h, cache read, output, recherches web. Dédupliqué par `message.id + requestId`. |
| Codex CLI | `~/.codex/sessions/**`, `archived_sessions/**` (+ `CODEX_HOME`, WSL) | événements `token_count` (input, cached, output, reasoning) + dernier relevé des limites 5h / hebdo. |
| Cursor | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` + `workspaceStorage` | conversations, messages, modèles, lignes +/−, tokens *quand Cursor les stocke*. |
| Cursor (exact) | `data/imports/cursor/*.csv` | export CSV de cursor.com/dashboard → Usage, importable par glisser-déposer dans le dashboard. Remplace l'estimation locale sur sa période. |

## Coûts

- **Équivalent API** = tokens × grille tarifaire (éditable dans le dashboard, sauvegardée dans `data/settings.json`). Règles regex sur un nom canonique (`claude-opus-4.5`, `gpt-5.3-codex`…), la première qui matche gagne.
- **Abonnements** : choisis ton plan par outil → valeur/prix du mois, projection fin de mois, cumul vs prorata, historique 6 mois.
- **Temps actif** : somme des écarts < 15 min entre messages d'une session (`idleGapMinutes` dans `ai-usage.config.json`).

## Config optionnelle — `ai-usage.config.json`

```json
{ "claudeDirs": ["D:/autre/.claude"], "codexDirs": [], "cursorUserDir": "", "wsl": true, "idleGapMinutes": 15 }
```

## Limites connues

- Cursor ne garde pas tous les compteurs de tokens en local → sans import CSV, le coût Cursor est une estimation basse.
- Les sessions Claude Code supprimées (nettoyage auto après 30 jours par défaut, réglage `cleanupPeriodDays`) ne sont plus comptées. Augmente `cleanupPeriodDays` dans `~/.claude/settings.json` pour garder l'historique.
