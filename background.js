chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendToDolibarr") {
    chrome.storage.sync.get(['dolibarr_url', 'dolibarr_apikey'], async (data) => {
      if (!data.dolibarr_url || !data.dolibarr_apikey) {
        sendResponse({ success: false, error: "Configuration Dolibarr manquante. Veuillez configurer l'extension." });
        return;
      }

      // Exemple d'envoi vers l'endpoint des factures fournisseurs ou commandes de Dolibarr
      // Adaptable selon l'objet Dolibarr visé (ex: /supplierinvoices ou /orders)
      const endpoint = `${data.dolibarr_url}/api/index.php/supplierinvoices`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'DOLAPIKEY': data.dolibarr_apikey
          },
          body: JSON.stringify(request.transaction)
        });

        if (response.ok) {
          const result = await response.json();
          sendResponse({ success: true, result });
        } else {
          const errText = await response.text();
          sendResponse({ success: false, error: `Erreur HTTP ${response.status}: ${errText}` });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Indique à Chrome une réponse asynchrone
  }
});