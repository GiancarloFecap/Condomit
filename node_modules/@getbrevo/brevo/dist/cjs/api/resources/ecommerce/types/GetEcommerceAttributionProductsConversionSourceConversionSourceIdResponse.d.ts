export interface GetEcommerceAttributionProductsConversionSourceConversionSourceIdResponse {
    /** List of attributed products */
    products: GetEcommerceAttributionProductsConversionSourceConversionSourceIdResponse.Products.Item[];
}
export declare namespace GetEcommerceAttributionProductsConversionSourceConversionSourceIdResponse {
    type Products = Products.Item[];
    namespace Products {
        interface Item {
            id: string;
            imageUrl?: string | undefined;
            name?: string | undefined;
            ordersCount?: number | undefined;
            price?: number | undefined;
            revenue?: number | undefined;
            sku?: string | undefined;
            url?: string | undefined;
        }
    }
}
