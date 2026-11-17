const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.innerText = message;
  statusEl.style.color = isError ? 'red' : 'green';
  statusEl.style.fontWeight = 'bold';
}

async function testDolibarrConnection() {
  const url = document.getElementById('url').value.trim().replace(/\/+$/, '');
  const apikey = document.getElementById('apikey').value.trim();

  if (!url || !apikey) {
    setStatus('Veuillez renseigner l\'URL et la clé API Dolibarr.', true);
    return;
  }

  setStatus('Test de connexion en cours...');

  try {
    const response = await fetch(`${url}/api/index.php/users?limit=1`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'DOLAPIKEY': apikey
      }
    });

    const responseText = await response.text();
    let message = '';

    try {
      const parsed = JSON.parse(responseText);
      message = parsed?.error || parsed?.message || responseText;
    } catch (e) {
      message = responseText || 'Réponse vide';
    }

    if (response.ok) {
      setStatus('Connexion prête : Dolibarr répond correctement via l\'API.');
      return;
    }

    if (response.status === 401 || response.status === 403) {
      setStatus('Connexion refusée : clé API invalide ou permissions insuffisantes.', true);
      return;
    }

    if (response.status >= 500) {
      setStatus(`Erreur serveur Dolibarr (${response.status}) : ${message}`, true);
      return;
    }

    setStatus(`Connexion impossible (${response.status}) : ${message}`, true);
  } catch (error) {
    setStatus(`Erreur de connexion : ${error.message || 'URL inaccessible.'}`, true);
  }
}

document.getElementById('save').addEventListener('click', () => {
  const url = document.getElementById('url').value.trim().replace(/\/+$/, ''); // Supprime le slash de fin si présent
  const apikey = document.getElementById('apikey').value.trim();

  chrome.storage.sync.set({ dolibarr_url: url, dolibarr_apikey: apikey }, () => {
    setStatus('Configuration enregistrée avec succès !');
    setTimeout(() => { statusEl.innerText = ''; }, 3000);
  });
});

document.getElementById('test-connection').addEventListener('click', testDolibarrConnection);

// Charger les valeurs existantes au démarrage
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['dolibarr_url', 'dolibarr_apikey'], (items) => {
    if (items.dolibarr_url) document.getElementById('url').value = items.dolibarr_url;
    if (items.dolibarr_apikey) document.getElementById('apikey').value = items.dolibarr_apikey;
  });
});