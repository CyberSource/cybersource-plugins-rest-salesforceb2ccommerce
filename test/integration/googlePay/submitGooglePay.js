var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var chai = require('chai');
var chaiSubset = require('chai-subset');
var jsonHelpers = require('../helpers/jsonUtils');
chai.use(chaiSubset);

/**
 * Test case:
 * should be able to submit an order with billingForm
 */

function addProductAndSubmitGooglePay(creditCard) {
	var cookieJar = request.jar();
	var variantPid1 = '701643421084M';
	var qty1 = 2;
	var addProd = '/Cart-AddProduct';
	var myRequest = {
		url: config.baseUrl + addProd,
		method: 'POST',
		rejectUnauthorized: false,
		resolveWithFullResponse: true,
		jar: cookieJar,
		headers: {
			'X-Requested-With': 'XMLHttpRequest'
		},
		form: {
			pid: variantPid1,
			quantity: qty1
		}
	};
	it('expect to add to cart and submit google payment to succeed', function () {
		return request(myRequest)
			.then(function (addToCartResponse) {
				return addToCart(addToCartResponse, cookieJar, myRequest);
			})
			.then(function (csrfResponse) {
				return submitPaymentGP(csrfResponse, myRequest, creditCard);
			})
	});
}

function addProductAndSubmitGooglePayFromCart(creditCard) {
	var cookieJar = request.jar();
	var variantPid1 = '701643421084M';
	var qty1 = 2;
	var addProd = '/Cart-AddProduct';
	var myRequest = {
		url: config.baseUrl + addProd,
		method: 'POST',
		rejectUnauthorized: false,
		resolveWithFullResponse: true,
		jar: cookieJar,
		headers: {
			'X-Requested-With': 'XMLHttpRequest'
		},
		form: {
			pid: variantPid1,
			quantity: qty1
		}
	};
	it('expect to add to cart and submit google payment to succeed', function () {
		return request(myRequest)
			.then(function (addToCartResponse) {
				return addToCart(addToCartResponse, cookieJar, myRequest);
			})
			.then(function (csrfResponse) {
				return submitGooglePaymentFromCart(csrfResponse, myRequest, creditCard);
			})
	});
}



function addToCart(addToCartResponse, cookieJar, myRequest) {
	assert.equal(addToCartResponse.statusCode, 200, 'Expected add to Cart request statusCode to be 200.');
	cookieString = cookieJar.getCookieString(myRequest.url);
	myRequest.url = config.baseUrl + '/CSRF-Generate';
	var cookie = request.cookie(cookieString);
	cookieJar.setCookie(cookie, myRequest.url);
	// step2 : get cookies, Generate CSRF, then set cookies
	return request(myRequest);
}

function submitPaymentGP(csrfResponse, myRequest, creditCard) {
	var csrfJsonResponse = JSON.parse(csrfResponse.body);

	var gToken = {
		'apiVersionMinor': 0,
		'apiVersion': 2,
		'paymentMethodData': {
			'description': 'Visa1111',
			'tokenizationData': {
				'type': 'PAYMENT_GATEWAY',
				'token': {
					signature: "testSignature",
					protocolVersion: "ECv1",
					signedMessage: {
						"encryptedMessage": "testMessage"
					}
				}
			},
			'type': 'CARD',
			'info': {
				'cardNetwork': 'VISA',
				'cardDetails': '1111'
			}
		},
		'email': 'a@b.com'
	};
	var stringifiedToken = JSON.stringify(gToken);
	// step3 : submit billing request with token aquired in step 2
	myRequest.url = config.baseUrl + '/CheckoutServices-SubmitPaymentGP?' +
		csrfJsonResponse.csrf.tokenName + '=' +
		csrfJsonResponse.csrf.token + '&googletoken=' + stringifiedToken;
	myRequest.form = {
		dwfrm_billing_shippingAddressUseAsBillingAddress: 'true',
		dwfrm_billing_addressFields_firstName: 'John',
		dwfrm_billing_addressFields_lastName: 'Smith',
		dwfrm_billing_addressFields_address1: '10 main St',
		dwfrm_billing_addressFields_address2: '',
		dwfrm_billing_addressFields_country: 'us',
		dwfrm_billing_addressFields_states_stateCode: 'MA',
		dwfrm_billing_addressFields_city: 'burlington',
		dwfrm_billing_addressFields_postalCode: '09876',
		dwfrm_billing_paymentMethod: 'DW_GOOGLE_PAY',
		dwfrm_billing_creditCardFields_cardType: creditCard.type,
		dwfrm_billing_creditCardFields_cardNumber: creditCard.cardNumber,
		dwfrm_billing_creditCardFields_expirationMonth: creditCard.expirationMonth,
		dwfrm_billing_creditCardFields_expirationYear: creditCard.expirationYear,
		dwfrm_billing_creditCardFields_securityCode: creditCard.securityCode,
		dwfrm_billing_contactInfoFields_email: 'blahblah@gmail.com',
		dwfrm_billing_contactInfoFields_phone: '9786543213'
	};
	var ExpectedResBody = {
		locale: 'en_US',
		address: {
			firstName: {
				value: 'John'
			},
			lastName: {
				value: 'Smith'
			},
			address1: {
				value: '10 main St'
			},
			address2: {
				value: null
			},
			city: {
				value: 'burlington'
			},
			stateCode: {
				value: 'MA'
			},
			postalCode: {
				value: '09876'
			},
			countryCode: {
				value: 'us'
			}
		},
		paymentMethod: {
			value: 'DW_GOOGLE_PAY',
			htmlName: 'DW_GOOGLE_PAY'
		},
		email: {
			value: 'blahblah@gmail.com'
		},
		phone: {
			value: '9786543213'
		},
		error: true,
		cartError: true,
		fieldErrors: [],
		serverErrors: [],
		saveCard: false
	};
	return request(myRequest)
		.then(function (response) {
			var bodyAsJson = JSON.parse(response.body);
			var strippedBody = jsonHelpers.deleteProperties(bodyAsJson, ['redirectUrl', 'action', 'queryString']);
			assert.equal(response.statusCode, 200, 'Expected CheckoutServices-SubmitPaymentGP statusCode to be 200.');
			assert.containSubset(strippedBody.address, ExpectedResBody.address, 'Expecting actual response address to be equal match expected response address');
			assert.isFalse(strippedBody.error);
			assert.equal(strippedBody.paymentMethod.value, ExpectedResBody.paymentMethod.value);
		});
}

function submitGooglePaymentFromCart(csrfResponse, myRequest, creditCard) {
	var csrfJsonResponse = JSON.parse(csrfResponse.body);

	var paymentData = {
		'apiVersionMinor': 0,
		'apiVersion': 2,
		'paymentMethodData': {
			'description': 'Visa1111',
			'tokenizationData': {
				'type': 'PAYMENT_GATEWAY',
				'token': {
					signature: "MEUCIA3JrqeML8LLeKKBRAaiAAn/CHiHMMjxANV97I+t7+wqAiEAhAL8qZlLVvA9lot8dxcvDZYf2UkUuah8oxowOnkbvuo=",
					protocolVersion: 'ECv1',
					signedMessage: {
						"encryptedMessage": "testMessage"
					}
				}
			},
			'type': 'CARD',
			'info': {
				'cardNetwork': 'VISA',
				'cardDetails': '1111',
				'billingAddress': {
					'phoneNumber': '9234567890',
					'address3': '',
					'sortingCode': '',
					'address2': '',
					'countryCode': 'us',
					'address1': '9001 amberglen',
					'postalCode': '12345',
					'name': 'John Smith',
					'locality': 'Austin',
					'administrativeArea': 'TX'
				}
			}
		},
		'shippingAddress': {
			'address3': '',
			'sortingCode': '',
			'address2': '',
			'countryCode': 'us',
			'address1': '9001 amberglen',
			'postalCode': '12345',
			'name': 'John Smith',
			'locality': 'Austin',
			'administrativeArea': 'TX'
		},
		'email': 'blahblah@gmail.com'
	}
	var stringifiedToken = JSON.stringify(paymentData);
	// step3 : submit billing request with token aquired in step 2
	myRequest.url = config.baseUrl + '/CheckoutServices-GetGooglePayToken?' +
		csrfJsonResponse.csrf.tokenName + '=' +
		csrfJsonResponse.csrf.token + '&paymentData=' + stringifiedToken;

	var ExpectedResBody = {
		locale: 'en_US',
		address: {
			firstName: {
				value: 'John'
			},
			lastName: {
				value: 'Smith'
			},
			address1: {
				value: '9001 amberglen'
			},
			address2: {
				value: null
			},
			city: {
				value: 'Austin'
			},
			stateCode: {
				value: 'TX'
			},
			postalCode: {
				value: '12345'
			},
			countryCode: {
				value: 'us'
			}
		},
		paymentMethod: {
			value: 'DW_GOOGLE_PAY',
			htmlName: 'DW_GOOGLE_PAY'
		},
		email: {
			value: 'blahblah@gmail.com'
		},
		phone: {
			value: '9234567890'
		},
		error: true,
		cartError: true,
		fieldErrors: [],
		serverErrors: [],
		saveCard: false
	};
	return request(myRequest)
		.then(function (response) {
			var bodyAsJson = JSON.parse(response.body);
			var strippedBody = jsonHelpers.deleteProperties(bodyAsJson, ['redirectUrl', 'action', 'queryString']);
			assert.equal(response.statusCode, 200, 'Expected CheckoutServices-GetGooglePayToken statusCode to be 200.');
		});
}

describe('google pay from checkout', function () {

	describe('positive visa', function () {
		this.timeout(5000);
		var creditCard = {
			type: 'Visa',
			cardNumber: '4111 1111 1111 1111',
			expirationMonth: '03',
			expirationYear: '2025',
			securityCode: '999'
		};
		return addProductAndSubmitGooglePay(creditCard);
	});
});

describe('google pay from cart or minicart', function () {

	describe('positive visa', function () {
		this.timeout(5000);
		var creditCard = {
			type: 'Visa',
			cardNumber: '4111 1111 1111 1111',
			expirationMonth: '03',
			expirationYear: '2025',
			securityCode: '999'
		};
		return addProductAndSubmitGooglePayFromCart(creditCard);
	});
});
