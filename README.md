# Candidatures - The Face of Congo

L’application utilise Node.js, Express, MySQL et Cloudinary. Le formulaire est servi dans `index.html`; le tableau d’administration est disponible sur `/admin`.

## Prérequis

- Node.js 20 ou plus récent.
- MySQL 8 ou plus récent, ou Docker avec Docker Compose.
- Un compte Cloudinary pour les photos.
- HTTPS en production.

## Lancement local avec Docker

Dans PowerShell, depuis ce dossier :

```powershell
Copy-Item .env.example .env
```

Modifiez `.env` avec des mots de passe distincts pour MySQL, l’administrateur et `SESSION_SECRET`. Générez une clé de session avec `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Ne publiez jamais `.env`.

```powershell
docker compose up -d
npm install
npm start
```

Ouvrez `http://127.0.0.1:3000/` pour le formulaire et `http://127.0.0.1:3000/admin` pour l’administration. Le serveur crée les tables `candidatures` et `admin_sessions` au démarrage. `CLOUDINARY_URL` doit suivre le format `cloudinary://api_key:api_secret@cloud_name`; garde cette valeur dans `.env` local et dans les secrets Render, jamais dans `.env.example`. Les photos sont téléversées comme ressources Cloudinary authentifiées; seules leurs références sont conservées dans MySQL et les liens privés de l’admin expirent après cinq minutes. Les fichiers sont limités à 2 Mo chacun.

## MySQL installé séparément

Créez la base et un utilisateur avec les permissions nécessaires, puis reportez ces paramètres dans `.env` (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`). Le schéma métier est aussi fourni dans `schema.sql`. Les variables `ADMIN_USERNAME`, `ADMIN_PASSWORD` (12 caractères minimum) et `SESSION_SECRET` (32 caractères minimum) sont obligatoires.

Pour un XAMPP local configuré avec le compte `root` sans mot de passe, `MYSQL_USER=root` et `MYSQL_PASSWORD=` sont acceptés uniquement hors production et uniquement sur `127.0.0.1`. N’utilisez jamais ce compte sans mot de passe en production.

En production, définissez `NODE_ENV=production`, `HOST=0.0.0.0` et, derrière un proxy HTTPS de confiance, `TRUST_PROXY=true`. Le cookie de session devient alors sécurisé. N’utilisez pas les valeurs d’exemple de `.env.example`.

## Render

Le fichier `render.yaml` prépare un service Node Render. Connectez le dépôt à Render et créez le service depuis ce Blueprint. Render ne fournit pas de base MySQL gérée : il faut une instance MySQL distante accessible depuis Render. Renseignez ses paramètres avec TLS si le fournisseur le permet. Ajoutez aussi `CLOUDINARY_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NOTIFICATION_EMAIL` et les secrets SMTP dans Render. `SESSION_SECRET` est généré par Render.

Le dashboard vérifie les nouvelles candidatures toutes les 30 secondes et l’admin peut autoriser les notifications système du navigateur. Pour recevoir les e-mails même lorsque le dashboard est fermé, configurez `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` et `ADMIN_NOTIFICATION_EMAIL`.

## Installation sur téléphone

Le site est une PWA installable depuis le menu du navigateur (ou le bouton « Installer l’application » lorsqu’il est disponible). Le service worker met en cache uniquement l’interface statique; les routes API et les dossiers de candidature ne sont jamais mis en cache. L’installation nécessite HTTPS en production. L’envoi des candidatures reste en ligne.

## Vérification

```powershell
npm test
npm audit
```