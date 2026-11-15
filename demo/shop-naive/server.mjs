// Naive demo shop: no retry, no idempotency, no error UI, cart lost on error, crashes on HTML instead of JSON.
import http from 'node:http';

const PORT = +process.env.PORT || 18751;
const products = [{ id: 1, name: 'Mug', price: 12 }];
const cart = [];
const orders = [];

const page = `<!doctype html><meta charset=utf-8><title>Demo shop</title>
<div id=app></div>
<script>
const app = document.getElementById('app');
let cart = [];
const h = (s) => { app.innerHTML = s; };

async function boot() {
  const products = await (await fetch('/api/products')).json();
  h('<h1>Demo shop</h1>' + products.map(p => '<p>' + p.name + ' - $' + p.price +
    ' <button id=add onclick="add(' + p.id + ')">Add ' + p.name.toLowerCase() + ' to cart</button></p>').join(''));
}
async function add(id) {
  await fetch('/api/cart', { method: 'POST', body: JSON.stringify({ id }) });
  h('<h1>Shipping</h1><input id=addr placeholder="Shipping address"> <button id=next onclick="checkout()">Continue</button>');
}
async function checkout() {
  h('');
  const r = await fetch('/api/cart', { signal: AbortSignal.timeout(8000) });
  cart = await r.json();
  show('');
}
function show(msg) {
  h('<h1>Checkout</h1><div id=cart>' + (cart.length ? cart.map(i => '<p>' + i.name + ' x1 - $' + i.price + '</p>').join('') : '<p>Your cart is empty</p>') +
    '</div><button id=pay onclick="pay()">Pay now</button><p id=msg>' + msg + '</p>');
}
async function pay() {
  try {
    const r = await fetch('/api/pay', { method: 'POST' });
    if (!r.ok) throw new Error('bad status');
    await r.json();
    h('<h1>Thank you</h1><p id=done>Order confirmed</p><p><a href="/orders">View your orders</a></p>');
  } catch (e) {
    cart = [];
    show('Payment failed');
  }
}
boot();
</script>`;

const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
const sendJson = (res, code, obj) => send(res, code, 'application/json', JSON.stringify(obj));
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' && path === '/') return send(res, 200, 'text/html', page);
  if (req.method === 'GET' && path === '/api/products') return sendJson(res, 200, products);
  if (req.method === 'GET' && path === '/api/cart') return sendJson(res, 200, cart);
  if (req.method === 'POST' && path === '/api/cart') {
    const { id } = await readBody(req);
    const p = products.find((x) => x.id === id);
    if (p && !cart.length) cart.push(p);
    return sendJson(res, 200, cart);
  }
  if (req.method === 'POST' && path === '/api/pay') {
    orders.push({ id: orders.length + 1, items: cart.map((i) => i.name) });
    return sendJson(res, 200, { orderId: orders.length });
  }
  if (req.method === 'GET' && path === '/api/orders') return sendJson(res, 200, orders);
  if (req.method === 'GET' && path === '/orders') {
    return send(res, 200, 'text/html', `<!doctype html><meta charset=utf-8><title>Orders</title><h1>Your orders</h1>
<p id=count>Orders: ${orders.length}</p><ul>${orders.map((o) => `<li>Order #${o.id}: ${o.items.join(', ')}</li>`).join('')}</ul><p><a href="/">Back to shop</a></p>`);
  }
  send(res, 404, 'text/plain', 'not found');
}).listen(PORT, '127.0.0.1', () => console.log('shop on ' + PORT));
