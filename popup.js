const exportButton = document.getElementById('export-csv');
const sendButton = document.getElementById('send-dolibarr');
const statusElement = document.getElementById('status');
const pageDescription = document.getElementById('page-description');
const hidePageButtonsControl = document.getElementById('hide-page-buttons');
const hidePageButtonsStorageKey = 'hideInjectedButtons';

function isSupportedOrdersPage(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();
  if ((hostname === 'www.ebay.fr' || hostname === 'www.ebay.com') && /^\/mye\/myebay\/purchase\/?$/i.test(url.pathname)) {
    return true;
  }

  const isAliExpress = hostname === 'aliexpress.com' || hostname.endsWith('.aliexpress.com');
  return isAliExpress && /^\/(?:p\/)?order\/index\.html?\/?$/i.test(url.pathname);
}

function setError(message) {
  statusElement.textContent = message;
  statusElement.classList.add('error');
  exportButton.disabled = false;
  sendButton.disabled = false;
}

function withTimeout(promise, message, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
	const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
	promise.then(
	  result => {
		clearTimeout(timeoutId);
		resolve(result);
	  },
	  error => {
		clearTimeout(timeoutId);
		reject(error);
	  }
	);
  });
}

function getActiveTab() {
  return withTimeout(new Promise((resolve, reject) => {
	chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
	  if (chrome.runtime.lastError) {
		reject(new Error(chrome.runtime.lastError.message));
		return;
	  }
	  resolve(tabs[0]);
	});
  }), 'Le navigateur ne répond pas. Fermez puis rouvrez le menu de l’extension.');
}

function sendPageAction(tabId, pageAction) {
  return withTimeout(new Promise((resolve, reject) => {
	chrome.tabs.sendMessage(tabId, { action: 'runPageAction', pageAction }, response => {
	  if (chrome.runtime.lastError) {
		reject(new Error(chrome.runtime.lastError.message));
		return;
	  }
	  resolve(response);
	});
  }), 'La page de commandes ne répond pas. Rechargez la page puis réessayez.');
}

function injectContentScript(tabId) {
  return withTimeout(new Promise((resolve, reject) => {
	chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
	  if (chrome.runtime.lastError) {
		reject(new Error(chrome.runtime.lastError.message));
		return;
	  }
	  resolve();
	});
  }), 'Impossible de préparer la page. Rechargez-la puis réessayez.');
}

async function runPageAction(pageAction) {
  exportButton.disabled = true;
  sendButton.disabled = true;
  statusElement.classList.remove('error');
  statusElement.textContent = 'Connexion à la page…';

  try {
	const tab = await getActiveTab();
	if (!tab?.id || !tab.url || !isSupportedOrdersPage(tab.url)) {
	  throw new Error('Ouvrez une page de commandes prise en charge sur eBay ou AliExpress.');
	}

	let response;
	try {
	  response = await sendPageAction(tab.id, pageAction);
	} catch (connectionError) {
	  if (!/receiving end does not exist|could not establish connection/i.test(connectionError.message)) {
		throw connectionError;
	  }
	  statusElement.textContent = 'Préparation de la page…';
	  await injectContentScript(tab.id);
	  response = await sendPageAction(tab.id, pageAction);
	}

	if (!response?.success) throw new Error(response?.error || 'Impossible de lancer cette action sur la page.');
	window.close();
  } catch (error) {
	setError(error.message || 'Impossible de communiquer avec la page de commandes. Rechargez-la puis réessayez.');
  }
}

hidePageButtonsControl.addEventListener('change', () => {
  const shouldHideButtons = hidePageButtonsControl.checked;
  chrome.storage.sync.set({ [hidePageButtonsStorageKey]: shouldHideButtons }, () => {
    if (chrome.runtime.lastError) {
      hidePageButtonsControl.checked = !shouldHideButtons;
      statusElement.textContent = `Impossible d’enregistrer cette option : ${chrome.runtime.lastError.message}`;
      statusElement.classList.add('error');
      return;
    }

    statusElement.classList.remove('error');
    statusElement.textContent = shouldHideButtons
      ? 'Les boutons de page sont masqués.'
      : 'Les boutons de page sont affichés.';
  });
});

chrome.storage.sync.get(hidePageButtonsStorageKey, data => {
  if (chrome.runtime.lastError) {
    statusElement.textContent = `Impossible de lire cette option : ${chrome.runtime.lastError.message}`;
    statusElement.classList.add('error');
    return;
  }
  hidePageButtonsControl.checked = data[hidePageButtonsStorageKey] === true;
});

exportButton.addEventListener('click', () => runPageAction('exportCsv'));
sendButton.addEventListener('click', () => runPageAction('sendDolibarr'));

(async () => {
  try {
	const tab = await getActiveTab();
	if (tab?.url && isSupportedOrdersPage(tab.url)) {
	  pageDescription.textContent = new URL(tab.url).hostname.includes('aliexpress.')
		? 'Actions disponibles sur AliExpress.'
		: 'Actions disponibles sur eBay.';
	  return;
	}
	pageDescription.textContent = 'Ouvrez une page de commandes eBay ou AliExpress prise en charge.';
	exportButton.disabled = true;
	sendButton.disabled = true;
  } catch (error) {
	pageDescription.textContent = 'Impossible de détecter la page active.';
	setError(error.message || 'Impossible de détecter la page active.');
  }
})();
