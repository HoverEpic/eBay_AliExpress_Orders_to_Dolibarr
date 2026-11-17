// Tableau de correspondance des mois
const months = {
    'janv.': '01',
    'févr.': '02',
    'mars': '03',
    'avr.': '04',
    'mai': '05',
    'juin': '06',
    'juil.': '07',
    'août': '08',
    'sept.': '09',
    'oct.': '10',
    'nov.': '11',
    'déc.': '12'
}

const hostname = window.location.hostname;

function getAliExpressOrderId(card) {
  const orderElement = card.querySelector('[data-order-id], [class*="order-id"], [class*="orderId"]');
  const dataOrderId = orderElement?.dataset.orderId;
  if (dataOrderId && /^[A-Z0-9-]{6,}$/i.test(dataOrderId.trim())) return dataOrderId.trim();

  const orderLabelPattern = /(?:order\s*(?:id|no\.?|number)|order\s*#|bestellnummer|n[°º]\s*(?:de\s*)?commande|num[eé]ro de commande|n[uú]mero de pedido|订单号)\s*[:：#]?\s*([A-Z0-9-]{6,})/i;
  const elementText = orderElement?.innerText || '';
  const elementMatch = elementText.match(orderLabelPattern);
  if (elementMatch) return elementMatch[1];
  if (/^[A-Z0-9-]{6,}$/i.test(elementText.trim())) return elementText.trim();

  const infoContainer = card.querySelector('.order-item-header-right-info');
  const infoLines = infoContainer ? Array.from(infoContainer.querySelectorAll('div')).map(line => line.innerText.trim()).filter(Boolean) : [];
  for (const line of infoLines) {
    const lineMatch = line.match(orderLabelPattern);
    if (lineMatch) return lineMatch[1];
  }
  const headerId = infoLines[1]?.match(/([0-9]{6,})/);
  if (headerId) return headerId[1];

  const textMatch = card.innerText.match(orderLabelPattern);
  if (textMatch) return textMatch[1];

  for (const link of card.querySelectorAll('a[href]')) {
    try {
      const linkUrl = new URL(link.href);
      const orderId = linkUrl.searchParams.get('orderId') || linkUrl.searchParams.get('order_id');
      if (orderId) return orderId;
    } catch (error) {
      // Ignore malformed page links and try the other order links.
    }
  }

  return null;
}

function parseAliExpressDate(text) {
  const normalizedText = text.trim().replace(/,/g, ' ');
  const isoMatch = normalizedText.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return { date: `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`, timestamp: Math.floor(new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])).getTime() / 1000) };
  }

  const dateMatch = normalizedText.match(/(\d{1,2})[.\-/\s]+([\p{L}.]+|\d{1,2})[.\-/\s]+(\d{4})/u);
  if (!dateMatch) return null;

  const monthNames = {
    jan: 1, januar: 1, january: 1, janvier: 1,
    feb: 2, februar: 2, february: 2, fevr: 2, fevrier: 2,
    mar: 3, maar: 3, maart: 3, march: 3, mars: 3, marz: 3,
    apr: 4, avr: 4, april: 4, avril: 4,
    may: 5, mai: 5,
    jun: 6, juni: 6, june: 6, juin: 6,
    jul: 7, juil: 7, juli: 7, july: 7, juillet: 7,
    aug: 8, august: 8, aout: 8,
    sep: 9, sept: 9, september: 9, septembre: 9,
    oct: 10, oktober: 10, october: 10, octobre: 10,
    nov: 11, november: 11,
    dec: 12, dez: 12, december: 12, decembre: 12
  };
  const monthToken = dateMatch[2].toLowerCase().replace(/\.$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const month = /^\d{1,2}$/.test(monthToken) ? Number(monthToken) : monthNames[monthToken] || monthNames[monthToken.slice(0, 3)];
  const day = Number(dateMatch[1]);
  const year = Number(dateMatch[3]);
  if (!month || month > 12 || day < 1 || day > 31) return null;

  return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, timestamp: Math.floor(new Date(year, month - 1, day).getTime() / 1000) };
}

function parseAliExpressAmount(text) {
  const value = String(text || '').replace(/[^\d.,-]/g, '');
  if (!value) return null;

  const separatorIndex = Math.max(value.lastIndexOf(','), value.lastIndexOf('.'));
  if (separatorIndex < 0) return Number(value);

  const decimalDigits = value.length - separatorIndex - 1;
  const hasBothSeparators = value.includes(',') && value.includes('.');
  if (!hasBothSeparators && decimalDigits === 3) return Number(value.replace(/[.,]/g, ''));

  const normalized = value.slice(0, separatorIndex).replace(/[.,]/g, '') + '.' + value.slice(separatorIndex + 1).replace(/[.,]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

// Fonction pour extraire les transactions selon le site actif
function extractTransactions(supplierIds = {}) {
  const transactions = [];

  // --- TRAITEMENT EBAY ---
  if (hostname.includes("ebay.")) {
    document.querySelectorAll('.m-order-card').forEach(card => {
      let order_link = card.querySelector('.m-ph-card__content-order-info a').href;
      let orderId = order_link.split('?')[1].split('&')[0].replace('orderId=', '');

      let dateStr =  card.querySelector('.m-ph-card__content-order-info .secondaryMessage .primary__item--wrapper span:nth-child(2)')?.innerText || '';
      let raw_date = dateStr.split(' ');
      let day = raw_date[0]
      let month = months[raw_date[1]]
      let year = raw_date[2]
      let formattedDate = `${year}-${month}-${day}`;
      dateStr = Math.floor(new Date(formattedDate).getTime() / 1000)
	    
      let title = card.querySelector('.container-item-col-item-info .title-heading')?.innerText.replace(/;/g, ',') || 'Achat eBay';
	    
      let raw_price = card.querySelector('.m-ph-card__content-order-info .secondaryMessage .BOLD')?.innerText || '0';
      let price = raw_price.replace(/[^0-9,.]/g, '').replace(',', '.');
      let currency = raw_price.split(' ')[1];

        
      transactions.push({
        ref: "auto",
        ref_supplier: orderId,
        socid: supplierIds.ebay,
        order_supplier: 1,
        date: formattedDate,
        _previewOrderId: orderId,
        _previewDate: formattedDate,
        note_private: 'Ajout automatique module eBay & AliExpress to Dolibarr',
        lines: [{
            desc: title,
            subprice: price,
            qty: 1,
            total_ht: price,
            product_type: 1
        }]
        //TODO add frais de ports
    });

    });
  } 
  
  // --- TRAITEMENT ALIEXPRESS ---
  else if (hostname.includes("aliexpress.")) {
    const orderItems = document.querySelectorAll('.order-item');

    orderItems.forEach(card => {
      const infoContainer = card.querySelector('.order-item-header-right-info');
      const infoLines = infoContainer ? Array.from(infoContainer.querySelectorAll('div')).map(line => line.innerText.trim()).filter(Boolean) : [];
      const dateEl = card.querySelector('.order-date, .left-block, div[class*="date"]');
      const dateSource = `${infoLines[0] || ''} ${dateEl?.innerText || ''}`.trim();
      const parsedDate = parseAliExpressDate(dateSource);
      const displayDate = parsedDate?.date || dateEl?.innerText.trim() || 'Date inconnue';
      const orderId = getAliExpressOrderId(card);

      const titleEl = card.querySelector('.order-item-content-info-name [title], .order-item-content-info-name, .order-item-content-info-title, .product-title, .order-item-title, [class*="product-name"]');
      const title = titleEl?.innerText.trim() || titleEl?.getAttribute('title')?.trim() || 'Achat AliExpress';
      const quantityEl = card.querySelector('.order-item-content-info-number-quantity');
      const quantityText = quantityEl?.innerText.replace(/[^\d.,]/g, '').replace(',', '.') || '1';
      const quantity = Math.max(1, Number.parseFloat(quantityText) || 1);
      const unitPriceEl = card.querySelector('.order-item-content-info-number [class*="es--wrap"], .order-item-content-info-number [class*="price"]');
      const totalPriceEl = card.querySelector('.order-item-content-opt-price-total, .order-price, .price-num');
      const displayedUnitPrice = parseAliExpressAmount(unitPriceEl?.innerText || '');
      const displayedTotalPrice = parseAliExpressAmount(totalPriceEl?.innerText || '');
      const price = displayedUnitPrice ?? (displayedTotalPrice !== null ? displayedTotalPrice / quantity : 0);
      const sku = card.querySelector('.order-item-content-info-sku')?.innerText.trim();
      const description = sku ? `${title} - ${sku}` : title;

      if (price > 0 || title !== 'Achat AliExpress') {
        transactions.push({
          socid: supplierIds.aliexpress,
          type: 0,
          date: parsedDate?.timestamp || Math.floor(Date.now() / 1000),
          note_private: `Achat AliExpress: ${description} - Date: ${displayDate}`,
          ...(orderId ? { ref_supplier: orderId } : {}),
          lines: [{
            desc: description,
            subprice: price,
            qty: quantity,
            total_ht: displayedTotalPrice ?? price * quantity
          },{
            desc: "frais port/douane",
            subprice: displayedTotalPrice - (price * quantity),
            qty: 1,
            total_ht: displayedTotalPrice - (price * quantity)
          }],
          _previewOrderId: orderId || 'ID non détecté',
          _previewDate: displayDate
        });
      }
    });
  }

  return transactions;
}

async function showTransactionReview(transactions, syncedSupplierRefs) {
  const reviewId = crypto.randomUUID();
  const response = await chrome.runtime.sendMessage({
    action: 'openTransactionReview',
    reviewId,
    transactions,
    syncedSupplierRefs: [...syncedSupplierRefs]
  });
  if (!response?.success) {
    throw new Error(response?.error || 'Impossible d’ouvrir la fenêtre de vérification.');
  }

  while (true) {
    const result = await chrome.runtime.sendMessage({ action: 'getTransactionReviewResult', reviewId });
    if (!result?.success) {
      throw new Error(result?.error || 'Impossible de récupérer la sélection des commandes.');
    }
    if (result.completed) return result.selectedTransactions;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Boutons d'action sur les pages
function injectButtons() {
  if (document.getElementById("ebay-sync-container")) return;

  const container = document.createElement("div");
  container.id = "ebay-sync-container";
  container.style.cssText = `
    position: fixed;
    bottom: 70px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  // Bouton CSV
  const btnCsv = document.createElement("button");
  btnCsv.innerText = "📥 Exporter en CSV";
  btnCsv.style.cssText = buttonStyle("#0064D2");
  btnCsv.addEventListener("click", () => {
    const txs = extractTransactions();
    if (txs.length === 0) {
      alert("Aucune transaction détectée.");
      return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,orderId;Date;Product;Price;Quantity\n";
    txs.forEach(t => {
      csvContent += `${t.ref_supplier || t._previewOrderId};${t._previewDate || t.date};${t.lines[0].desc};${t.lines[0].subprice};${t.lines[0].qty}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    let filename = `achats_export_${new Date().toISOString().slice(0,10)}.csv`
    if (hostname.includes("ebay.")) {
         filename = `Ebay_export_${new Date().toISOString().slice(0,10)}.csv`
    } else if (hostname.includes("aliexpress.")) {
        filename = `Aliexpress_export_${new Date().toISOString().slice(0,10)}.csv`
    }

    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Bouton Dolibarr
  const btnDoli = document.createElement("button");
  btnDoli.innerText = "🔄 Envoyer vers Dolibarr";
  btnDoli.style.cssText = buttonStyle("#4CAF50");
  btnDoli.addEventListener("click", async () => {
    try {
      const config = await new Promise((resolve, reject) => chrome.storage.sync.get([
        'dolibarr_ebay_supplier_id',
        'dolibarr_aliexpress_supplier_id'
      ], data => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(data);
      }));
      const isEbay = hostname.includes("ebay.");
      const supplierId = Number(isEbay ? config.dolibarr_ebay_supplier_id : config.dolibarr_aliexpress_supplier_id);

      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        alert(`Veuillez configurer le tiers fournisseur ${isEbay ? 'eBay' : 'AliExpress'} dans les options de l’extension.`);
        return;
      }

      const transactions = extractTransactions(isEbay ? { ebay: supplierId } : { aliexpress: supplierId });
      if (transactions.length === 0) {
        alert("Aucune transaction détectée sur la page.");
        return;
      }

      const lookup = await chrome.runtime.sendMessage({ action: 'getSyncedSupplierRefs', supplierId });
      if (!lookup || !lookup.success) {
        throw new Error(lookup?.error || 'Impossible de vérifier les références fournisseur dans Dolibarr.');
      }

      const syncedSupplierRefs = new Set(lookup.invoiceRefs);
      const selectedTransactions = await showTransactionReview(transactions, syncedSupplierRefs);
      if (!selectedTransactions || selectedTransactions.length === 0) return;

      let successCount = 0;
      let failedCount = 0;
      for (const tx of selectedTransactions) {
        const { _previewDate, _previewOrderId, ...transaction } = tx;
        try {
          const response = await chrome.runtime.sendMessage({ action: "sendToDolibarr", transaction });
          if (!response || !response.success) {
            failedCount++;
            console.error("Erreur API Dolibarr:", response ? response.error : "Erreur inconnue");
            continue;
          }

          successCount++;
        } catch (error) {
          failedCount++;
          console.error("Erreur API Dolibarr:", error);
        }
      }

      let summary = `Synchronisation terminée : ${successCount}/${selectedTransactions.length} envoyée(s).`;
      if (failedCount) summary += ` ${failedCount} échec(s), consultez la console pour le détail.`;
      alert(summary);
    } catch (error) {
      console.error("Erreur pendant la préparation de la synchronisation:", error);
      alert(`Impossible de préparer la synchronisation : ${error.message}`);
    }
  });

  container.appendChild(btnCsv);
  container.appendChild(btnDoli);
  document.body.appendChild(container);
}

function buttonStyle(color) {
  return `
    padding: 10px 16px;
    background-color: ${color};
    color: white;
    border: none;
    border-radius: 20px;
    font-size: 13px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  `;
}

window.addEventListener("load", injectButtons);
setInterval(injectButtons, 2000);