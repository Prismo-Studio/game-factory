# Capacite : combien de runners

Un runner traite un ticket a la fois. Deux runners sur une vingtaine de tickets, ca se compte
en heures. Le seul levier reel pour aller plus vite est d en ajouter un — a condition que la
machine puisse reellement le nourrir.

## Le prealable que tout le monde rate : .wslconfig

Sur Windows, Docker Desktop tourne dans WSL2, et **WSL2 se limite par defaut a la moitie de la
RAM de la machine**. Sur 32 Go, Docker ne voit donc que 16 Go, quoi qu on ecrive dans le
compose. Avec deux runners a 6 Go et Ollama a 9 Go, on est deja au-dessus : les conteneurs se
font tuer par manque de memoire (code de sortie 137), ce qui ressemble a un run qui echoue sans
raison.

Creer ou editer `C:\Users\<toi>\.wslconfig` :

```ini
[wsl2]
memory=24GB
processors=8
swap=8GB
```

Puis, dans PowerShell :

```
wsl --shutdown
```

et relancer Docker Desktop. Verification : `docker info | findstr Memory` doit annoncer environ
24 Go, pas 16.

Laisser au moins 8 Go a Windows. Ne pas mettre `memory=32GB`.

## Demarrer le troisieme runner

```
cd C:\Users\Asuki\game_factory\game-factory\docker
docker compose --profile tri up -d
```

Il s enregistre tout seul sous `<GF_RUNNER_NAME>-3`. Pour l arreter :
`docker compose --profile tri stop runner-3`.

## Budget memoire vise sur 32 Go

| Service   | Limite | Remarque                                           |
|-----------|--------|----------------------------------------------------|
| runner    | 6 Go   | export Android et tests Godot, le plus gourmand     |
| runner-2  | 6 Go   |                                                     |
| runner-3  | 5 Go   | profil `tri`, a la demande                          |
| ollama    | 9 Go   | qwen2.5:14b quantise ; seul le triage l utilise     |
| heartbeat | 256 Mo |                                                     |

Total 26,25 Go de plafonds pour 24 Go accordes a WSL2. Ce n est pas un probleme : `mem_limit`
est un plafond, pas une reservation, et les quatre services ne culminent jamais ensemble
(Ollama ne consomme qu au moment ou le triage tourne, quelques secondes par ticket).

## Le vrai plafond est souvent le processeur

Chaque runner a `cpus: 4` (3 pour le troisieme), soit 11 coeurs demandes. Sur un processeur a 8
coeurs logiques, un troisieme runner ne fait plus gagner grand-chose : les trois se partagent
les memes coeurs et chaque run ralentit. Compter les coeurs avant d ajouter :
`echo %NUMBER_OF_PROCESSORS%`. En dessous de 12, rester a deux runners.

## Avant d ajouter un runner, verifier que la file est vraiment pleine de travail

Le battement de coeur reveille toutes les pipelines a intervalle fixe. La plupart de ces runs ne
trouvent rien et se terminent en quelques dizaines de secondes, mais ils occupent un runner et
passent devant les vrais travaux. Si la file est longue mais que les runs se terminent en moins
d une minute, ce n est pas un manque de capacite : c est le battement de coeur qui est trop
rapide. Augmenter `GF_HEARTBEAT_EVERY_S` (1800 s est un bon reglage) avant d ajouter du materiel.
