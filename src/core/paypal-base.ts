import { EOL } from "os"
import {
    CreatePaymentProviderSession,
    MedusaContainer,
    PaymentProviderError,
    PaymentProviderSessionResponse,
    ProviderWebhookPayload,
    UpdatePaymentProviderSession,
    WebhookActionResult,
} from "@medusajs/types"
import {
    AbstractPaymentProvider,
    isDefined,
    isPaymentProviderError,
    MedusaError,
    PaymentActions,
    PaymentSessionStatus,
    
} from "@medusajs/utils"
import {
    PaypalOptions,
    PaypalOrder,
    PaypalOrderStatus,
    PurchaseUnits,
} from "../types"
import {
    PaypalSdk,
} from "./paypal-sdk"
import { Logger } from "@medusajs/medusa"
import { CreateOrder, CreateOrderResponse } from "./types"
import { convertAmount } from "./utils/utils"
import { VerifyWebhookSignature } from "./types/webhook"

abstract class PayPalBase extends AbstractPaymentProvider<PaypalOptions> {
    protected readonly options_: PaypalOptions
    protected paypal_: PaypalSdk
    protected container_: MedusaContainer
    protected logger_: Logger

    static validateOptions(options: PaypalOptions): void {
        if (!isDefined(options.clientId)) {
            throw new Error("Required option `clientId` is missing in PayPal plugin")
        }
        if (!isDefined(options.clientSecret)) {
            throw new Error("Required option `clientSecret` is missing in PayPal plugin")
        }
    }

    protected constructor(container: MedusaContainer, options: PaypalOptions) {
        // @ts-ignore
        super(...arguments)

        this.container_ = container
        this.options_ = options
        this.logger_ = this.container_.resolve("logger")

        this.paypal_ = new PaypalSdk({
            ...this.options_,
            logger: this.logger_,
        })
    }

    async getPaymentStatus(
        paymentSessionData: Record<string, unknown>
    ): Promise<PaymentSessionStatus> {
        const order = (await this.retrievePayment(
            paymentSessionData
        )) as PaypalOrder

        switch (order.status) {
            case PaypalOrderStatus.CREATED:
              return PaymentSessionStatus.PENDING
            case PaypalOrderStatus.SAVED:
            case PaypalOrderStatus.APPROVED:
            case PaypalOrderStatus.PAYER_ACTION_REQUIRED:
              return PaymentSessionStatus.REQUIRES_MORE
            case PaypalOrderStatus.VOIDED:
              return PaymentSessionStatus.CANCELED
            case PaypalOrderStatus.COMPLETED:
              return PaymentSessionStatus.AUTHORIZED
            default:
              return PaymentSessionStatus.PENDING
        }
    }

    async initiatePayment(
        input: CreatePaymentProviderSession
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
        const { session_id } = input.context
        const { currency_code, amount } = input

        let sessionData: CreateOrderResponse | undefined

        try {
            const intent: CreateOrder["intent"] = this.options_.capture
                ? "CAPTURE"
                : "AUTHORIZE"

            sessionData = await this.paypal_.createOrder({
                intent,
                purchase_units: [
                    {
                        custom_id: session_id,
                        amount: convertAmount(amount, currency_code)
                    },
                ],
            })
        } catch (e) {
            return this.buildError(
                "An error ocurred in InitiatePayment during the creation of the PayPal payment intent",
                e
            )
        }

        return {
            data: sessionData as unknown as Record<string, unknown>
        }
    }

    async authorizePayment(
        paymentSessionData: Record<string, unknown>,
        context: Record<string, unknown>
    ): Promise<
        | PaymentProviderError
        | {
            status: PaymentSessionStatus
            data: PaymentProviderSessionResponse["data"]
        }
    > {
        try {
            const status = await this.getPaymentStatus(paymentSessionData)
            const data = (await this.retrievePayment(
                paymentSessionData
            )) as PaypalOrder
            return { data, status }
        } catch (error) {
            return this.buildError("An error occurred in authorizePayment", error)
        }
    }

    async cancelPayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
        const order = (await this.retrievePayment(paymentSessionData)) as PaypalOrder

        const isAlreadyCanceled = order.status === PaypalOrderStatus.VOIDED
        const isCanceledAndFullyRefunded = order.status === PaypalOrderStatus.COMPLETED && !!order.invoice_id

        if (isAlreadyCanceled || isCanceledAndFullyRefunded) {
            return order
        }

        try {
            const { purchase_units } = paymentSessionData as {
                purchase_units: PurchaseUnits
            }
            const isAlreadyCaptured = purchase_units.some(
                (pu) => pu.payments.captures?.length
            )

            if (isAlreadyCaptured) {
                const payments = purchase_units[0].payments
                const payId = payments.captures[0].id
                await this.paypal_.refundPayment(payId)
            } else {
                const id = purchase_units[0].payments.authorizations[0].id
                await this.paypal_.cancelAuthorizedPayment(id)
            }

            return (
                await this.retrievePayment(paymentSessionData)
            ) as unknown as PaymentProviderSessionResponse["data"]
        } catch (error) {
            return this.buildError("An error occurred in cancelPayment", error)
        }
    }

    async capturePayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
        const { purchase_units } = paymentSessionData as {
            purchase_units: PurchaseUnits
        }

        const id = purchase_units[0].payments.authorizations[0].id

        try {
            await this.paypal_.captureAuthorizedPayment(id)
            return await this.retrievePayment(paymentSessionData)
        } catch (error) {
            return this.buildError("an error occurred in capturePayment", error)
        }
    }

    /**
     * Paypal does not provide such feature
     * @param paymentSessionData
     */
    async deletePayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
        return paymentSessionData
    }

    async refundPayment(
        paymentSessionData: Record<string, unknown>,
        refundAmount: number
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
        const { purchase_units } = paymentSessionData as {
            purchase_units: PurchaseUnits
        }

        try {
            const purchaseUnit = purchase_units[0]
            const payments = purchaseUnit.payments
            const isAlreadyCaptured = purchase_units.some(
                (pu) => pu.payments.captures?.length
            )

            if (!isAlreadyCaptured) {
                throw new Error("Cannot refund an uncaptured payment")
            }

            const paymentId = payments.captures[0].id
            const currency_code = purchaseUnit.amount.currency_code
            await this.paypal_.refundPayment(paymentId, {
                amount: convertAmount(refundAmount, currency_code)
            })

            return await this.retrievePayment(paymentSessionData)
        } catch (error) {
            return this.buildError("An error occurred in refundPayment", error)
        }
    }

    async retrievePayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse["data"]> {
        try {
            const id = paymentSessionData.id as string
            return (await this.paypal_.getOrder(
                id
            )) as unknown as PaymentProviderSessionResponse["data"]
        } catch (error) {
            this.buildError("An error occurred in retrievePayment", error)
        }
    }

    async updatePayment(
        input: UpdatePaymentProviderSession
    ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
        try {
            const { currency_code, amount } = input
            const id = input.data.id as string

            await this.paypal_.patchOrder(id, [
                {
                    op: "replace",
                    path: "/purchase_units/@reference_id=='default'",
                    value: {
                        amount: convertAmount(amount, currency_code)
                    },
                },
            ])
            return { data: input.data }
        } catch (error) {
            return await this.initiatePayment(input).catch((e) => {
                return this.buildError("An error occurred in updatePayment", error)
            })
        }
    }

    async updatePaymentData(
        sessionId: string,
        data: Record<string, unknown>
    ) {
        try {
            // Prevent from updating the amount from here as it should go
            // through the updatePayment method to perform the correct logic
            if (data.amount) {
                throw new MedusaError(
                    MedusaError.Types.INVALID_DATA,
                    "Cannot update amount, use updatePayment instead"
                )
            }

            return data
        } catch (error) {
            return this.buildError("An error occurred in updatePaymentData", error)
        }
    }

    async retrieveOrderFromAuth(authorization: { links: { rel?: string, href?: string }[] }) {
        const link = authorization.links.find((l) => l.rel === "up")
        const parts = link.href.split("/")
        const orderId = parts[parts.length - 1]

        if (!orderId) {
            return null
        }

        return await this.paypal_.getOrder(orderId)
    }

    async retrieveAuthorization(id: string) {
        return await this.paypal_.getAuthorizationPayment(id)
    }

    protected buildError(
        message: string,
        error: PaymentProviderError | Error
    ): PaymentProviderError {
        return {
            error: message,
            code: "code" in error ? error.code : "unknown",
            detail: isPaymentProviderError(error)
                ? `${error.error}${EOL}${error.detail ?? ""}`
                : "detail" in error
                ? error.detail
                : error.message ?? "",
        }
    }

    /**
     * Checks if a webhook is verified.
     * @param {object} data  - the verification data.
     * @returns 
     */
    async verifyWebhook(data: Exclude<VerifyWebhookSignature, "webhook_id"> & { webhook_id?: string }) {
        return await this.paypal_.verifyWebhook({
            webhook_id: this.options_.auth_webhook_id || this.options_.authWebhookId,
            ...data,
        })
    }

    async getWebhookActionAndData(
        webhookData: ProviderWebhookPayload["payload"]
    ): Promise<WebhookActionResult> {
        const { purchase_units } = webhookData.data as {
            purchase_units: PurchaseUnits
        }

        const purchaseUnit = purchase_units[0]
        const payments = purchaseUnit.payments

        const paymentId = payments.captures[0].id
        const authorizationId = payments.authorizations[0].id
        const amount = parseFloat(purchaseUnit.amount.value)
        const currency_code = purchaseUnit.amount.currency_code


        // FIXME: How to get the event from the webhook data?
        // const event = webhookData. ???
        const event = "unknown" as string

        switch (event) {
            case "authorized":
                return {
                    action: PaymentActions.AUTHORIZED,
                    data: {
                        amount,
                        session_id: authorizationId,
                    },
                }
            case "succeeded":
                return {
                    action: PaymentActions.SUCCESSFUL,
                    data: {
                        amount,
                        session_id: paymentId,
                    },
                }
            case "failed":
                return {
                    action: PaymentActions.FAILED,
                    data: {
                        amount,
                        session_id: paymentId ?? authorizationId,
                    }
                }
            default:
                return { action: PaymentActions.NOT_SUPPORTED }
        }
    }
}

export default PayPalBase