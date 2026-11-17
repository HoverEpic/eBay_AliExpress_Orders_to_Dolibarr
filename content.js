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

// Fonction pour extraire les transactions selon le site actif
function extractTransactions() {
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
        socid: 309,
        order_supplier: 1,
        date: formattedDate,
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
  else if (hostname.includes("aliexpress.")) { // SEE https://github.com/su14iman/aliexpress-order-exporter/blob/main/popup.js#L39
    // Sélection des blocs de commandes sur AliExpress
    const orderItems = document.querySelectorAll('.order-item-content-wrap, .order-vou-box, tr.order-item');

    orderItems.forEach(card => {
      // Extraction du titre de l'article
      const titleEl = card.querySelector('.product-title, .order-item-title, span[class*="title"]');
      const title = titleEl ? titleEl.innerText.trim() : "Article AliExpress";

      // Extraction du prix
      const priceEl = card.querySelector('.price-num, .order-price, span[class*="price"]');
      const priceText = priceEl ? priceEl.innerText.replace(/[^0-9,.]/g, '').replace(',', '.') : "0";
      const price = parseFloat(priceText) || 0;

      // Extraction de la date
      const dateEl = card.querySelector('.order-date, .left-block, div[class*="date"]');
      const date = dateEl ? dateEl.innerText.replace(/(\r\n|\n|\r)/gm, " ").trim() : "N/A";

      if (price > 0 || title !== "Article AliExpress") {
        transactions.push({
          socid: 1, // ID du fournisseur par défaut
          type: 0,
          date: Math.floor(Date.now() / 1000),
          note_private: `Achat AliExpress: ${title} - Date: ${date}`,
          lines: [{
            desc: title,
            subprice: price,
            qty: 1,
            total_ht: price
          }]
        });
      }
    });
  }

  return transactions;
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
    
    let csvContent = "data:text/csv;charset=utf-8,orderId;Date;Product;Price\n";
    txs.forEach(t => {
      csvContent += `${t.ref_supplier};${t.date};${t.lines[0].desc};${t.lines[0].subprice}\n`;
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
    const transactions = extractTransactions();
    if (transactions.length === 0) {
      alert("Aucune transaction détectée sur la page.");
      return;
    }

    let successCount = 0;
    for (const tx of transactions) {
      const res = await chrome.runtime.sendMessage({ action: "sendToDolibarr", transaction: tx });
      if (res && res.success) {
        successCount++;
      } else {
        console.error("Erreur API Dolibarr:", res ? res.error : "Erreur inconnue");
      }
    }
    alert(`Synchronisation terminée : ${successCount}/${transactions.length} envoyés à Dolibarr.`);
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