import { ModuleProviderExports } from "@medusajs/types"
import { PayPalProviderService } from "./services"

const services = [PayPalProviderService]

const providerExport: ModuleProviderExports = {
  services,
}

export default providerExport
