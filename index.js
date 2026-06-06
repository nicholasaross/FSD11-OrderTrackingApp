// Nick's Cafe — dynamic menu + order placement
// Clicking menu cards builds a live "Current Order" that can be adjusted.
// Placing the order snapshots it into a read-only order summary.

const MENU_SOURCES = [
	{ file: "data/meals.json", containerId: "food-menu" },
	{ file: "data/drinks.json", containerId: "drinks-menu" },
];

// Live selection: id -> { item, count } (only entries with count > 0 are kept)
const cart = new Map();
// Per-menu-card badge updaters: id -> render(count)
const menuCardRenderers = new Map();

let orderCounter = 0;

// Helper to get elements by ID without repeating document.getElementById everywhere
// -- thanks EricM!
// (https://github.com/EricM45/Online-Banking-Simulator/blob/main/index.js)
const $ = id => document.getElementById(id);


// Fixed delivery charge applied to every order.
const DELIVERY_CHARGE = 10;
// Accumulating revenue from all completed orders
const orderRevenue = new Map();
let revenue = 0;


function formatPrice(price) {
	return `£${Number(price).toFixed(2)}`;
}

function formatDateTime(date) {
	const d = date.getDate();
	const m = date.getMonth() + 1;
	const y = date.getFullYear();
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	return `${d}/${m}/${y} ${hh}:${mm}`;
}

function getCount(id) {
	const entry = cart.get(id);
	return entry ? entry.count : 0;
}

// Single source of truth: update the selection and refresh everything that
// depends on it (the menu badge, the current-order panel, the button).
function setCount(item, count) {
	if (count <= 0) {
		cart.delete(item.id);
	} else {
		cart.set(item.id, { item, count });
	}
	const render = menuCardRenderers.get(item.id);
	if (render) render(Math.max(0, count));
	renderCurrentOrder();
	updatePlaceOrderButton();
}

function updatePlaceOrderButton() {
	const btn = $("place-order-btn");
	if (btn) btn.disabled = cart.size === 0;
}

// ---- Menu ----

function createMenuCard(item) {
	const col = document.createElement("div");
	col.className = "col";

	const ingredients = (item.ingredients || []).join(", ");

	const button = document.createElement("button");
	button.type = "button";
	button.className = "card menu-card w-100 text-start border-0 p-0";
	button.innerHTML = `
		<div class="card-body d-flex align-items-center gap-3 py-2">
			<div class="flex-grow-1">
				<h6 class="mb-1">${item.name}</h6>
				<small class="text-muted">${ingredients}</small>
			</div>
			<img src="${item.image}" alt="${item.name}" width="56" height="56" class="flex-shrink-0">
			<div class="text-end flex-shrink-0">
				<div class="small text-muted">${formatPrice(item.price)}</div>
				<span class="count-badge badge bg-success rounded-pill d-none">0x</span>
			</div>
		</div>
	`;

	const countBadge = button.querySelector(".count-badge");

	function render(count) {
		if (count > 0) {
			countBadge.textContent = `${count}x`;
			countBadge.classList.remove("d-none");
			button.classList.add("in-order");
		} else {
			countBadge.classList.add("d-none");
			button.classList.remove("in-order");
		}
	}
	menuCardRenderers.set(item.id, render);

	button.addEventListener("click", () => setCount(item, getCount(item.id) + 1));

	col.appendChild(button);
	return col;
}

function renderMenu(items, containerId) {
	const container = $(containerId);
	if (!container) return;

	container.innerHTML = "";
	items.forEach((item) => container.appendChild(createMenuCard(item)));
}

// ---- Current (in-progress) order ----

function renderCurrentOrder() {
	const panel = $("current-order");
	const list = $("current-order-lines");
	const placeholder = $("no-current-order-msg");
	const entries = [...cart.values()].filter((e) => e.count > 0);

	if (entries.length === 0) {
		panel.classList.add("d-none");
		placeholder.classList.remove("d-none");
		list.innerHTML = "";
		return;
	}

	panel.classList.remove("d-none");
	placeholder.classList.add("d-none");

	let total = 0;
	const rows = entries.map(({ item, count }) => {
		total += item.price * count;
		return `
			<li class="list-group-item d-flex justify-content-between align-items-center">
				<span><span class="badge bg-success rounded-pill me-2">${count}x</span>${item.name}</span>
				<span class="d-flex align-items-center gap-2">
					<span>${formatPrice(item.price * count)}</span>
					<button type="button" class="badge bg-danger rounded-pill border-0 cur-dec fw-bold" data-id="${item.id}" title="Remove one ${item.name}">-1</button>
					<button type="button" class="btn btn-outline-danger btn-sm cur-remove fw-bold" data-id="${item.id}" title="Remove all ${item.name}">X</button>
				</span>
			</li>`;
	});
	total += DELIVERY_CHARGE;
	rows.push(`
		<li class="list-group-item d-flex justify-content-between align-items-center">
			<span>Delivery</span>
			<span>${formatPrice(DELIVERY_CHARGE)}</span>
		</li>
		<li class="list-group-item d-flex justify-content-between align-items-center fw-bold">
			<span>Total</span>
			<span>${formatPrice(total)}</span>
		</li>`);
	list.innerHTML = rows.join("");
}

function onCurrentOrderClick(e) {
	const dec = e.target.closest(".cur-dec");
	const rem = e.target.closest(".cur-remove");
	const id = (dec || rem)?.dataset.id;
	if (!id) return;
	const entry = cart.get(id);
	if (!entry) return;
	setCount(entry.item, rem ? 0 : entry.count - 1);
}

// ---- Placed (read-only) orders ----

function removeOrderCard(cardId) {
	const card = $(cardId);
	const container = $("orders-container");
	card.remove();
	if (!container.querySelector(".card")) {
		const msg = document.createElement("p");
		msg.id = "no-orders-msg";
		msg.className = "text-muted";
		msg.textContent =
			"No orders yet — select items from the menu and place an order.";
		container.appendChild(msg);
	}
}

function createOrderCard(orderId, lines) {
	const card = document.createElement("div");
	card.id = `order-${orderId}`;
	card.className = "card order-card";

	let total = 0;
	const lineItems = lines
		.map(({ item, count }) => {
			total += item.price * count;
			return `
			<li class="list-group-item d-flex justify-content-between align-items-center">
				<span><span class="badge bg-primary rounded-pill me-2">${count}x</span>${item.name}</span>
				<span>${formatPrice(item.price * count)}</span>
			</li>`;
		})
		.join("");
	total += DELIVERY_CHARGE;
	orderRevenue.set(orderId, total);

	card.innerHTML = `
		<div class="card-header">
			<div class="d-flex justify-content-between align-items-center">
				<span>Order ID: <strong>${orderId}</strong></span>
				<img src="images/orders.png" width="40" height="40" alt="Order List">
			</div>
			<hr>
			<div class="text-center">${formatDateTime(new Date())}</div>
		</div>
		<div class="card-body">
			<ul class="list-group list-group-flush">
				${lineItems}
				<li class="list-group-item d-flex justify-content-between align-items-center">
					<span>Delivery</span>
					<span>${formatPrice(DELIVERY_CHARGE)}</span>
				</li>
				<li class="list-group-item d-flex justify-content-between align-items-center fw-bold">
					<span>Total</span>
					<span>${formatPrice(total)}</span>
				</li>
			</ul>
		</div>
		<div class="card-footer text-muted">
			<div class="d-flex justify-content-between align-items-center">
				<span>Status: <strong id="order-status-text-${orderId}">In Progress</strong></span>
				<img id="order-status-img-${orderId}" src="images/states/order-confirmed.gif" class="order-status" width="40" height="40" alt="Order Status">
			</div>
			<div id="order-cancel-${orderId}">
			<hr>
			<div class="text-center">
					<button type="button" class="btn-cancel btn btn-danger btn-sm">Cancel Order</button>
				</div>
				</div>
		</div>
	`;

	card.querySelector(".btn-cancel").addEventListener("click", () =>
		removeOrderCard(card.id)
	);
	return card;
}

function placeOrder() {
	const lines = [...cart.values()]
		.filter((e) => e.count > 0)
		.map(({ item, count }) => ({ item, count }));
	if (lines.length === 0) return;

	orderCounter += 1;
	const orderId = `2026050${String(orderCounter).padStart(4, "0")}`;

	const container = $("orders-container");
	const placeholder = $("no-orders-msg");
	if (placeholder) placeholder.remove();
	container.prepend(createOrderCard(orderId, lines));

	// Clear the current order for the next one.
	cart.clear();
	menuCardRenderers.forEach((render) => render(0));
	renderCurrentOrder();
	updatePlaceOrderButton();

	// Simulate the order progressing through various stages with delays in between.
	$(`order-status-img-${orderId}`).src = 'images/states/order-confirmed.gif'
	$(`order-status-text-${orderId}`).innerText = 'Order confirmed'

	orderBeingPrepared(orderId)
	.then((orderId) => orderPrepared(orderId))
	.then((orderId) => orderHandedOver(orderId))
	.then((orderId) => orderOnTheWay(orderId))
	.then((orderId) => orderReachedDestination(orderId))
	.then((orderId) => orderDelivered(orderId))
	.then((orderId) => console.log(`Order ${orderId} processed!`))
	.catch(() => console.log('Something went wrong'))
}

// ---- Bootstrap ----

async function loadMenu() {
	for (const { file, containerId } of MENU_SOURCES) {
		try {
			const response = await fetch(file);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			renderMenu(data.items || [], containerId);
		} catch (err) {
			console.error(`Failed to load menu from ${file}:`, err);
			const container = $(containerId);
			if (container) {
				container.innerHTML = `<p class="text-danger">Unable to load menu items.</p>`;
			}
		}
	}
	updatePlaceOrderButton();
}

document.addEventListener("DOMContentLoaded", () => {
	loadMenu();
	$("place-order-btn").addEventListener("click", placeOrder);
	document
		.getElementById("current-order-lines")
		.addEventListener("click", onCurrentOrderClick);
});

// ---- based on Ankit's code (from OrderTracking/index.js) ----

const orderBeingPrepared = (orderId) => new Promise((resolve, reject) => {
  setTimeout(() => {
    $(`order-status-img-${orderId}`).src = 'images/states/order-being-prepared.gif'
    $(`order-status-text-${orderId}`).innerText = 'Order is being prepared'
    resolve(orderId)
  }, 2000)
})

const orderPrepared = (orderId) => new Promise((resolve, reject) => {
  setTimeout(() => {
	$(`order-cancel-${orderId}`).remove(); // remove the cancel button once the order has been prepared
	
    $(`order-status-img-${orderId}`).src = 'images/states/order-prepared.gif'
    $(`order-status-text-${orderId}`).innerText = 'Order prepared'
    resolve(orderId)
  }, 10000)
})

const orderHandedOver = (orderId) => new Promise((resolve, reject) => {
  setTimeout(() => {
    $(`order-status-img-${orderId}`).src = 'images/states/order-handed-over.gif'
    $(`order-status-text-${orderId}`).innerText = 'Order handed over to the delivery person'
    resolve(orderId)
  }, 5000)
})

const orderOnTheWay = (orderId) => new Promise((resolve, reject) => {
  setTimeout(() => {
    $(`order-status-img-${orderId}`).src = 'images/states/order-on-the-way.gif'
    $(`order-status-text-${orderId}`).innerText = 'Order is on the way'
    resolve(orderId)
  }, 3000)
})

const orderReachedDestination = (orderId) => new Promise((resolve, reject) => {
  setTimeout(() => {
    $(`order-status-img-${orderId}`).src = 'images/states/order-reached-destination.gif'
    $(`order-status-text-${orderId}`).innerText = `Order reached its destination`
    resolve(orderId)
  }, 8000)
})

const orderDelivered = (orderId) => new Promise((resolve, reject) => {
  setTimeout(() => {
    $(`order-status-img-${orderId}`).src = 'images/states/order-delivered.gif'
    $(`order-status-text-${orderId}`).innerText = 'Order has been delivered'
    resolve(orderId)

	revenue += orderRevenue.get(orderId) || 0;
	$("revenue-text").innerText = formatPrice(revenue);

	setTimeout(() => removeOrderCard(`order-${orderId}`), 5000)
  }, 4000)
})
