import { BigNumberInput } from "@medusajs/types"
import { BigNumber } from "@medusajs/utils"

type PaypalCurrencyOptions = {
    // whether the currency supports decimal places, default is true
    decimal?: boolean
    // the number of decimal places the currency supports, default is 2
    places?: number
}

/**
 * The supported paypal currency codes and their options prefering paypal
 * docuementation over ISO-4217.
 * 
 * https://developer.paypal.com/api/rest/reference/currency-codes/#link-currencycodes
 *  
 * https://en.wikipedia.org/wiki/ISO_4217#Active_codes
 */
export const PAYPAL_CURRENCY_CODES = {
    AUD: {},
    BRL: {},
    CAD: {},
    CNY: {},
    CZK: {},
    DKK: {},
    EUR: {},
    HKD: {},
    HUF: { decimal: false },
    ILS: {},
    JPY: { decimal: false },
    MYR: {},
    MXN: {},
    TWD: { decimal: false },
    NZD: {},
    NOK: {},
    PHP: {},
    PLN: {},
    GBP: {},
    RUB: {},
    SGD: {},
    SEK: {},
    CHF: {},
    THB: {},
    USD: {},
} as const;

export type PaypalCurrencyCodes = typeof PAYPAL_CURRENCY_CODES;

type PaypalCurrencyCode = keyof PaypalCurrencyCodes;

/**
 * Converts an amount to the format required by Paypal based on currency.
 * https://developer.paypal.com/docs/api/orders/v2/
 * 
 * @param {BigNumberInput} amount - The amount to be converted.
 * @param {string} currency - The 3-character ISO-4217 currency code
 * 
 * @returns {{ currency_code: string, value: string }} An object containing the
 * amount as a string value and the supported currency code.
 * 
 * @throws {Error} If the currency is not supported by Paypal or if the amount
 * stringification is over the 32 character limit of the Paypal API.
 * 
 * @example
 * const amount = 10;
 * const currency = "usd";
 * const { value, currency_code } = convertAmount(amount, currency);
 * console.log(amountString); // "10.00"
 * console.log(currencyCode); // "USD"
 * 
 */
export function convertAmount(
    amount: BigNumberInput,
    currency: string
): { value: string, currency_code: PaypalCurrencyCode } {
    
    const currency_ = currency.toUpperCase();
    
    if (!(currency_ in PAYPAL_CURRENCY_CODES)) {
        throw new Error(`Currency ${currency} is not supported by Paypal`);
    }
    
    const currency_code = currency_ as PaypalCurrencyCode;
    
    const currencyOptions: PaypalCurrencyOptions = PAYPAL_CURRENCY_CODES[currency_code];

    const precision = currencyOptions?.decimal === false ? 0 : currencyOptions?.places ?? 2;

    const value = new BigNumber(amount, { precision }).numeric.toFixed(precision);

    if (value.length > 32) {
        throw new Error(`Amount string exceeds 32 character limit: ${value}`);
    }

    return { value, currency_code };
}
  