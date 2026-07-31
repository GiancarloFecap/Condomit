import type * as Brevo from "../../../index.js";
export interface GetLoyaltyOfferProgramsPidRewardsRidResponse {
    /** Maximum number of times a consumer can be attributed this reward */
    attributionPerConsumer?: number | undefined;
    /** Unique identifier for the balance definition */
    balanceDefinitionId?: string | undefined;
    /** Unique code for the reward */
    code?: string | undefined;
    /** Total number of codes generated */
    codeCount?: number | undefined;
    /** Unique identifier for the code generator */
    codeGeneratorId?: string | undefined;
    /** Unique identifier for the code pool */
    codePoolId?: string | undefined;
    /** Configuration settings for the reward */
    config?: string | undefined;
    /** Timestamp when the reward was created */
    createdAt?: string | undefined;
    /** Disabled date of the reward */
    disabledAt?: string | undefined;
    /** End date of the reward validity */
    endDate?: string | undefined;
    /** Expiration date of the reward */
    expirationDate?: string | undefined;
    /** Select startOfPeriod to configure rewards expiry on start of day/week/month/year. Select endOfPeriod to configure reward expiry on end of day/week/month/year, else select noModification */
    expirationModifier?: GetLoyaltyOfferProgramsPidRewardsRidResponse.ExpirationModifier | undefined;
    /** Unit of time for the rewards's availability (e.g., day/week/month/year). */
    expirationUnit?: string | undefined;
    /** Number of days/weeks/month/year for reward expiry */
    expirationValue?: number | undefined;
    /** object */
    generator?: GetLoyaltyOfferProgramsPidRewardsRidResponse.Generator | undefined;
    /** Unique identifier for the reward */
    id?: string | undefined;
    /** Attribution / Redeem Limits for the reward */
    limits?: GetLoyaltyOfferProgramsPidRewardsRidResponse.Limits.Item[] | undefined;
    /** Id of the loyalty program to which the current reward belongs to */
    loyaltyProgramId?: string | undefined;
    /** Additional data for reward definition */
    meta?: Record<string, unknown> | undefined;
    /** Name of the reward */
    name?: string | undefined;
    /** Selected products for reward definition */
    products?: GetLoyaltyOfferProgramsPidRewardsRidResponse.Products.Item[] | undefined;
    /** Public description for the reward */
    publicDescription?: string | undefined;
    /** Public Image for the reward */
    publicImage?: string | undefined;
    /** Public name for the reward */
    publicName?: string | undefined;
    /** Defines the redeem limit for the consumer */
    redeemPerConsumer?: number | undefined;
    /** Rules defined to redeem a reward */
    redeemRules?: string[] | undefined;
    /** object */
    rewardConfigs?: GetLoyaltyOfferProgramsPidRewardsRidResponse.RewardConfigs | undefined;
    /** Rule to define the reward */
    rule?: GetLoyaltyOfferProgramsPidRewardsRidResponse.Rule | undefined;
    /** Start date of attribution of the reward */
    startDate?: string | undefined;
    /** Id of the selected balance while redeeming / attributing a reward */
    subtractBalanceDefinitionId?: string | undefined;
    /** Strategy of the Balance while redeeming / attributing a reward */
    subtractBalanceStrategy?: string | undefined;
    /** Amount of balance to be selected while redeeming / attributing a reward */
    subtractBalanceValue?: number | undefined;
    /** Value to indicate to subtract full balance or not */
    subtractTotalBalance?: boolean | undefined;
    /** Defines the limit to which a consumer can attribute a reward */
    totalAttribution?: number | undefined;
    /** Defines the limit to which a consumer can redeem a reward */
    totalRedeem?: number | undefined;
    /** Id of the Rule to be updated for that reward */
    triggerId?: string | undefined;
    /** Selected unit of the balance */
    unit?: string | undefined;
    /** Timestamp for when this reward was last updated. */
    updatedAt?: string | undefined;
    /** Value of metric in selected config for reward definition */
    value?: number | undefined;
    /** Type of config selected for reward definition */
    valueType?: string | undefined;
}
export declare namespace GetLoyaltyOfferProgramsPidRewardsRidResponse {
    /** Select startOfPeriod to configure rewards expiry on start of day/week/month/year. Select endOfPeriod to configure reward expiry on end of day/week/month/year, else select noModification */
    const ExpirationModifier: {
        readonly StartOfPeriod: "startOfPeriod";
        readonly EndOfPeriod: "endOfPeriod";
        readonly NoModification: "noModification";
    };
    type ExpirationModifier = (typeof ExpirationModifier)[keyof typeof ExpirationModifier];
    interface Generator {
        /** Timestamp when the reward was created */
        createdAt?: string | undefined;
        /** Public facing description of the reward */
        description?: string | undefined;
        /** Unique identifier for the reward */
        id?: string | undefined;
        /** Name of the reward */
        name?: string | undefined;
        /** Generated pattern */
        pattern?: string | undefined;
        /** Timestamp when the reward was created */
        updatedAt?: string | undefined;
    }
    type Limits = Limits.Item[];
    namespace Limits {
        interface Item {
            /** Timestamp when the reward limit was created */
            createdAt?: string | undefined;
            /** Unit of time for the reward limit's availability (e.g., day/week/month/year). */
            durationUnit?: string | undefined;
            /** Number of days/weeks/month/year for reward limit */
            durationValue?: number | undefined;
            /** Value of the limit */
            limitValue?: number | undefined;
            /** Unique identifier for the reward limit */
            rewardLimitId?: string | undefined;
            /** Select true to calculate all redeems/attributions from the previous value of selected durationUnit to the current time */
            slidingSchedule?: boolean | undefined;
            /** Type of reward */
            type?: string | undefined;
            /** Timestamp when the reward limit was created */
            updatedAt?: string | undefined;
        }
    }
    type Products = Products.Item[];
    namespace Products {
        interface Item {
            /** Timestamp when the product was created */
            createdAt?: string | undefined;
            /** URL of the product image */
            imageRef?: string | undefined;
            /** Unique identifier for the product */
            productId?: string | undefined;
            /** string */
            value?: string | undefined;
        }
    }
    interface RewardConfigs {
        /** Attribution config of the reward */
        attribution?: string | undefined;
        /** Code config of the reward */
        code?: string | undefined;
        /** Value config of the reward */
        value?: string | undefined;
    }
    interface Rule {
        /** Selected rule condition */
        condition?: Brevo.RuleConditionResponse | undefined;
        /** Timestamp when the rule was created */
        createdAt?: string | undefined;
        /** Description of the rule */
        description?: string | undefined;
        /** Selected event in the rule */
        event?: Rule.Event | undefined;
        /** Metric to identify if it's an internal rule or not */
        isInternal?: boolean | undefined;
        /** Loyalty Program id to which current rule is associated */
        loyaltyProgramId?: string | undefined;
        /** Loyalty Version id to which current rule is associated */
        loyaltyVersionId?: number | undefined;
        /** Additional data to define the rule */
        meta?: Record<string, unknown> | undefined;
        /** Rule name */
        name?: string | undefined;
        /** Results of the rule definition */
        results?: Rule.Results.Item[] | undefined;
        /** Unique identifier for the rule */
        ruleId?: string | undefined;
        /** Type of the rule */
        ruleType?: string | undefined;
        /** Timestamp when the rule was updated */
        updatedAt?: string | undefined;
    }
    namespace Rule {
        interface Event {
            /** Name of the event */
            name?: string | undefined;
            /** Source of the event */
            source?: string | undefined;
        }
        type Results = Results.Item[];
        namespace Results {
            interface Item {
                /** Action for the defined rule */
                action?: string | undefined;
                /** Parameters to define the reward */
                parameters?: Item.Parameters.Item[] | undefined;
                /** Selected service to define the reward */
                service?: string | undefined;
            }
            namespace Item {
                type Parameters = Parameters.Item[];
                namespace Parameters {
                    interface Item {
                        /** Name of the rule */
                        name?: string | undefined;
                        /** Selected value of the parameter to define the rule */
                        value?: Brevo.ValueResponse | undefined;
                    }
                }
            }
        }
    }
}
