'use strict';

const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const auth = {
	key: '',
	secret: ''
}
const apiURL = 'https://api.binance.com';

const coin = 'ARB';
const ticker = `${coin}USDT`;
const maxPrice = 5;
const minPrice = 1.5;
const stepPrice = 0.2;


const request = (url, options, data = null) => {
	if (options.method == 'GET') {
		if (data !== null && JSON.stringify(data) !== '{}') {
			url += '?' + querystring.stringify(data);
		}
		
		return new Promise((resolve, reject) => {
			let req = https.request(
				`${url}`,
				options,
				(res) => {
					let response = '';
					res.on('data', function(chunk) {
						response += chunk;
					});
					
					res.on('end', function() {
						resolve(JSON.parse(response));
					});
				}
			);
			req.on('error', function(err) {
				reject(err);
			});
			req.end();
		});
	}
	
	if (options.method == 'POST') {
		if (data !== null && JSON.stringify(data) !== '{}') {
			url += '?' + querystring.stringify(data);
		}
		
		return new Promise((resolve, reject) => {
			let req = https.request(
				url,
				options,
				(res) => {
					let response = '';
					res.on('data', function(chunk) {
						response += chunk;
					});
					
					res.on('end', function() {
						resolve(JSON.parse(response));
					});
				}
			);

			req.on('error', function(err) {
				reject(err);
			});
			
			req.end();
		});
	}
	
}

const getTime = () => {
	const timeOptions = {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		fractionalSecondDigits: 3
	};
	
	return new Date().toLocaleString('ru', timeOptions);
}

const getSign = (data) => {
	let params = querystring.stringify(data);
	return crypto.createHmac('SHA256', auth.secret).update(params).digest('hex');
}

const sell = async (price, amount) => {
	const timestamp = Date.now();

	let data = {
		timestamp: timestamp,
		symbol: ticker,
		side: 'SELL',
		type: 'LIMIT',
		price: price,
		quantity: amount,
		timeInForce: 'FOK',
		newOrderRespType: 'FULL',
	};
	
	data.signature = getSign(data);
	
	const resp = await request(`${apiURL}/api/v3/order`,
		{
			method: 'POST',
			headers: {
				'X-MBX-APIKEY': auth.key
			},
		},
		data
	);
	
	return resp;
}

let tickerIsTrading = false;
(async () => {
	let amount = 0;
	let sleep = 0;
	let price = maxPrice + stepPrice;
	while (true) {
		await new Promise(resolve => setTimeout(resolve, sleep));
		
		if (!tickerIsTrading) {
			const resp = await request(apiURL + '/api/v3/exchangeInfo',
				{
					method: 'GET',
					headers: {},
				},
				{symbol: ticker}
			);

			if (resp.hasOwnProperty('code')) {
				console.log(`[${getTime()}] ${ticker} ${resp.msg}`);
				sleep = 5000;
				continue;
			}
			
			if (resp.hasOwnProperty('symbols')) {
				console.log(`[${getTime()}] ${ticker} status: ${resp.symbols[0].status}`);
			}

			if (resp.symbols[0].status == 'TRADING')  {
				tickerIsTrading = true;
				sleep = 0;
			} else {
				sleep = 1000;
				continue;
			}
		}

		if (amount == 0) {
			const timestamp = Date.now();
			const data = {
				timestamp: timestamp,
				asset: coin
			};
			
			data.signature = getSign(data);
			
			const asset = await request(apiURL + '/sapi/v3/asset/getUserAsset',
				{
					method: 'POST',
					headers: {
						'X-MBX-APIKEY': auth.key
					},
				},
				data
			);

			if (asset.length == 0) {
				console.log(`[${getTime()}] Waiting to arrive ${coin} on balance`);
				continue;
			} else {
				amount = +asset[0].free;
				console.log(`[${getTime()}] ${coin} on balance: ${amount}`);
				sleep = 0;
			}
		}
		
		price = price - stepPrice;
		price = +price.toFixed(2);
		console.log(`[${getTime()}] Send sell order with price: ${price}; amount to sell ${amount}`);
		const resp = await sell(price, amount);
		
		if (resp.status == 'EXPIRED') {
			console.log(`[${getTime()}] Order was rejected. Reduce the price`);
			continue;
		}
		
		if (resp.status == 'FILLED') {
			console.log(`[${getTime()}] Order has been executed`);
			console.log(resp);
			amount = 0;
			price = maxPrice + stepPrice;
			sleep = 1000;
		}
	}
})();





