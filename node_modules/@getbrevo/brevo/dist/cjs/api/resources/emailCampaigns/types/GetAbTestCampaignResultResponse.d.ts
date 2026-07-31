import type * as Brevo from "../../../index.js";
export interface GetAbTestCampaignResultResponse {
    /** Click rate for current winning version */
    clickRate?: string | undefined;
    clickedLinks?: GetAbTestCampaignResultResponse.ClickedLinks | undefined;
    /** Open rate for current winning version */
    openRate?: string | undefined;
    statistics?: GetAbTestCampaignResultResponse.Statistics | undefined;
    /** Criteria chosen for winning version (Open/Click) */
    winningCriteria?: GetAbTestCampaignResultResponse.WinningCriteria | undefined;
    /** Subject Line of current winning version */
    winningSubjectLine?: string | undefined;
    /** Winning Campaign Info. pending = Campaign has been picked for sending and winning version is yet to be decided, tie = A tie happened between both the versions, notAvailable = Campaign has not yet been picked for sending. */
    winningVersion?: GetAbTestCampaignResultResponse.WinningVersion | undefined;
    /** Open/Click rate for the winner version */
    winningVersionRate?: string | undefined;
}
export declare namespace GetAbTestCampaignResultResponse {
    interface ClickedLinks {
        "Version A": Brevo.AbTestVersionClicks;
        "Version B": Brevo.AbTestVersionClicks;
    }
    interface Statistics {
        clicks: Brevo.AbTestVersionStats;
        complaints: Brevo.AbTestVersionStats;
        hardBounces: Brevo.AbTestVersionStats;
        openers: Brevo.AbTestVersionStats;
        softBounces: Brevo.AbTestVersionStats;
        unsubscribed: Brevo.AbTestVersionStats;
    }
    /** Criteria chosen for winning version (Open/Click) */
    const WinningCriteria: {
        readonly Open: "Open";
        readonly Click: "Click";
    };
    type WinningCriteria = (typeof WinningCriteria)[keyof typeof WinningCriteria];
    /** Winning Campaign Info. pending = Campaign has been picked for sending and winning version is yet to be decided, tie = A tie happened between both the versions, notAvailable = Campaign has not yet been picked for sending. */
    const WinningVersion: {
        readonly NotAvailable: "notAvailable";
        readonly Pending: "pending";
        readonly Tie: "tie";
        readonly A: "A";
        readonly B: "B";
    };
    type WinningVersion = (typeof WinningVersion)[keyof typeof WinningVersion];
}
