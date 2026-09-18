# 06 — Budgets, retries, anti-boucle

Aucune pipeline ne tourne sans les trois plafonds : coût par run, timeout par run, tentatives par
ticket. Ils sont lus par les scripts depuis les variables du repo `game-factory` (`GF_*`), avec les
défauts ci-dessous. Un `PROMPT.md` peut les abaisser, jamais les relever.

## Par pipeline

| Pipeline | Runner / modèle par défaut | Coût max / run | Timeout | Tentatives max / ticket | Coût max / ticket |
| --- | --- | --- | --- | --- | --- |
| Concept | llm · local (Ollama) puis Sonnet | 0,50 $ | 5 min | 1 | 0,50 $ |
| Bootstrap | script · llm local pour slug/package | 0,10 $ | 10 min | 2 | 0,20 $ |
| Spec | claude-code read-only · Sonnet | 5 $ | 30 min | 2 | 10 $ |
| Triage | llm · local | 0,05 $ | 2 min | 2 | 0,10 $ |
| Dev | claude-code · Sonnet (Opus si `priority:high` et gameplay) | 10 $ | 45 min | 3 | 30 $ |
| Review + autofix | claude-code · Sonnet | 6 $ | 30 min | 3 passes de review par PR | 18 $ |
| Build | script | 0 | 30 min | 2 | 0 |
| QA | claude-code read-only · Sonnet | 8 $ | 45 min | 1 par build | 8 $ |
| Assets | claude-code · Sonnet + Blender | 6 $ | 30 min | 3 rendus, puis placeholder | 18 $ |

Phase 1 (interactif, abonnement) : les coûts sont 0 et les tentatives comptent quand même — la
mécanique doit être exercée avant d'être payée.

Phase 2 : clé API dédiée, workspace Anthropic `game-factory` avec limite mensuelle dure côté console
(`GF_MONTHLY_CAP_USD`, 100 $ pour commencer). Le scan lit la dépense du mois dans les traces `gf:run`
(somme des `cost_usd` sur tous les repos de l'org) et refuse de prendre un ticket au-delà de 90 % du
plafond : la console est le filet, GitHub est le contrôle.

## Anti-boucle

Cinq mécanismes indépendants ; un seul suffit à arrêter une boucle, tous doivent être présents.

1. **Trace anti-rejeu** (`01-board.md`) : une étape tracée n'est pas rejouée. Une review sur le même SHA
   n'est jamais refaite.
2. **Compteur par ticket** : tentatives = nombre de `gf:run` de cette pipeline sur ce ticket. Au-delà :
   `needs-human`, commentaire avec les raisons des échecs précédents, et la chaîne passe au suivant.
3. **Passes de review** : Review + autofix compte ses `gf:review` sur la PR. Trois passes sans verdict OK
   → `needs-human`, la PR reste ouverte avec l'historique des remarques.
4. **Plafond dur du CLI** (`--max-budget-usd`) et timeout tués par le script, pas demandés à l'agent.
   Un run coupé compte comme une tentative.
5. **Kill switch** : variable `GF_ENABLED=false` sur `game-factory` → tous les scans sortent immédiatement,
   effet au prochain scan, sans redéploiement. Par repo : label `factory:paused` sur l'issue épinglée
   du jeu → ce jeu est ignoré.

Plus une cadence : `GF_COOLDOWN_MIN` (5) entre deux prises de ticket, toutes pipelines confondues, lue
dans les revendications récentes sur GitHub. `0` désactive en phase 1.

## Ce qui ne consomme rien

Un scan à vide : quelques appels API GitHub. Build, Bootstrap, les workflows déterministes : zéro appel
modèle. Triage et Concept en local : zéro. C'est ce qui permet de laisser tourner l'usine sans jeu en
cours sans coût.

## Ce qu'on log

Chaque `gf:run` porte `cost_usd`, `turns`, `duration_s`, `model`. Le dashboard sur la VM est un script
qui agrège ces balises par jeu, par pipeline, par semaine. Rien d'autre à maintenir : si le dashboard
tombe, GitHub a tout.
