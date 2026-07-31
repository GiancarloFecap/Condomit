/**
 * @example
 *     {
 *         pid: "pid",
 *         cid: "cid"
 *     }
 */
export interface GetSubscriptionBalancesRequest {
    /** Loyalty Program Id */
    pid: string;
    /** Contact Id */
    cid: string;
    /** Include balances tied to internal definitions. */
    includeInternal?: boolean;
}
