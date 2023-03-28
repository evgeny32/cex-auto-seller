'use strict';

const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const auth = {
	key: '',
	secret: ''
}
const apiURL = 'https://api.bybit.com';

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
			
			if (data !== null && JSON.stringify(data) !== '{}') {
				req.write(JSON.stringify(data));
			}
			
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

const getSign = (timestamp, method, data) => {
	timestamp = timestamp.toString();
	if (method == 'GET') {
		if (JSON.stringify(data) !== '{}') {
			data = querystring.stringify(data);
		} else {
			data = '';
		}
	}
	
	if (method == 'POST') {
		if (JSON.stringify(data) !== '{}') {
			data = JSON.stringify(data);
		} else {
			data ='';
		}
	}
	
	const signPayload = timestamp + auth.key + 5000 + data;	
	return crypto.createHmac('SHA256', auth.secret).update(signPayload).digest('hex');
}

const sell = async (price, amount) => {
	const timestamp = Date.now();
	const data = {
		category: 'spot',
		symbol: ticker,
		side: 'Sell',
		orderType: 'Limit',
		qty: `${amount}`,
		price: `${price}`,
		timeInForce: 'FOK'
	};
	const signature = getSign(timestamp, 'POST', data);
	
	const resp = await request(`${apiURL}/v5/order/create`,
		{
			method: 'POST',
			headers: {
				'X-BAPI-SIGN': signature,
				'X-BAPI-API-KEY': auth.key,
				'X-BAPI-TIMESTAMP': timestamp,
				'X-BAPI-RECV-WINDOW': 5000,
				'Content-Type': 'application/json; charset=utf-8'
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
			const resp = await request(apiURL + '/v5/market/instruments-info',
				{
					method: 'GET',
					headers: {}
				},
				{
					category: 'spot',
					symbol: ticker
				}
			);			

			if (resp.result.list.length == 0) {
				console.log(`[${getTime()}] ${ticker} not available on exchange`);
				sleep = 1000;
				continue;
			}
			
			if (resp.result.list.length == 1) {
				console.log(`[${getTime()}] ${ticker} status: ${resp.result.list[0].status}`);
			}

			if (resp.result.list[0].status == 'Trading') {
				tickerIsTrading = true;
				sleep = 1000;
			} else {
				sleep = 1000;
				continue;
			}
		}

		if (amount == 0) {
			let timestamp = Date.now().toString();
			let data = {
				accountType: 'spot',
				coin: coin
			};
			let signature = getSign(timestamp, 'GET', data);
			
			const asset = await request(apiURL + '/v5/asset/transfer/query-asset-info',
				{
					method: 'GET',
					headers: {
						'X-BAPI-SIGN': signature,
						'X-BAPI-API-KEY': auth.key,
						'X-BAPI-TIMESTAMP': timestamp,
						'X-BAPI-RECV-WINDOW': 5000
					},
				},
				data
			);
			
			if (asset.result.spot.assets.length == 0) {
				console.log(`[${getTime()}] Waiting to arrive ${coin} on balance`);
				continue;
			} else {
				amount = +asset.result.spot.assets[0].free;
				if (amount > 0) {
					console.log(`[${getTime()}] ${coin} on balance: ${amount}`);
					sleep = 0;
				} else {
					console.log(`[${getTime()}] Waiting to arrive ${coin} on balance`);
					continue;
				}
				
			}
		}
		
			
		price = price - stepPrice;
		price = +price.toFixed(2);
		
		if (price >= minPrice) {
			console.log(`[${getTime()}] Send sell order with price: ${price}; amount to sell ${amount}`);
			const resp = await sell(price, amount);
			
			console.log(resp);
			
			if (resp.retMsg == 'OK') {
				console.log(`[${getTime()}] Order has been sent`);
			}
		} else {
			sleep = 1000;
			price = maxPrice + stepPrice;
			amount = 0;
		}
	}
})();








































