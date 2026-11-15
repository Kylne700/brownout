// Ground truth for the demo shop: how many orders does the app itself hold? usage: node orders.mjs <expected>
const want = +process.argv[2];
const orders = await (await fetch(process.env.BROWNOUT_APP_URL + '/api/orders')).json();
console.log(`app holds ${orders.length} order(s), expected ${want}`);
process.exit(orders.length === want ? 0 : 1);
