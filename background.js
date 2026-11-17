async function fetchSupplierInvoiceRefs(url, apikey, supplierId, onProgress = async () => {}) {
  const pageSize = 100;
  const invoiceRefs = new Set();
  let processedInvoices = 0;
  const baseUrl = url.replace(/\/+$/, '');
  const sqlFilters = encodeURIComponent(`(t.fk_soc:=:${supplierId})`);

  for (let page = 0; page < 100; page++) {
    const endpoint = `${baseUrl}/api/index.php/supplierinvoices?limit=${pageSize}&page=${page}&sqlfilters=${sqlFilters}`;
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
      throw new Error('Dolibarr a renvoyé une réponse JSON invalide pour les factures fournisseurs.');
    }

    if (!response.ok) {
      const detail = result?.error?.message || result?.error || result?.message || responseText || response.statusText;
      throw new Error(`Erreur HTTP ${response.status}: ${detail}`);
    }

    if (!Array.isArray(result)) {
      throw new Error('Réponse Dolibarr inattendue : la liste des factures fournisseurs n’est pas un tableau.');
    }

    processedInvoices += result.length;
    for (const invoice of result) {
      const invoiceSupplierId = Number(invoice.socid ?? invoice.fk_soc);
      if (invoiceSupplierId !== supplierId) continue;
      const refSupplier = invoice.ref_supplier;
      if (refSupplier !== undefined && refSupplier !== null && String(refSupplier).trim()) {
        invoiceRefs.add(String(refSupplier).trim().toLowerCase());
      }
    }

    await onProgress({ page: page + 1, processedInvoices });
    if (result.length < pageSize) {
      return [...invoiceRefs];
    }
  }

  throw new Error('Trop de factures fournisseurs pour vérifier les références en une seule opération.');
}

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

const transactionReviewStoragePrefix = 'transactionReview:';
const supplierInvoiceProgressPrefix = 'supplierInvoiceProgress:';

function setSupplierInvoiceProgress(verificationId, progress) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set({
      [`${supplierInvoiceProgressPrefix}${verificationId}`]: progress
    }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getSupplierInvoiceProgress(verificationId) {
  return new Promise((resolve, reject) => {
    const storageKey = `${supplierInvoiceProgressPrefix}${verificationId}`;
    chrome.storage.session.get(storageKey, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result[storageKey]);
    });
  });
}

function isTransactionReviewPage(sender) {
  if (!sender.url) return false;
  try {
    const senderUrl = new URL(sender.url);
    const reviewUrl = new URL(chrome.runtime.getURL('review.html'));
    return senderUrl.origin === reviewUrl.origin && senderUrl.pathname === reviewUrl.pathname;
  } catch (error) {
    return false;
  }
}

function getTransactionReview(reviewId) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(`${transactionReviewStoragePrefix}${reviewId}`, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result[`${transactionReviewStoragePrefix}${reviewId}`]);
    });
  });
}

function removeTransactionReview(reviewId) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(`${transactionReviewStoragePrefix}${reviewId}`, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

chrome.windows.onRemoved.addListener(windowId => {
  chrome.storage.session.get(null, reviews => {
    if (chrome.runtime.lastError) {
      console.error('Impossible de vérifier les fenêtres de validation fermées:', chrome.runtime.lastError.message);
      return;
    }

    for (const [key, review] of Object.entries(reviews)) {
      if (!key.startsWith(transactionReviewStoragePrefix) || review.windowId !== windowId || review.completed) continue;
      chrome.storage.session.set({
        [key]: { ...review, completed: true, selectedTransactions: null }
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Impossible d’enregistrer l’annulation de la validation:', chrome.runtime.lastError.message);
        }
      });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openTransactionReview') {
    (async () => {
      try {
        if (!sender.tab || !Number.isInteger(sender.tab.id) || !/^[\da-f-]{36}$/i.test(request.reviewId || '')) {
          throw new Error('Impossible d’identifier la page de commandes pour ouvrir la vérification.');
        }
        if (!Array.isArray(request.transactions) || !Array.isArray(request.syncedSupplierRefs)) {
          throw new Error('Les données de vérification sont invalides.');
        }

        const storageKey = `${transactionReviewStoragePrefix}${request.reviewId}`;
        await new Promise((resolve, reject) => {
          chrome.storage.session.set({
            [storageKey]: {
              tabId: sender.tab.id,
              transactions: request.transactions,
              syncedSupplierRefs: request.syncedSupplierRefs,
              windowId: null,
              completed: false,
              selectedTransactions: null
            }
          }, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });

        const reviewWindow = await new Promise((resolve, reject) => {
          chrome.windows.create({
            url: `${chrome.runtime.getURL('review.html')}?reviewId=${encodeURIComponent(request.reviewId)}`,
            type: 'popup',
            width: 1500,
            height: 850,
            focused: true
          }, createdWindow => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(createdWindow);
          });
        });

        await new Promise((resolve, reject) => {
          chrome.storage.session.set({
            [storageKey]: {
              tabId: sender.tab.id,
              transactions: request.transactions,
              syncedSupplierRefs: request.syncedSupplierRefs,
              windowId: reviewWindow.id,
              completed: false,
              selectedTransactions: null
            }
          }, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
        sendResponse({ success: true });
      } catch (error) {
        try {
          await removeTransactionReview(request.reviewId);
        } catch (cleanupError) {
          console.error('Impossible de nettoyer les données de vérification après une erreur:', cleanupError);
        }
        sendResponse({ success: false, error: error.message || 'Impossible d’ouvrir la fenêtre de vérification.' });
      }
    })();
    return true;
  }

  if (request.action === 'getTransactionReview') {
    if (!isTransactionReviewPage(sender) || !/^[\da-f-]{36}$/i.test(request.reviewId || '')) {
      sendResponse({ success: false, error: 'Cette page ne peut pas accéder à la vérification des commandes.' });
      return;
    }
    getTransactionReview(request.reviewId).then(review => {
      if (!review) {
        sendResponse({ success: false, error: 'Les données de vérification sont introuvables.' });
        return;
      }
      sendResponse({ success: true, transactions: review.transactions, syncedSupplierRefs: review.syncedSupplierRefs, windowId: review.windowId });
    }).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getTransactionReviewResult') {
    (async () => {
      try {
        if (!sender.tab || !/^[\da-f-]{36}$/i.test(request.reviewId || '')) {
          throw new Error('Cette page ne peut pas récupérer la sélection des commandes.');
        }
        const review = await getTransactionReview(request.reviewId);
        if (!review || sender.tab.id !== review.tabId) {
          throw new Error('Les données de vérification sont introuvables pour cette page.');
        }
        if (!review.completed) {
          sendResponse({ success: true, completed: false });
          return;
        }

        sendResponse({ success: true, completed: true, selectedTransactions: review.selectedTransactions });
        await removeTransactionReview(request.reviewId).catch(error => {
          console.error('Impossible de nettoyer les données de vérification terminée:', error);
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Impossible de récupérer la sélection des commandes.' });
      }
    })();
    return true;
  }

  if (request.action === 'completeTransactionReview') {
    (async () => {
      try {
        if (!isTransactionReviewPage(sender) || !/^[\da-f-]{36}$/i.test(request.reviewId || '')) {
          throw new Error('Cette page ne peut pas terminer la vérification des commandes.');
        }
        const review = await getTransactionReview(request.reviewId);
        if (!review) throw new Error('Les données de vérification sont introuvables.');

        let selectedTransactions = null;
        if (request.selectedIndexes !== null) {
          if (!Array.isArray(request.selectedIndexes) || request.selectedIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= review.transactions.length)) {
            throw new Error('La sélection des commandes est invalide.');
          }
          selectedTransactions = [...new Set(request.selectedIndexes)].map(index => review.transactions[index]);
        }

        const storageKey = `${transactionReviewStoragePrefix}${request.reviewId}`;
        await new Promise((resolve, reject) => {
          chrome.storage.session.set({
            [storageKey]: { ...review, completed: true, selectedTransactions }
          }, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Impossible d’enregistrer la sélection des commandes.' });
      }
    })();
    return true;
  }

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

  if (request.action === 'getSupplierInvoiceVerificationProgress') {
    if (!sender.tab || !/^[\da-f-]{36}$/i.test(request.verificationId || '')) {
      sendResponse({ success: false, error: 'Cette page ne peut pas consulter la progression de vérification.' });
      return;
    }

    const storageKey = `${supplierInvoiceProgressPrefix}${request.verificationId}`;
    chrome.storage.session.get(storageKey, result => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      const progress = result[storageKey];
      if (progress && progress.tabId !== sender.tab.id) {
        sendResponse({ success: false, error: 'Cette vérification appartient à une autre page.' });
        return;
      }
      sendResponse({
        success: true,
        progress: progress || {
          tabId: sender.tab.id,
          page: 0,
          processedInvoices: 0,
          completed: false
        }
      });
      if (progress?.completed) {
        chrome.storage.session.remove(storageKey, () => {
          if (chrome.runtime.lastError) {
            console.error('Impossible de nettoyer la progression de vérification:', chrome.runtime.lastError.message);
          }
        });
      }
    });
    return true;
  }

  if (request.action === 'getSyncedSupplierRefs') {
    if (!sender.tab || !/^[\da-f-]{36}$/i.test(request.verificationId || '')) {
      sendResponse({ success: false, error: 'Identifiant de vérification invalide.' });
      return;
    }

    const verificationId = request.verificationId;
    const tabId = sender.tab.id;
    setSupplierInvoiceProgress(verificationId, {
      tabId,
      page: 0,
      processedInvoices: 0,
      completed: false
    }).then(() => {
      chrome.storage.sync.get(['dolibarr_url', 'dolibarr_apikey'], data => {
        (async () => {
          try {
            if (chrome.runtime.lastError) {
              throw new Error(chrome.runtime.lastError.message);
            }
            if (!data.dolibarr_url || !data.dolibarr_apikey) {
              throw new Error("Configuration Dolibarr manquante. Veuillez configurer l'extension.");
            }

            const supplierId = Number(request.supplierId);
            if (!Number.isInteger(supplierId) || supplierId <= 0) {
              throw new Error('Identifiant de fournisseur invalide.');
            }

            const parsedUrl = new URL(data.dolibarr_url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
              throw new Error('URL Dolibarr invalide. Vérifiez le protocole et le chemin configurés.');
            }

            const invoiceRefs = await fetchSupplierInvoiceRefs(data.dolibarr_url, data.dolibarr_apikey, supplierId, progress =>
              setSupplierInvoiceProgress(verificationId, { tabId, ...progress, completed: false })
            );
            const progress = await getSupplierInvoiceProgress(verificationId);
            await setSupplierInvoiceProgress(verificationId, { ...progress, page: null, completed: true });
            sendResponse({ success: true, invoiceRefs });
          } catch (error) {
            try {
              const progress = await getSupplierInvoiceProgress(verificationId);
              await setSupplierInvoiceProgress(verificationId, { ...progress, tabId, completed: true, error: error.message });
            } catch (progressError) {
              console.error('Impossible de mettre à jour la progression de vérification:', progressError);
            }
            sendResponse({ success: false, error: error.message || 'Impossible de vérifier les factures fournisseurs.' });
          }
        })();
      });
    }).catch(error => sendResponse({ success: false, error: error.message || 'Impossible de démarrer la vérification des factures.' }));
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