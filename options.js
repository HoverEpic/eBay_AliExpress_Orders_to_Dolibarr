const statusEl = document.getElementById('status');
const ebaySupplierEl = document.getElementById('ebay-supplier');
const aliexpressSupplierEl = document.getElementById('aliexpress-supplier');
let savedSuppliers = {
  ebay: { id: '', name: '' },
  aliexpress: { id: '', name: '' }
};

function setStatus(message, isError = false) {
  statusEl.innerText = message;
  statusEl.style.color = isError ? 'red' : 'green';
  statusEl.style.fontWeight = 'bold';
}

function getDolibarrSettings() {
  const urlInput = document.getElementById('url').value.trim();
  const apikey = document.getElementById('apikey').value.trim();

  if (!urlInput || !apikey) {
    throw new Error('Veuillez renseigner l\'URL et la clé API Dolibarr.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlInput);
  } catch (error) {
    throw new Error('URL Dolibarr invalide.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('L\'URL doit utiliser HTTP ou HTTPS et ne pas contenir de paramètres ni d’identifiants.');
  }

  return { url: urlInput.replace(/\/+$/, ''), apikey, origin: parsedUrl.origin };
}

function requestDolibarrPermission(origin) {
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

function getResponseMessage(parsed, responseText) {
  const detail = parsed?.error?.message || parsed?.error || parsed?.message || responseText || 'Réponse vide';
  return String(detail).slice(0, 300);
}

function populateSupplierSelect(select, suppliers, savedSupplier) {
  select.replaceChildren(new Option('Sélectionnez un fournisseur...', ''));
  for (const supplier of suppliers) {
    select.add(new Option(supplier.name, String(supplier.id)));
  }

  const savedId = savedSupplier.id ? String(savedSupplier.id) : '';
  if (savedId && !Array.from(select.options).some(option => option.value === savedId)) {
    select.add(new Option(savedSupplier.name || `Fournisseur #${savedId}`, savedId));
  }
  select.value = savedId;
}

async function loadSuppliers() {
  try {
    const { url, apikey, origin } = getDolibarrSettings();
    setStatus('Autorisation d’accès puis chargement des fournisseurs...');
    if (!await requestDolibarrPermission(origin)) {
      throw new Error('Accès au serveur Dolibarr refusé. Autorisez l’accès pour charger les fournisseurs.');
    }

    const response = await chrome.runtime.sendMessage({ action: 'getSuppliers', url, apikey });
    if (!response || !response.success) {
      throw new Error(response?.error || 'Impossible de charger les fournisseurs depuis Dolibarr.');
    }

    populateSupplierSelect(ebaySupplierEl, response.suppliers, savedSuppliers.ebay);
    populateSupplierSelect(aliexpressSupplierEl, response.suppliers, savedSuppliers.aliexpress);

    if (response.suppliers.length === 0) {
      setStatus('Aucun tiers fournisseur trouvé dans Dolibarr.', true);
      return;
    }

    setStatus(`${response.suppliers.length} fournisseur(s) chargé(s). Sélectionnez-en un pour chaque site.`);
  } catch (error) {
    setStatus(error.message || 'Erreur lors du chargement des fournisseurs.', true);
  }
}

async function testDolibarrConnection() {
  try {
    const { url, apikey, origin } = getDolibarrSettings();
    setStatus('Test de connexion en cours...');
    if (!await requestDolibarrPermission(origin)) {
      throw new Error('Accès au serveur Dolibarr refusé.');
    }

    const response = await fetch(`${url}/api/index.php/users?limit=1`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'DOLAPIKEY': apikey
      }
    });

    const responseText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      parsed = null;
    }
    const message = getResponseMessage(parsed, responseText);

    if (response.ok) {
      setStatus('Connexion prête : Dolibarr répond correctement via l\'API.');
      return;
    }

    if (response.status === 401 || response.status === 403) {
      setStatus('Connexion refusée : clé API invalide ou permissions insuffisantes.', true);
      return;
    }

    setStatus(`Erreur Dolibarr (${response.status}) : ${message}`, true);
  } catch (error) {
    setStatus(error.message || 'Erreur de connexion à Dolibarr.', true);
  }
}

async function saveConfiguration() {
  try {
    const { url, apikey, origin } = getDolibarrSettings();
    const ebaySupplierId = Number(ebaySupplierEl.value);
    const aliexpressSupplierId = Number(aliexpressSupplierEl.value);
    const ebaySupplierName = ebaySupplierEl.selectedOptions[0]?.textContent.trim();
    const aliexpressSupplierName = aliexpressSupplierEl.selectedOptions[0]?.textContent.trim();

    if (!Number.isInteger(ebaySupplierId) || ebaySupplierId <= 0 || !Number.isInteger(aliexpressSupplierId) || aliexpressSupplierId <= 0) {
      throw new Error('Chargez les fournisseurs et sélectionnez-en un pour eBay et un pour AliExpress.');
    }

    if (!await requestDolibarrPermission(origin)) {
      throw new Error('L’autorisation d’accès au serveur Dolibarr est nécessaire pour enregistrer cette configuration.');
    }

    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({
        dolibarr_url: url,
        dolibarr_apikey: apikey,
        dolibarr_ebay_supplier_id: ebaySupplierId,
        dolibarr_ebay_supplier_name: ebaySupplierName,
        dolibarr_aliexpress_supplier_id: aliexpressSupplierId,
        dolibarr_aliexpress_supplier_name: aliexpressSupplierName
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });

    savedSuppliers = {
      ebay: { id: ebaySupplierId, name: ebaySupplierName },
      aliexpress: { id: aliexpressSupplierId, name: aliexpressSupplierName }
    };
    setStatus('Configuration enregistrée avec succès !');
  } catch (error) {
    setStatus(error.message || 'Impossible d’enregistrer la configuration.', true);
  }
}

document.getElementById('load-suppliers').addEventListener('click', loadSuppliers);
document.getElementById('save').addEventListener('click', saveConfiguration);
document.getElementById('test-connection').addEventListener('click', testDolibarrConnection);

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get([
    'dolibarr_url',
    'dolibarr_apikey',
    'dolibarr_ebay_supplier_id',
    'dolibarr_ebay_supplier_name',
    'dolibarr_aliexpress_supplier_id',
    'dolibarr_aliexpress_supplier_name'
  ], (items) => {
    if (chrome.runtime.lastError) {
      setStatus(`Erreur de lecture de la configuration : ${chrome.runtime.lastError.message}`, true);
      return;
    }

    if (items.dolibarr_url) document.getElementById('url').value = items.dolibarr_url;
    if (items.dolibarr_apikey) document.getElementById('apikey').value = items.dolibarr_apikey;
    savedSuppliers = {
      ebay: {
        id: items.dolibarr_ebay_supplier_id || '',
        name: items.dolibarr_ebay_supplier_name || ''
      },
      aliexpress: {
        id: items.dolibarr_aliexpress_supplier_id || '',
        name: items.dolibarr_aliexpress_supplier_name || ''
      }
    };
    populateSupplierSelect(ebaySupplierEl, [], savedSuppliers.ebay);
    populateSupplierSelect(aliexpressSupplierEl, [], savedSuppliers.aliexpress);
  });
});