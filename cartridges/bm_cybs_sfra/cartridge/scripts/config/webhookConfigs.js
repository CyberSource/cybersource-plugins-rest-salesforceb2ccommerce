'use strict';

// Product/event-type wiring for each BM-managed webhook group. Edit product wiring here.
// notificationEndpoint is the WebhookNotification controller route that receives the callback.
module.exports = {
    fraudManagement: {
        name: 'Fraud Management',
        notificationEndpoint: 'WebhookNotification-dmNotification',
        products: [
            {
                productId: 'decisionManager',
                eventTypes: ['risk.casemanagement.decision.accept', 'risk.casemanagement.decision.reject']
            },
            {
                productId: 'fraudManagementEssentials',
                eventTypes: ['risk.profile.decision.review', 'risk.casemanagement.decision.accept', 'risk.casemanagement.decision.reject']
            }
        ]
    },
    unifiedCheckout: {
        name: 'UC Webhook Events',
        description: 'UC Webhook Events',
        notificationEndpoint: 'WebhookNotification-paymentNotification',
        products: [
            { productId: 'unifiedCheckout', eventTypes: ['uc.orders.transactionresults'] }
        ]
    }
};
