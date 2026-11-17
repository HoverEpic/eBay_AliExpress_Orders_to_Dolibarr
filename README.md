# eBay & AliExpress to Dolibarr

Extension Chrome/Edge qui aide à exporter vers Dolibarr les achats affichés sur les pages de commandes eBay et AliExpress. Elle ajoute des boutons pour télécharger les données extraites en CSV ou les envoyer à l’API REST de Dolibarr.

## Fonctionnalités

- Extraction des commandes visibles sur les pages d’achats eBay France/États-Unis et AliExpress prises en charge.
- Export des données extraites dans un fichier CSV.
- Envoi des transactions à Dolibarr, actuellement vers l’endpoint des factures fournisseurs (`/api/index.php/supplierinvoices`).
- Page d’options pour configurer l’URL Dolibarr et la clé API, et tester la connexion.

Les champs et valeurs envoyés à Dolibarr sont définis dans `content.js`. Les identifiants de fournisseurs eBay et AliExpress sont actuellement des valeurs par défaut dans le code : adaptez-les à votre installation Dolibarr avant utilisation.

## Installation (mode développeur)

1. Téléchargez ou clonez ce dépôt.
2. Ouvrez la page des extensions de votre navigateur (`chrome://extensions` dans Chrome, ou la page équivalente dans Edge).
3. Activez le **mode développeur**.
4. Cliquez sur **Charger l’extension non empaquetée** et sélectionnez le dossier du projet.
5. Ouvrez les options de l’extension et renseignez l’URL de votre instance Dolibarr ainsi que sa clé API.
6. Cliquez sur **Tester la connexion**, puis enregistrez la configuration.

L’URL configurée doit être la racine de Dolibarr, par exemple `https://votre-serveur.example/dolibarr`, sans ajouter le chemin `/api/index.php`.

## Utilisation

1. Connectez-vous à eBay ou AliExpress et ouvrez une page de commandes prise en charge.
2. Utilisez **Exporter en CSV** pour télécharger les transactions détectées, ou **Envoyer vers Dolibarr** pour les transmettre une par une.
3. Vérifiez les factures créées dans Dolibarr.

L’extraction dépend de la structure HTML des sites et des éléments présents sur la page. Les commandes qui ne sont pas chargées ou affichées ne sont pas forcément détectées. Vérifiez les informations et les résultats dans Dolibarr avant de vous fier à l’export.

## Sécurité et prérequis

- Une instance Dolibarr accessible depuis le navigateur, avec l’API REST activée et une clé API autorisée à créer des factures fournisseurs.
- Le test de connexion interroge l’endpoint des utilisateurs (`/api/index.php/users?limit=1`) ; la clé doit donc également pouvoir accéder à cet endpoint.
- La clé API est enregistrée dans `chrome.storage.sync`. N’installez l’extension que dans un navigateur et un profil auxquels vous faites confiance.
- Les échanges avec Dolibarr doivent utiliser HTTPS, en particulier lorsque la clé API est transmise.

## Personnalisation

Les pages prises en charge sont déclarées dans `manifest.json`. L’extraction des données, les valeurs par défaut et la génération du CSV se trouvent dans `content.js`. La configuration et le test de connexion sont dans `options.html` et `options.js`, tandis que l’envoi à l’API est géré par `background.js`.

## Licence

Aucune licence n’est actuellement déclarée dans ce dépôt.
