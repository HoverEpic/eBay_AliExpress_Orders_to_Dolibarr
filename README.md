# eBay & AliExpress to Dolibarr

Extension Chrome/Edge qui aide à exporter vers Dolibarr les achats affichés sur les pages de commandes eBay et AliExpress. Elle ajoute des boutons pour télécharger les données extraites en CSV ou les envoyer à l’API REST de Dolibarr.

## Fonctionnalités

- Extraction des commandes visibles sur les pages d’achats eBay France/États-Unis et AliExpress prises en charge, avec numéro de commande, date, description, prix et quantité lorsque ces informations sont présentes dans la page.
- Export des données extraites dans un fichier CSV avec prix et quantité.
- Fenêtre séparée de vérification des commandes avant l’envoi, déplaçable sur un autre écran, avec cases à cocher, vérification en direct des références fournisseurs dans les factures de Dolibarr, quantité, prix unitaire, total de commande et frais/écart estimés.
- Envoi des transactions à Dolibarr, actuellement vers l’endpoint des factures fournisseurs (`/api/index.php/supplierinvoices`).
- Page d’options pour configurer l’URL Dolibarr et la clé API, tester la connexion et choisir un tiers fournisseur distinct pour eBay et AliExpress.
- Récupération des tiers fournisseurs depuis Dolibarr ; leurs identifiants sélectionnés sont enregistrés dans la configuration de l’extension.

Les champs et valeurs envoyés à Dolibarr sont définis dans `content.js`. Les identifiants des fournisseurs utilisés pour les factures sont choisis dans les options de l’extension. L’extraction AliExpress suit une approche basée sur la structure des cartes de commande, inspirée par [AliExpress Order Exporter](https://github.com/su14iman/aliexpress-order-exporter), avec une implémentation adaptée à cette extension.

## Installation (mode développeur)

1. Téléchargez ou clonez ce dépôt.
2. Ouvrez la page des extensions de votre navigateur (`chrome://extensions` dans Chrome, ou la page équivalente dans Edge).
3. Activez le **mode développeur**.
4. Cliquez sur **Charger l’extension non empaquetée** et sélectionnez le dossier du projet.
5. Ouvrez les options de l’extension et renseignez l’URL de votre instance Dolibarr ainsi que sa clé API.
6. Cliquez sur **Charger les fournisseurs** et autorisez l’accès au domaine de votre instance Dolibarr lorsque le navigateur le demande.
7. Choisissez un tiers fournisseur pour eBay et un autre pour AliExpress, puis cliquez sur **Enregistrer**.
8. Facultativement, cliquez sur **Tester la connexion** pour vérifier l’accès à l’API.

L’URL configurée doit être la racine de Dolibarr, par exemple `https://votre-serveur.example/dolibarr`, sans ajouter le chemin `/api/index.php`.

## Utilisation

1. Connectez-vous à eBay ou AliExpress et ouvrez une page de commandes prise en charge.
2. Utilisez **Exporter en CSV** pour télécharger les transactions détectées. Pour l’envoi, cliquez sur **Envoyer vers Dolibarr** ; une fenêtre indépendante s’ouvre pour vérifier la liste et cocher les commandes à synchroniser.
3. Les références déjà présentes dans les factures fournisseurs du tiers sélectionné sont décochées par défaut ; vous pouvez les recocher pour les renvoyer.
4. Vérifiez les factures créées dans Dolibarr.

La vérification est effectuée à chaque synchronisation dans Dolibarr et nécessite que les factures fournisseurs soient accessibles via l’API. Une commande sans référence fournisseur détectée ne peut pas être vérifiée ni envoyée. L’extraction dépend aussi de la structure HTML des sites et des commandes affichées sur la page. Vérifiez les informations et les résultats dans Dolibarr avant de vous fier à l’export.

## Sécurité et prérequis

- Une instance Dolibarr accessible depuis le navigateur, avec l’API REST activée et une clé API autorisée à lire les tiers et factures fournisseurs et à en créer.
- Le test de connexion interroge l’endpoint des utilisateurs (`/api/index.php/users?limit=1`) ; la clé doit donc également pouvoir accéder à cet endpoint.
- L’extension demande une autorisation d’accès réseau limitée au domaine Dolibarr configuré, ainsi que l’autorisation de créer la fenêtre indépendante de vérification.
- La clé API et les deux identifiants fournisseurs sont enregistrés dans `chrome.storage.sync`. N’installez l’extension que dans un navigateur et un profil auxquels vous faites confiance.
- Les échanges avec Dolibarr doivent utiliser HTTPS, en particulier lorsque la clé API est transmise.

## Personnalisation

Les pages prises en charge sont déclarées dans `manifest.json`. L’extraction des données et la génération du CSV se trouvent dans `content.js`. La configuration et les sélections de fournisseurs sont dans `options.html` et `options.js`, tandis que le chargement des tiers et l’envoi à l’API sont gérés par `background.js`.

## Licence

Aucune licence n’est actuellement déclarée dans ce dépôt.
