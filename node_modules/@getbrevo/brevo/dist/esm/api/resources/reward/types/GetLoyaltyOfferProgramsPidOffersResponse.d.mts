export interface GetLoyaltyOfferProgramsPidOffersResponse {
    /** Items for the current reward */
    items?: GetLoyaltyOfferProgramsPidOffersResponse.Items.Item[] | undefined;
    /** Count of the associated parameter in current reward */
    totalCount?: number | undefined;
}
export declare namespace GetLoyaltyOfferProgramsPidOffersResponse {
    type Items = Items.Item[];
    namespace Items {
        interface Item {
            /** Timestamp for when this reward was created */
            createdAt?: string | undefined;
            /** Timestamp for when this reward attribution ended */
            endDate?: string | undefined;
            /** Unique identifier for the reward */
            id?: string | undefined;
            /** Loyalty Program to which current reward is associated */
            loyaltyProgramId?: string | undefined;
            /** Name of the reward */
            name?: string | undefined;
            /** Public image of the reward */
            publicImage?: string | undefined;
            /** Timestamp for when this reward attribution started */
            startDate?: string | undefined;
            /** State of the reward */
            state?: string | undefined;
            /** Timestamp for when this reward attribution was updated */
            updatedAt?: string | undefined;
        }
    }
}
