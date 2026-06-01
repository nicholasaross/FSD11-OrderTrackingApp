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

function formatPrice(price) {
	return `$${Number(price).toFixed(2)}`;
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
	const btn = document.getElementById("place-order-btn");
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
				<span class="count-badge badge bg-success rounded-pill d-none">×0</span>
			</div>
		</div>
	`;

	const countBadge = button.querySelector(".count-badge");

	function render(count) {
		if (count > 0) {
			countBadge.textContent = `×${count}`;
			countBadge.classList.remove("d-none");
		} else {
			countBadge.classList.add("d-none");
		}
	}
	menuCardRenderers.set(item.id, render);

	button.addEventListener("click", () => setCount(item, getCount(item.id) + 1));

	col.appendChild(button);
	return col;
}

function renderMenu(items, containerId) {
	const container = document.getElementById(containerId);
	if (!container) return;

	container.innerHTML = "";
	items.forEach((item) => container.appendChild(createMenuCard(item)));
}

// ---- Current (in-progress) order ----

function renderCurrentOrder() {
	const panel = document.getElementById("current-order");
	const list = document.getElementById("current-order-lines");
	const entries = [...cart.values()].filter((e) => e.count > 0);

	if (entries.length === 0) {
		panel.classList.add("d-none");
		list.innerHTML = "";
		return;
	}

	panel.classList.remove("d-none");

	let total = 0;
	const rows = entries.map(({ item, count }) => {
		total += item.price * count;
		return `
			<li class="list-group-item d-flex justify-content-between align-items-center">
				<span><span class="badge bg-success rounded-pill me-2">${count}x</span>${item.name}</span>
				<span class="d-flex align-items-center gap-2">
					<span>${formatPrice(item.price * count)}</span>
					<span class="btn-group btn-group-sm">
						<button type="button" class="btn btn-outline-secondary cur-dec" data-id="${item.id}" title="Remove one ${item.name}">−</button>
						<button type="button" class="btn btn-outline-danger cur-remove" data-id="${item.id}" title="Remove all ${item.name}">×</button>
					</span>
				</span>
			</li>`;
	});
	rows.push(`
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

function removeOrderCard(card) {
	const container = document.getElementById("orders-container");
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
	card.className = "card";
	card.style.width = "25rem";

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

	card.innerHTML = `
		<div class="card-header">Order ID: ${orderId}
			<span class="ms-1">${formatDateTime(new Date())}</span>
			<img src="images/orders.png" width="40" height="40" class="me-2" alt="Orders Icon">
			Order Summary
		</div>
		<div class="card-body">
			<ul class="list-group list-group-flush">
				${lineItems}
				<li class="list-group-item d-flex justify-content-between align-items-center fw-bold">
					<span>Total</span>
					<span>${formatPrice(total)}</span>
				</li>
			</ul>
		</div>
		<div class="card-footer text-muted">Status: In Progress
			<button type="button" class="btn-cancel btn btn-danger btn-sm float-end">Cancel Order</button>
		</div>
	`;

	card.querySelector(".btn-cancel").addEventListener("click", () =>
		removeOrderCard(card)
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

	const container = document.getElementById("orders-container");
	const placeholder = document.getElementById("no-orders-msg");
	if (placeholder) placeholder.remove();
	container.appendChild(createOrderCard(orderId, lines));

	// Clear the current order for the next one.
	cart.clear();
	menuCardRenderers.forEach((render) => render(0));
	renderCurrentOrder();
	updatePlaceOrderButton();
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
			const container = document.getElementById(containerId);
			if (container) {
				container.innerHTML = `<p class="text-danger">Unable to load menu items.</p>`;
			}
		}
	}
	updatePlaceOrderButton();
}

document.addEventListener("DOMContentLoaded", () => {
	loadMenu();
	document.getElementById("place-order-btn").addEventListener("click", placeOrder);
	document
		.getElementById("current-order-lines")
		.addEventListener("click", onCurrentOrderClick);
});
