const reviewId = new URLSearchParams(window.location.search).get('reviewId');
const ordersBody = document.getElementById('orders');
const statusElement = document.getElementById('status');
const cancelButton = document.getElementById('cancel');
const sendButton = document.getElementById('send');
const reviewRows = [];

function formatReviewAmount(amount) {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} €`;
}

function addCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  row.appendChild(cell);
}

function renderTransactions(transactions, syncedSupplierRefs) {
  for (const [index, transaction] of transactions.entries()) {
	const line = transaction.lines?.[0];
	if (!line) continue;

	const refSupplier = String(transaction.ref_supplier || '').trim();
	const canCheckSync = Boolean(refSupplier);
	const alreadySynced = canCheckSync && syncedSupplierRefs.has(refSupplier.toLowerCase());
	const row = document.createElement('tr');
	const checkboxCell = document.createElement('td');
	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.checked = canCheckSync && !alreadySynced;
	checkbox.disabled = !canCheckSync;
	checkbox.setAttribute('aria-label', `Envoyer ${line.desc}`);
	checkboxCell.appendChild(checkbox);
	row.appendChild(checkboxCell);
	reviewRows.push({ checkbox, index });

	const quantity = Number(line.qty) || 1;
	const unitPrice = Number(line.subprice) || 0;
	const calculatedTotal = unitPrice * quantity;
	const storedTotal = line.total_ht === undefined || line.total_ht === null ? calculatedTotal : Number(line.total_ht);
	const orderTotal = Number.isFinite(storedTotal) ? storedTotal : calculatedTotal;
	const fees = Number((orderTotal - calculatedTotal).toFixed(2));
	const status = !canCheckSync
	  ? 'Référence fournisseur manquante'
	  : alreadySynced ? 'Déjà synchronisée' : 'À synchroniser';

	addCell(row, status, alreadySynced ? 'status-synced' : '');
	addCell(row, transaction._previewOrderId || refSupplier || 'ID non détecté');
	addCell(row, String(transaction._previewDate || transaction.date));
	addCell(row, String(line.desc));
	addCell(row, formatReviewAmount(unitPrice));
	addCell(row, String(quantity));
	addCell(row, formatReviewAmount(orderTotal));
	addCell(row, formatReviewAmount(fees));
	ordersBody.appendChild(row);
  }
}

async function finishReview(selectedIndexes) {
  cancelButton.disabled = true;
  sendButton.disabled = true;
  statusElement.textContent = 'Transmission de la sélection…';
  try {
	const response = await chrome.runtime.sendMessage({
	  action: 'completeTransactionReview',
	  reviewId,
	  selectedIndexes
	});
	if (!response?.success) throw new Error(response?.error || 'Impossible de transmettre la sélection.');
	window.close();
  } catch (error) {
	statusElement.textContent = error.message || 'Impossible de transmettre la sélection.';
	cancelButton.disabled = false;
	sendButton.disabled = false;
  }
}

async function initialize() {
  if (!reviewId) {
	statusElement.textContent = 'Identifiant de vérification manquant.';
	cancelButton.disabled = true;
	sendButton.disabled = true;
	return;
  }

  try {
	let response;
	for (let attempt = 0; attempt < 40; attempt++) {
	  response = await chrome.runtime.sendMessage({ action: 'getTransactionReview', reviewId });
	  if (!response?.success) throw new Error(response?.error || 'Impossible de charger les commandes.');
	  if (Number.isInteger(response.windowId)) break;
	  await new Promise(resolve => setTimeout(resolve, 50));
	}
	if (!Number.isInteger(response?.windowId)) throw new Error('La fenêtre de vérification ne s’est pas initialisée à temps.');
	renderTransactions(response.transactions, new Set(response.syncedSupplierRefs));
  } catch (error) {
	statusElement.textContent = error.message || 'Impossible de charger les commandes.';
	cancelButton.disabled = true;
	sendButton.disabled = true;
  }
}

cancelButton.addEventListener('click', () => finishReview(null));
sendButton.addEventListener('click', () => {
  finishReview(reviewRows.filter(row => row.checkbox.checked).map(row => row.index));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') finishReview(null);
});

initialize();
