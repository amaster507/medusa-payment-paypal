import PayPalBase from "../core/paypal-base"
import { PaymentProviderKeys } from "../types"

class PayPalProviderService extends PayPalBase {
    static PROVIDER = PaymentProviderKeys.PAYPAL

    constructor(_, options) {
        super(_, options)
    }
}

export default PayPalProviderService