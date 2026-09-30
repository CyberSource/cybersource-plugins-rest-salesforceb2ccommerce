/**
 * *
 * @param {*} result *
 */
function TokenizeCard(result) {
    if (session.getCustomer().isAuthenticated() && result.tokenInformation) {
        var TRLHelper = require('~/cartridge/scripts/helpers/tokenRateLimiterHelper.js');
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Transaction = require('dw/system/Transaction');
        var profile = session.getCustomer().getProfile();
        //@ts-ignore
        var customer = CustomerMgr.getCustomerByCustomerNumber(profile.customerNo);
        var server = require('server');
        var paymentForm = server.forms.getForm('billing');
        // Unified Checkout tokens are NOT rate-limited — the limiter is kept only for the default (Flex)
        // card form. So for a UC save, skip the limiter and treat it as allowed; only the default form is
        // checked here (and has its counter updated below).
        var saveCardUC = paymentForm && !empty(paymentForm.creditCardFields.ucpaymenttoken.htmlValue);
        var isallowed = saveCardUC
            ? { result: true, resetTimer: false, increaseCounter: false }
            : TRLHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer);
        if (isallowed.result) {
            // Check for duplicate  instrument
            //@ts-ignore
            var wallet = customer.profile.wallet;
            var paymentInstruments = wallet.getPaymentInstruments().toArray();
            // eslint-disable-next-line no-undef

            var mapper = require('~/cartridge/scripts/util/mapper.js');
            session.privacy.tokenInformation = mapper.serializeTokenInformation(result.tokenInformation);
            var token = mapper.deserializeTokenInformation(session.privacy.tokenInformation);
            var serializedToken = mapper.serializeTokenInformation(token);
            var duplicateExists;

            var skipFlexCheck = 'flex';
            var tokenInformation = result.tokenInformation;
            if (tokenInformation.customer != null && tokenInformation.customer.id != null) {
                // eslint-disable-next-line no-undef
                session.privacy.tokenInformation = [
                    tokenInformation.instrumentIdentifier.id,
                    tokenInformation.paymentInstrument.id,
                    skipFlexCheck,
                    tokenInformation.customer.id
                ].join('-');
            } else {
                // eslint-disable-next-line no-undef
                session.privacy.tokenInformation = [
                    tokenInformation.instrumentIdentifier.id,
                    tokenInformation.paymentInstrument.id,
                    skipFlexCheck
                ].join('-');
            }

            duplicateExists =
                TRLHelper.checkDuplicateInstrumentIdentifier(
                    //@ts-ignore
                    paymentInstruments,
                    session.privacy.tokenInformation,
                    customer,
                    saveCardUC
                );

            //var duplicateExists = TRLHelper.checkDuplicateInstrumentIdentifier(paymentInstruments, session.privacy.tokenInformation, customer);
            if (!duplicateExists) {
                // eslint-disable-next-line no-shadow
                //var BaseCreditFormProcessor = require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit_form_processor.js');
                //var resultSave = BaseCreditFormProcessor.savePaymentInformation(req, basket, paymentForm);
                var dwOrderPaymentInstrument = require('dw/order/PaymentInstrument');
                var paymentInstrument = {
                    creditCardHolder: paymentForm.addressFields.firstName.value + " " + paymentForm.addressFields.lastName.value,
                    creditCardNumber: paymentForm.creditCardFields.cardNumber.value,
                    creditCardType: paymentForm.creditCardFields.cardType.value,
                    creditCardExpirationMonth: paymentForm.creditCardFields.expirationMonth.value,
                    creditCardExpirationYear: paymentForm.creditCardFields.expirationYear.value
                };
                var name = paymentInstrument.creditCardHolder;
                var cardNumber = paymentInstrument.creditCardNumber;
                var cardType = paymentInstrument.creditCardType;
                var expirationMonth = paymentInstrument.creditCardExpirationMonth;
                var expirationYear = paymentInstrument.creditCardExpirationYear;
                var Token = serializedToken;
                //var resultSave;
                try {
                    Transaction.wrap(function () {
                        var newPaymentInstrument = wallet.createPaymentInstrument(dwOrderPaymentInstrument.METHOD_CREDIT_CARD);
                        newPaymentInstrument.setCreditCardHolder(name);
                        newPaymentInstrument.setCreditCardNumber(cardNumber);
                        newPaymentInstrument.setCreditCardType(cardType);
                        newPaymentInstrument.setCreditCardExpirationMonth(expirationMonth);
                        newPaymentInstrument.setCreditCardExpirationYear(expirationYear);
                        newPaymentInstrument.setCreditCardToken(Token);
                    });
                } catch (error) {

                }

            }
            // Only the default (Flex) form updates the rate-limiter counter; UC is not limited.
            // Reuse isallowed (already computed above) — no need for a second API call.
            if (!saveCardUC) {
                if (isallowed.resetTimer) {
                    TRLHelper.resetTimer(customer);
                }
                if (isallowed.increaseCounter) {
                    TRLHelper.increaseCounter(customer);
                }
            }


        }
    }
}
module.exports.TokenizeCard = TokenizeCard;