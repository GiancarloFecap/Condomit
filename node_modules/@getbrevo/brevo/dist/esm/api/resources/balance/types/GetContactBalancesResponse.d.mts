export interface GetContactBalancesResponse {
    balanceDefinitionId?: string | undefined;
    balances?: GetContactBalancesResponse.Balances.Item[] | undefined;
    count?: number | undefined;
    loyaltyProgramId?: string | undefined;
}
export declare namespace GetContactBalancesResponse {
    type Balances = Balances.Item[];
    namespace Balances {
        interface Item {
            contactId?: number | undefined;
            loyaltySubscriptionId?: string | undefined;
            updatedAt?: string | undefined;
            value?: number | undefined;
        }
    }
}
