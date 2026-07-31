/**
 * @example
 *     {
 *         pid: "pid",
 *         cid: 1
 *     }
 */
export interface DeleteContactSubscriptionRequest {
    /** Loyalty Program ID. A unique identifier for the loyalty program. */
    pid: string;
    /** Contact ID. */
    cid: number;
}
