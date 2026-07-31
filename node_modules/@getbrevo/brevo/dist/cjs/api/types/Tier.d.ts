export interface Tier {
    /** Conditions required to access this tier */
    accessConditions?: Tier.AccessConditions.Item[] | undefined;
    createdAt?: string | undefined;
    /** Associated group Id */
    groupId?: string | undefined;
    /** Tier image reference */
    imageRef?: string | undefined;
    /** Associated loyalty program Id */
    loyaltyProgramId?: string | undefined;
    /** Tier name */
    name?: string | undefined;
    /** Tier id */
    tierId?: string | undefined;
    /** Rewards associated with this tier */
    tierRewards?: Tier.TierRewards.Item[] | undefined;
    updatedAt?: string | undefined;
}
export declare namespace Tier {
    type AccessConditions = AccessConditions.Item[];
    namespace AccessConditions {
        interface Item {
            /** Balance definition identifier */
            balanceDefinitionId?: string | undefined;
            createdAt?: string | undefined;
            /** Minimum value required to access this tier */
            minimumValue?: number | undefined;
            updatedAt?: string | undefined;
        }
    }
    type TierRewards = TierRewards.Item[];
    namespace TierRewards {
        interface Item {
            createdAt?: string | undefined;
            /** Reward to be attributed on tier assignment */
            rewardId?: string | undefined;
            updatedAt?: string | undefined;
        }
    }
}
