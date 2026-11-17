async function fetchSuppliers(url, apikey) {
  const pageSize = 100;
  const suppliers = [];
  const baseUrl = url.replace(/\/+$/, '');

  for (let page = 0; page < 100; page++) {
    const endpoint = `${baseUrl}/api/index.php/thirdparties?limit=${pageSize}&page=${page}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'DOLAPIKEY': apikey
      }
    });
    const responseText = await response.text();
    let result;

    try {
      result = JSON.parse(responseText);
    } catch (error) {
      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}: ${responseText || response.statusText}`);
      }
      throw new Error('Dolibarr a renvoyé une réponse JSON invalide pour la liste des tiers.');
    }

    if (!response.ok) {
      const detail = result?.error?.message || result?.error || result?.message || responseText || response.statusText;
      throw new Error(`Erreur HTTP ${response.status}: ${detail}`);
    }

    if (!Array.isArray(result)) {
      throw new Error('Réponse Dolibarr inattendue : la liste des tiers n’est pas un tableau.');
    }

    for (const thirdparty of result) {
      const isSupplier = [thirdparty.fournisseur, thirdparty.supplier, thirdparty.supplier_rank]
        .some(value => value === true || Number(value) > 0);
      const id = Number(thirdparty.id);
      const name = thirdparty.name || thirdparty.nom || thirdparty.name_alias || thirdparty.ref;

      if (isSupplier && Number.isInteger(id) && id > 0 && name) {
        suppliers.push({ id, name: String(name) });
      }
    }

    if (result.length < pageSize) {
      return suppliers.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  throw new Error('La liste des tiers est trop volumineuse pour être chargée en une seule opération.');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSuppliers") {
    (async () => {
      try {
        const parsedUrl = new URL(request.url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
          throw new Error('URL Dolibarr invalide. Vérifiez le protocole et le chemin configurés.');
        }
        if (!request.apikey) {
          throw new Error('Veuillez renseigner la clé API Dolibarr.');
        }

        const suppliers = await fetchSuppliers(request.url, request.apikey);
        sendResponse({ success: true, suppliers });
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Impossible de charger les fournisseurs.' });
      }
    })();
    return true;
  }

  if (request.action === "sendToDolibarr") {
    chrome.storage.sync.get(['dolibarr_url', 'dolibarr_apikey'], async (data) => {
      if (!data.dolibarr_url || !data.dolibarr_apikey) {
        sendResponse({ success: false, error: "Configuration Dolibarr manquante. Veuillez configurer l'extension." });
        return;
      }

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
    return true;
  }
});