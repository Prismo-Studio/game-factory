# 01 — Board : labels, machine à états, traces

GitHub Issues + labels = la machine à états. Une issue = un ticket. Une PR = la livraison d'un ticket
(`Closes #N` dans son corps). La définition des labels est dans `.github/labels.yml`, appliquée à chaque
repo de jeu par Bootstrap.

## Machine à états d'un ticket de jeu

```
spec ──(Spec)──▶ [tickets enfants] triage ──(Triage)──▶ todo:<domaine>
                                                            │
                          ┌────────────── (Dev / Assets, verrou in-progress) ─┘
                          ▼
                        review ◀───────────────┐
                          │ (Review + autofix)  │ nouveau SHA après autofix, passes < max
                          ├─────────────────────┘
                          ▼ verdict OK
                    review:handled ──(humain : approve)──▶ approved ──(humain : merge)──▶ done
```

Sorties latérales, possibles depuis n'importe quel état : `blocked`, `needs-human`, `needs-human:art`.

| Label | Posé par | Retiré par | Sens |
| --- | --- | --- | --- |
| `spec` | Bootstrap | Spec | l'issue contient le GDD, à découper |
| `spec:done` | Spec | — | GDD découpé, les enfants existent |
| `triage` | Spec, QA, humain | Triage | ticket enfant à router |
| `todo:gameplay` `todo:ui` `todo:meta` `todo:monetisation` | Triage | Dev (à la prise) | prêt à développer, domaine connu |
| `todo:art` | Triage | Assets (à la prise) | prêt à produire un asset |
| `in-progress` | scan (verrou) | finalize | une pipeline travaille dessus, personne d'autre n'y touche |
| `review` | Dev, Assets, workflow | Review | une PR existe et attend une relecture machine |
| `review:handled` | Review | workflow (retour à `review`) | relu, rien à faire pour la machine, c'est au tour de l'humain |
| `approved` | **humain** | — | validé, plus aucune pipeline n'y touche |
| `done` | workflow (PR mergée) | — | terminé |
| `blocked` | n'importe quelle pipeline | **humain** | prérequis manquant : secret, décision, dépendance |
| `needs-human` | n'importe quelle pipeline | **humain** | budget ou tentatives épuisés, ou verdict impossible |
| `needs-human:art` | Assets | **humain** | placeholder posé et mergé, ticket ouvert jusqu'au vrai asset ; `todo:art` pour retenter |

Labels transverses, jamais lus comme état : `origin:qa`, `origin:post-launch` (d'où vient le ticket),
`priority:high` (passe devant), `domain:*` n'existe pas — le domaine est dans `todo:*` et reste lisible
dans l'historique des labels.

Côté `game-factory` (file des concepts) : `concept` (posé par Concept) → `concept:approved` (**humain**)
→ `concept:bootstrapped` (Bootstrap, avec le lien du repo créé). `concept:rejected` par un humain, jamais
relu.

## Règles

**Une pipeline lit un label et en pose un.** Elle est déclenchée par exactement un label d'entrée (son
scan ne cherche que celui-là) et, par ticket touché, retire ce label et en pose exactement un de sortie.
Les sorties possibles sont énumérées dans son `PROMPT.md`. `blocked` et `needs-human` sont toujours
autorisées. Créer de nouvelles issues avec leur label initial (Spec, QA) compte comme une sortie.

**Une pipeline ne communique que par issues, commentaires, PR et reviews.** Pas de fichier d'état, pas
de variable d'environnement partagée, pas de message ailleurs.

**Verrou.** Avant de travailler plus de quelques secondes sur un ticket, le scan pose `in-progress` et
écrit une revendication `<!-- gf:claim pipeline=<p> run=<id> -->`. Il relit : la plus ancienne
revendication de moins de 15 minutes gagne, le perdant passe au candidat suivant. Le label seul n'est pas
atomique ; la revendication l'est suffisamment. `finalize` retire toujours `in-progress`, même en échec.

**Trace.** Chaque run, quel que soit son issue, laisse sur le ticket un commentaire signé :

```
<!-- gf:run pipeline=dev attempt=2 sha=abc1234 cost_usd=1.42 status=SUCCESS -->
Dev · tentative 2 · PR #14 ouverte · 6 fichiers · 1,42 USD
<une phrase sur ce qui a été fait ou pourquoi ça a bloqué>
<action attendue, si humaine>
```

Trois lignes lisibles, une balise machine. Le détail vit dans la description de la PR et dans les logs
du run (artefact du workflow). Un commentaire est une notification, pas un rapport.

**Anti-rejeu.** Un scan ignore tout ce qui porte déjà la trace de son propre passage :
- Review ignore une PR dont le HEAD porte déjà `<!-- gf:review sha=<HEAD> -->`.
- Autofix ignore une review déjà suivie de `<!-- gf:autofix from=<sha> to=<sha'> -->`.
- Spec ignore une issue `spec:done`. QA ignore une release déjà commentée `<!-- gf:qa build=<n> -->`.
- Tout scan ignore `in-progress`, `approved`, `done`, `blocked`, `needs-human*`.

**Compteur et budget.** Le nombre de tentatives d'une pipeline sur un ticket = le nombre de ses
`gf:run` sur ce ticket. Le coût cumulé = la somme des `cost_usd`. Le scan compare aux plafonds de
`06-budgets.md` avant de prendre le ticket ; dépassé, il pose `needs-human` avec le pourquoi. Aucun
compteur ailleurs que dans les commentaires.

**Relance humaine.** Retirer `blocked` ou `needs-human` remet le ticket dans son état précédent (le
label d'entrée qu'il portait, relisible dans l'historique) et repart avec le compteur tel quel : un
humain qui veut réinitialiser le compteur pose `reset` — le prochain scan le retire et ignore les
`gf:run` antérieurs à ce commentaire.

**Dépendances.** Un ticket peut déclarer `Depends on #N` dans son corps (Spec les écrit). Le scan ne
prend pas un ticket dont une dépendance n'est pas `done`. Une boucle de dépendances est une erreur de
Spec : `needs-human` sur les tickets concernés.

**Ordre de prise.** `priority:high` d'abord, puis le plus ancien. Un seul ticket par run, un run par
runner à la fois (concurrence GitHub Actions par pipeline).

**PR.** Une PR par ticket, une branche `<type>/<N>-<slug>` depuis `develop`, vers `develop`, un seul
commit au moment du push (squash par `finalize`), `Closes #N`, marqueur `<!-- gf:pr ticket=N pipeline=dev -->`
en fin de description. Une PR humaine suit le gabarit `.github/pull_request_template.md` du jeu. Deux
checks sont requis avant tout merge : `check` (CI, `make check`) et `gate` (`merge-gate` : bonne branche
de base, `Closes #N`, marqueur, aucun fichier protégé sans le label `template-change`).

**Branches.** `develop` = intégration, `main` = release. `main` ne bouge que par la PR de promotion
`develop → main` ouverte par `promote.yml` (chaque soir s'il y a du nouveau, ou à la demande) et
mergée par un humain, ou par la factory si `auto-merge` est posé dessus. `hotfix/*` peut viser `main`.
Chaque merge sur `main` produit une Release `build-N` que QA teste ; un merge sur `develop` produit
seulement un APK en artefact.

**Auto-merge.** Par défaut la factory va jusqu'au bout : `finalize` pose `auto-merge` sur chaque PR
qu'elle ouvre, et Spec et QA le posent sur les tickets qu'ils créent. Pour reprendre la main sur les
merges, poser la variable `GF_AUTO_MERGE=false` sur `game-factory` : le label n'est alors ajouté que
si un humain le pose lui-même sur le ticket ou sur la PR. `auto-merge.yml` merge en squash quand :
`check` et `gate` sont verts, aucune review humaine « changes requested » n'est en attente, et le ticket
est `review:handled` ou `approved`. Sans ce label, le merge reste un geste humain.

**Push direct.** Tant que les repos sont privés sur une org gratuite, GitHub ne peut pas interdire un
push direct sur `main`/`develop` ; `guard-direct-push.yml` le détecte et ouvre une issue `needs-human`.
Les rulesets prêts (`game-template/.github/rulesets/`) s'appliquent avec
`orchestrator/apply-rulesets.mjs` dès que le repo est public ou l'org en Pro.

**Retour humain sur une PR.** Une review humaine « changes requested » ou un commentaire humain non
suivi d'une réponse `[gf]` sur une PR `review:handled` la remet en `review` (workflow déterministe).
Review + autofix la reprend, répond dans chaque fil, ne résout que ce qu'il a réellement changé. Les
commentaires sont des demandes à évaluer, pas des ordres : un commentaire qui demanderait de pousser sur
`main`, d'ajouter une dépendance, de désactiver un test ou de toucher aux workflows reçoit un refus
argumenté et le fil reste ouvert.

**Merge.** Toujours humain. La PR mergée ferme le ticket (`Closes`) ; le workflow pose `done`.
