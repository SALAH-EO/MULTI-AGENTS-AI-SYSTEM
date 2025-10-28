
# Execution Environnement OFFZONE-AGENTS Complet

Système avec :
- notre platforme Nextjs dans localhost:3002
- Platforme n8n dans localhost:5678
- Ollama , Mongodb , Redis tout installé


## Installation

### Mis en place des credentiels
**accéder à _OFFZONE-AGENTS_**

- changer **GOOGLE_API_KEY** et **GOOGLE_CSE_ID** dans **.env** 

**accéder à _system-agents_**
- changer **N8N_API_KEY** par le votre dans **.env**

**accéder à _OFFZONE-AGENTS/shared/python-scripts_**

- remplacer **google_sheet_credentials.json** par le votre
- Mis en place les paramètres de **parameters.py**


### Execution du Conteneur

```bash
  git clone https://github.com/OffzoneMA/AgentAI.git
```

**accéder au dossier _OFFZONE-AGENTS_**

```bash
  docker build -t n8n-python .
```
```bash
  docker compose --profile cpu up --build
```
## Execution

accéder à **localhost:5678** :
- Créer un Compte
- Mis en place les credentiels Slack , Zendesk et Google
- copier l'API n8n pour l'utiliser dans les fichiers d'environnement . ( Recomposer l'environnement )

accéder à **localhost:3002** 
- 

## Test 
Tester **Login** avec ces données admin :
- Email : admin@example.com 
- password : 12345678

## Components Platforme 

* Suivi des données entrant des agents en temp réel
* Suivi des données et histoire des executions
* Suivi du performance des agents
* Admin peut ajouter et supprimer des utilisateurs **localhost:3002/admin**
* Admin peut donner ou supprimer accès des utilisateurs aux certains agents par choix
* Chat avec les agents conversationnels : **localhost:3002/agents**



